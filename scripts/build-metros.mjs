/**
 * Builds data/<version>/metros.json — the geographic backbone of the app.
 *
 *   node scripts/build-metros.mjs
 *
 * Combines three public-domain federal sources, all snapshotted into
 * data/<version>/sources/ so the build is reproducible offline:
 *
 *   Census CBSA delineation (2023)  county -> metro mapping, names, states
 *   BEA Regional Price Parities     price level by category, by metro (2024)
 *   Census ACS 2024, table S2001    median earnings for a full-time worker
 *
 * The earnings table is fetched from the Census API the first time and cached
 * into sources/ like everything else, so only a fresh release needs a key.
 *
 * Output covers every Metropolitan Statistical Area plus a "rest of <state>"
 * entry per state, so no user can hit a dead end (PROJECT.md D18).
 *
 * MODELLING NOTES:
 *
 *  1. Micropolitan Statistical Areas are excluded. BEA publishes price
 *     parities for metropolitan areas only, and a metro entry without a price
 *     index would silently fall back to national averages. Residents of
 *     micropolitan areas are served by the "rest of <state>" entry.
 *
 *  2. BEA publishes no per-state RURAL price parity — only per-metro and
 *     per-state. "Rest of <state>" therefore uses the STATE-wide parity, which
 *     blends that state's metros back in. This slightly overstates rural cost
 *     of living in states dominated by an expensive metro. Disclosed on the
 *     methodology page.
 *
 *  3. Parities are stored as MULTIPLIERS (index / 100), so 1.06 means 6% above
 *     the national average. This matches the engine's fractions-not-percentages
 *     convention.
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CURRENT_DATASET_VERSION } from './lib/version.mjs';
import { writeDataset } from './lib/write-dataset.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
/** Overridable so a new dated release can be built without editing every script. */
const VERSION = process.env.DATASET_VERSION || CURRENT_DATASET_VERSION;
const DATA_DIR = resolve(HERE, '..', 'data', VERSION);
const SRC = resolve(DATA_DIR, 'sources');
const OUT = resolve(DATA_DIR, 'metros.json');

const RPP_YEAR = '2024';
const CBSA_VINTAGE = 2023;

/** BEA line codes -> our category names. */
const RPP_LINES = {
  1: 'allItems',
  2: 'goods',
  3: 'housing',
  4: 'utilities',
  5: 'otherServices',
};

const STATE_CODES = {
  Alabama: 'AL', Alaska: 'AK', Arizona: 'AZ', Arkansas: 'AR', California: 'CA',
  Colorado: 'CO', Connecticut: 'CT', Delaware: 'DE', Florida: 'FL', Georgia: 'GA',
  Hawaii: 'HI', Idaho: 'ID', Illinois: 'IL', Indiana: 'IN', Iowa: 'IA',
  Kansas: 'KS', Kentucky: 'KY', Louisiana: 'LA', Maine: 'ME', Maryland: 'MD',
  Massachusetts: 'MA', Michigan: 'MI', Minnesota: 'MN', Mississippi: 'MS',
  Missouri: 'MO', Montana: 'MT', Nebraska: 'NE', Nevada: 'NV',
  'New Hampshire': 'NH', 'New Jersey': 'NJ', 'New Mexico': 'NM', 'New York': 'NY',
  'North Carolina': 'NC', 'North Dakota': 'ND', Ohio: 'OH', Oklahoma: 'OK',
  Oregon: 'OR', Pennsylvania: 'PA', 'Rhode Island': 'RI', 'South Carolina': 'SC',
  'South Dakota': 'SD', Tennessee: 'TN', Texas: 'TX', Utah: 'UT', Vermont: 'VT',
  Virginia: 'VA', Washington: 'WA', 'West Virginia': 'WV', Wisconsin: 'WI',
  Wyoming: 'WY', 'District of Columbia': 'DC',
};

// --- minimal CSV reader (handles quoted fields) -----------------------------

function parseCsv(text) {
  const out = [];
  let row = [], field = '', inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(field); field = '';
    } else if (c === '\n') {
      row.push(field); out.push(row); row = []; field = '';
    } else if (c !== '\r') {
      field += c;
    }
  }
  if (field.length || row.length) { row.push(field); out.push(row); }
  return out.filter((r) => r.length > 1);
}

const readCsv = (name) => {
  const rows = parseCsv(readFileSync(resolve(SRC, name), 'utf8'));
  const header = rows[0].map((h) => h.trim());
  return rows.slice(1).map((r) => Object.fromEntries(header.map((h, i) => [h, (r[i] ?? '').trim()])));
};

// --- 1. metro definitions ---------------------------------------------------

const delineation = readCsv('census-cbsa-delineation-2023.csv');

/**
 * Territories are excluded deliberately. Puerto Rico and the other territories
 * have their own income tax systems entirely separate from the federal/state
 * structure this engine models, and BEA publishes no price parities for them.
 * Including them would produce confident, badly wrong answers rather than an
 * honest "not covered".
 */
const EXCLUDED_TERRITORIES = new Set([
  'Puerto Rico', 'Guam', 'American Samoa',
  'United States Virgin Islands', 'Northern Mariana Islands',
]);

const metros = new Map();
const excludedTerritories = new Set();

for (const row of delineation) {
  const code = row['CBSA Code'];
  const type = row['Metropolitan/Micropolitan Statistical Area'];
  if (!code || !/^\d{5}$/.test(code)) continue;
  if (!/^Metropolitan/i.test(type)) continue; // micropolitan excluded — see note 1

  const stateName = row['State Name'];
  if (EXCLUDED_TERRITORIES.has(stateName)) {
    excludedTerritories.add(stateName);
    continue;
  }

  const stateCode = STATE_CODES[stateName];
  if (!stateCode) throw new Error(`unmapped state name: ${stateName}`);

  if (!metros.has(code)) {
    metros.set(code, {
      id: code,
      name: row['CBSA Title'],
      type: 'metro',
      states: [],
      counties: [],
    });
  }

  const m = metros.get(code);
  if (!m.states.includes(stateCode)) m.states.push(stateCode);
  m.counties.push({
    fips: `${row['FIPS State Code']}${row['FIPS County Code']}`,
    name: row['County/County Equivalent'],
    state: stateCode,
    central: row['Central/Outlying County'] === 'Central',
  });
}

// --- 2. price parities ------------------------------------------------------

function loadParities(file, keyOf) {
  const parities = new Map();
  for (const row of readCsv(file)) {
    const category = RPP_LINES[Number(row.LineCode)];
    if (!category) continue;

    const key = keyOf(row);
    if (!key) continue;

    const value = Number(row[RPP_YEAR]);
    if (!Number.isFinite(value)) continue;

    if (!parities.has(key)) parities.set(key, {});
    // Index -> multiplier. 106.2 becomes 1.062.
    parities.get(key)[category] = Number((value / 100).toFixed(4));
  }
  return parities;
}

const metroParities = loadParities('bea-rpp-metro-2024.csv', (r) => {
  const fips = r.GeoFIPS.replace(/["\s]/g, '');
  return /^\d{5}$/.test(fips) && !fips.endsWith('000') && !fips.endsWith('999') ? fips : null;
});

const stateParities = loadParities('bea-rpp-state-2024.csv', (r) => {
  const name = r.GeoName.replace(/\*$/, '').trim();
  return STATE_CODES[name] ?? null;
});

// --- 2b. what a full-time worker earns here ---------------------------------

/**
 * MEDIAN EARNINGS FOR A FULL-TIME, YEAR-ROUND WORKER, PER PLACE.
 *
 * The salary box opened on the US median everywhere, which is a national
 * figure standing in for 438 local ones — and pay is not national. Full-time
 * median earnings run from about $47,000 in the cheapest metros to over
 * $90,000 in the Bay Area, and the site quotes rent and house prices that
 * scale with the salary in the box, so a single national figure was also
 * quoting the wrong home to most people.
 *
 * Table S2001, column C01_013 — the same table and the same line the national
 * default already came from, so the two cannot describe different populations.
 * It is EARNINGS OF ONE FULL-TIME WORKER, deliberately not household income:
 * the box asks what one person is paid, and B19013 would answer a different
 * question with a bigger number.
 *
 * Subject tables live on a different API endpoint from the detailed tables the
 * housing build uses, and they publish metro and state but NOT the metro-state
 * parts. So a metro that straddles a state line gets one figure for both
 * sides, where its rent and home prices are sliced. Disclosed on the data page.
 *
 * Cached into sources/ and committed, like every other upstream file here, so
 * the build stays reproducible with no key and no network.
 */
const ACS_YEAR = 2024;
const EARNINGS_VARIABLE = 'S2001_C01_013E';

async function loadEarnings(cacheFile, forClause) {
  const cachePath = resolve(SRC, cacheFile);
  if (existsSync(cachePath)) return JSON.parse(readFileSync(cachePath, 'utf8'));

  const key = process.env.CENSUS_API_KEY;
  if (!key) {
    throw new Error(
      `CENSUS_API_KEY is not set and no cache exists at ${cacheFile}.\n` +
        'Get a free key at https://api.census.gov/data/key_signup.html, ' +
        'put it in .env.local, and re-run.',
    );
  }

  const url =
    `https://api.census.gov/data/${ACS_YEAR}/acs/acs5/subject` +
    `?get=NAME,${EARNINGS_VARIABLE}` +
    `&for=${encodeURIComponent(forClause)}` +
    `&key=${key}`;

  console.log(`  earnings: fetching ${cacheFile} from Census API...`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Census API ${res.status} for ${cacheFile}: ${await res.text()}`);
  const table = await res.json();
  if (!Array.isArray(table) || table.length < 2) {
    throw new Error(`Census API returned no rows for ${cacheFile}`);
  }
  // Cached without the key anywhere in it.
  writeFileSync(cachePath, `${JSON.stringify(table)}\n`);
  return table;
}

/** [header, ...rows] -> Map(geoid -> dollars), dropping suppressed cells. */
function earningsByGeo(table) {
  const [header, ...rows] = table;
  const value = header.indexOf(EARNINGS_VARIABLE);
  const geo = header.length - 1;
  const out = new Map();
  for (const row of rows) {
    const dollars = Number(row[value]);
    // The Census returns large negative sentinels for suppressed cells.
    if (!Number.isFinite(dollars) || dollars <= 0) continue;
    out.set(row[geo], Math.round(dollars));
  }
  return out;
}

const metroEarnings = earningsByGeo(
  await loadEarnings(
    `census-acs${ACS_YEAR}-earnings-metro.json`,
    'metropolitan statistical area/micropolitan statistical area:*',
  ),
);
const stateEarningsByFips = earningsByGeo(
  await loadEarnings(`census-acs${ACS_YEAR}-earnings-state.json`, 'state:*'),
);

/** State FIPS -> postal code, from the delineation file already loaded. */
const STATE_FIPS = {
  '01': 'AL', '02': 'AK', '04': 'AZ', '05': 'AR', '06': 'CA', '08': 'CO', '09': 'CT',
  '10': 'DE', '11': 'DC', '12': 'FL', '13': 'GA', '15': 'HI', '16': 'ID', '17': 'IL',
  '18': 'IN', '19': 'IA', '20': 'KS', '21': 'KY', '22': 'LA', '23': 'ME', '24': 'MD',
  '25': 'MA', '26': 'MI', '27': 'MN', '28': 'MS', '29': 'MO', '30': 'MT', '31': 'NE',
  '32': 'NV', '33': 'NH', '34': 'NJ', '35': 'NM', '36': 'NY', '37': 'NC', '38': 'ND',
  '39': 'OH', '40': 'OK', '41': 'OR', '42': 'PA', '44': 'RI', '45': 'SC', '46': 'SD',
  '47': 'TN', '48': 'TX', '49': 'UT', '50': 'VT', '51': 'VA', '53': 'WA', '54': 'WV',
  '55': 'WI', '56': 'WY',
};
const stateEarnings = new Map();
for (const [fips, dollars] of stateEarningsByFips) {
  const code = STATE_FIPS[fips];
  if (code) stateEarnings.set(code, dollars);
}

// --- 3. assemble ------------------------------------------------------------

/** "Chicago-Naperville-Elgin, IL-IN" -> { short: "Chicago, IL", primary: "IL" } */
function shorten(title) {
  const [placePart, statePart = ''] = title.split(',').map((s) => s.trim());
  const city = placePart.split('-')[0].trim();
  const state = statePart.split('-')[0].trim();
  return { short: state ? `${city}, ${state}` : city, primaryState: state };
}

const output = {};
const dropped = [];

for (const [code, m] of [...metros].sort((a, b) => a[0].localeCompare(b[0]))) {
  const parity = metroParities.get(code);
  if (!parity || Object.keys(parity).length !== 5) {
    dropped.push(`${code} ${m.name}`);
    continue;
  }

  const { short, primaryState } = shorten(m.name);
  m.counties.sort((a, b) => Number(b.central) - Number(a.central) || a.name.localeCompare(b.name));

  output[code] = {
    id: code,
    name: m.name,
    shortName: short,
    type: 'metro',
    states: m.states,
    primaryState: primaryState || m.states[0],
    counties: m.counties,
    priceParity: parity,
    /*
     * Falls back to the metro's primary state where the Census suppressed the
     * metro cell — a real published figure for a wider area, rather than a
     * blank the interface would have to invent something for.
     */
    medianEarnings:
      metroEarnings.get(code) ?? stateEarnings.get(primaryState || m.states[0]) ?? null,
  };
}

// "Rest of <state>" fallbacks so nobody hits a dead end.
for (const [stateName, stateCode] of Object.entries(STATE_CODES)) {
  const parity = stateParities.get(stateCode);
  if (!parity) { dropped.push(`rest-of-${stateCode} (no state parity)`); continue; }

  const id = `rest-of-${stateCode}`;
  output[id] = {
    id,
    name: `Rest of ${stateName}`,
    shortName: `Rest of ${stateName}`,
    type: 'restOfState',
    states: [stateCode],
    primaryState: stateCode,
    counties: [],
    priceParity: parity,
    medianEarnings: stateEarnings.get(stateCode) ?? null,
    note: 'Uses statewide price parities. BEA publishes no rural-only index, so this blends the state\'s metros back in and may slightly overstate rural costs.',
  };
}

// --- 4. sanity checks: fail loudly rather than emit a corrupt dataset --------

const entries = Object.values(output);
const metroCount = entries.filter((m) => m.type === 'metro').length;
const restCount = entries.filter((m) => m.type === 'restOfState').length;

if (metroCount < 370 || metroCount > 400) throw new Error(`implausible metro count: ${metroCount}`);
if (restCount !== 51) throw new Error(`expected 51 rest-of-state entries, got ${restCount}`);

/**
 * Plausible bounds per category. Housing varies far more than anything else —
 * from roughly 47% of national in the cheapest rural metros to well over 200%
 * in the Bay Area — so a single blanket range would either reject real data or
 * wave through corrupt data. Bounds sized to catch a parsing error (a stray
 * factor of 10, an index stored unscaled) rather than to second-guess BEA.
 */
const PARITY_BOUNDS = {
  allItems: [0.75, 1.45],
  goods: [0.80, 1.35],
  housing: [0.35, 2.75],
  utilities: [0.55, 1.95],
  otherServices: [0.70, 1.50],
};

for (const m of entries) {
  for (const [cat, v] of Object.entries(m.priceParity)) {
    const [lo, hi] = PARITY_BOUNDS[cat] ?? [0.3, 3.0];
    if (!Number.isFinite(v) || v < lo || v > hi) {
      throw new Error(`${m.id} ${m.name}: implausible ${cat} parity ${v} (expected ${lo}–${hi})`);
    }
  }
  if (!m.primaryState) throw new Error(`${m.id}: no primary state`);
  if (m.type === 'metro' && m.counties.length === 0) throw new Error(`${m.id}: no counties`);
}

for (const id of ['16980', '12420', '35620', '31080', '41860']) {
  if (!output[id]) throw new Error(`expected major metro ${id} missing`);
}

// --- 5. emit ----------------------------------------------------------------

// Counties are needed by the /data page but never by the calculation engine,
// and they are 70% of the file. Splitting them keeps the client bundle small.
const counties = {};
for (const m of entries) {
  if (m.counties.length) counties[m.id] = m.counties;
  delete m.counties;
}
writeDataset(
  resolve(DATA_DIR, 'metros-counties.json'),
  `${JSON.stringify({ datasetVersion: VERSION, byMetro: counties }, null, 2)}\n`,
);

writeDataset(
  OUT,
  `${JSON.stringify(
    {
      datasetVersion: VERSION,
      vintage: { cbsaDelineation: CBSA_VINTAGE, beaPriceParities: Number(RPP_YEAR) },
      sources: [
        {
          name: 'Census Bureau, Core Based Statistical Area delineation files',
          url: 'https://www2.census.gov/programs-surveys/metro-micro/geographies/reference-files/2023/delineation-files/list1_2023.xlsx',
          licence: 'US Government work — public domain',
          snapshot: `data/${VERSION}/sources/census-cbsa-delineation-2023.csv`,
        },
        {
          name: 'Bureau of Economic Analysis, Regional Price Parities (metro and state)',
          url: 'https://apps.bea.gov/regional/downloadzip.htm',
          licence: 'US Government work — public domain',
          snapshot: `data/${VERSION}/sources/bea-rpp-metro-2024.csv`,
        },
        {
          name: `Census Bureau, ACS ${ACS_YEAR} 5-year, table S2001 — median earnings for full-time, year-round workers`,
          url: `https://api.census.gov/data/${ACS_YEAR}/acs/acs5/subject`,
          licence: 'US Government work — public domain',
          snapshot: `data/${VERSION}/sources/census-acs${ACS_YEAR}-earnings-metro.json`,
        },
      ],
      limitations: [
        'Micropolitan statistical areas are excluded because BEA publishes no price parities for them. Their residents are served by the "rest of <state>" entries.',
        'BEA publishes no rural-only price parity, so "rest of <state>" uses statewide figures, which blend that state\'s metros back in.',
        `Price parities are ${RPP_YEAR} data, the latest published.`,
        'US territories (Puerto Rico and others) are excluded: they have separate income tax systems and no BEA price parities.',
        `Median earnings are for one full-time, year-round worker, not for a household. They are ${ACS_YEAR} figures and the app states them in today's money.`,
        'The Census publishes median earnings for whole metros and for states, but not for the part of a metro inside one state — so the 43 metros that cross a state line carry one earnings figure for both sides, where their rent and home prices are sliced by state.',
      ],
      metros: output,
    },
    null,
    2,
  )}\n`,
);

// --- 6. report --------------------------------------------------------------

const byHousing = entries
  .filter((m) => m.type === 'metro')
  .sort((a, b) => b.priceParity.housing - a.priceParity.housing);

console.log(`Wrote ${OUT}`);
console.log(`  metros:            ${metroCount}`);
console.log(`  rest-of-state:     ${restCount}`);
console.log(`  total selectable:  ${entries.length}`);
console.log(`  counties mapped:   ${Object.values(counties).reduce((n, c) => n + c.length, 0)} (split into metros-counties.json)`);
if (excludedTerritories.size) {
  console.log(`  territories excluded: ${[...excludedTerritories].join(', ')}`);
}
if (dropped.length) {
  console.log(`\n  dropped ${dropped.length} (no BEA parity):`);
  for (const d of dropped.slice(0, 10)) console.log(`    - ${d}`);
  if (dropped.length > 10) console.log(`    ... and ${dropped.length - 10} more`);
}
console.log('\n  Most expensive housing:');
for (const m of byHousing.slice(0, 5)) {
  console.log(`    ${m.shortName.padEnd(22)} ${(m.priceParity.housing * 100).toFixed(1)}% of national`);
}
console.log('  Least expensive housing:');
for (const m of byHousing.slice(-5).reverse()) {
  console.log(`    ${m.shortName.padEnd(22)} ${(m.priceParity.housing * 100).toFixed(1)}% of national`);
}
