/**
 * Builds data/<version>/metros.json — the geographic backbone of the app.
 *
 *   node scripts/build-metros.mjs
 *
 * Combines two public-domain federal sources, both snapshotted into
 * data/<version>/sources/ so the build is reproducible offline:
 *
 *   Census CBSA delineation (2023)  county -> metro mapping, names, states
 *   BEA Regional Price Parities     price level by category, by metro (2024)
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

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const VERSION = '2026.1';
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
writeFileSync(
  resolve(DATA_DIR, 'metros-counties.json'),
  `${JSON.stringify({ datasetVersion: VERSION, byMetro: counties }, null, 2)}\n`,
);

writeFileSync(
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
      ],
      limitations: [
        'Micropolitan statistical areas are excluded because BEA publishes no price parities for them. Their residents are served by the "rest of <state>" entries.',
        'BEA publishes no rural-only price parity, so "rest of <state>" uses statewide figures, which blend that state\'s metros back in.',
        `Price parities are ${RPP_YEAR} data, the latest published.`,
        'US territories (Puerto Rico and others) are excluded: they have separate income tax systems and no BEA price parities.',
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
