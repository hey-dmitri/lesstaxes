/**
 * Builds data/<version>/housing.json and transport.json from Census ACS.
 *
 *   CENSUS_API_KEY=... node scripts/build-housing-transport.mjs
 *   node scripts/build-housing-transport.mjs --offline   (rebuild from cache)
 *
 * Raw API responses are cached into data/<version>/sources/ and committed, so
 * the dataset can be rebuilt without a key and never changes underneath a
 * shared link.
 *
 * DERIVED FIGURES — how each is computed and why:
 *
 *   effectivePropertyTaxRate
 *     = median real estate taxes paid / median home value  (B25103 / B25077)
 *     A metro-level effective rate, which is what a mover actually experiences.
 *     More honest than a statutory millage rate, which ignores assessment
 *     ratios, homestead exemptions and caps.
 *
 *   vehiclesPerAdult
 *     = average vehicles per household / average adults per household
 *     Computed from the full B25044 distribution (0,1,2,3,4,5+ vehicles across
 *     owner and renter households) rather than a single summary figure.
 *     Adults come from B09021 (population 18+) over occupied units, because
 *     cars follow drivers, not children. The engine multiplies this by the
 *     adults implied by filing status — see PROJECT.md D17.
 *
 *   The 5+ bucket is counted as exactly 5, which very slightly understates
 *     vehicle ownership in a handful of rural metros. Immaterial at this scale.
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const VERSION = '2026.1';
const DATA_DIR = resolve(HERE, '..', 'data', VERSION);
const SRC = resolve(DATA_DIR, 'sources');

const ACS_YEAR = 2024;
const ACS_DATASET = 'acs/acs5';
const OFFLINE = process.argv.includes('--offline');

const VEHICLE_BUCKETS = [
  // [owner variable, renter variable, vehicles represented]
  ['003', '010', 0],
  ['004', '011', 1],
  ['005', '012', 2],
  ['006', '013', 3],
  ['007', '014', 4],
  ['008', '015', 5], // "5 or more" counted as 5
];

const VARIABLES = [
  'B25064_001E', // median gross rent (monthly)
  'B25077_001E', // median value, owner-occupied units
  'B25103_001E', // median real estate taxes paid (annual)
  'B25010_001E', // average household size
  'B01003_001E', // total population
  'B19013_001E', // median household income
  'B09021_001E', // population 18 years and over
  'B25044_001E', // occupied housing units (vehicle universe)
  ...VEHICLE_BUCKETS.flatMap(([o, r]) => [`B25044_${o}E`, `B25044_${r}E`]),
];

const GEOGRAPHIES = [
  {
    key: 'metro',
    cacheFile: `census-acs${ACS_YEAR}-metro.json`,
    forClause: 'metropolitan statistical area/micropolitan statistical area:*',
    idColumn: 'metropolitan statistical area/micropolitan statistical area',
  },
  {
    key: 'state',
    cacheFile: `census-acs${ACS_YEAR}-state.json`,
    forClause: 'state:*',
    idColumn: 'state',
  },
];

// FIPS state code -> postal code, for the rest-of-state entries.
const STATE_FIPS = {
  '01': 'AL', '02': 'AK', '04': 'AZ', '05': 'AR', '06': 'CA', '08': 'CO',
  '09': 'CT', '10': 'DE', '11': 'DC', '12': 'FL', '13': 'GA', '15': 'HI',
  '16': 'ID', '17': 'IL', '18': 'IN', '19': 'IA', '20': 'KS', '21': 'KY',
  '22': 'LA', '23': 'ME', '24': 'MD', '25': 'MA', '26': 'MI', '27': 'MN',
  '28': 'MS', '29': 'MO', '30': 'MT', '31': 'NE', '32': 'NV', '33': 'NH',
  '34': 'NJ', '35': 'NM', '36': 'NY', '37': 'NC', '38': 'ND', '39': 'OH',
  '40': 'OK', '41': 'OR', '42': 'PA', '44': 'RI', '45': 'SC', '46': 'SD',
  '47': 'TN', '48': 'TX', '49': 'UT', '50': 'VT', '51': 'VA', '53': 'WA',
  '54': 'WV', '55': 'WI', '56': 'WY',
};

// --- fetch or load from cache ----------------------------------------------

async function loadGeography(geo) {
  const cachePath = resolve(SRC, geo.cacheFile);

  if (OFFLINE || existsSync(cachePath)) {
    if (!existsSync(cachePath)) {
      throw new Error(`--offline given but cache missing: ${cachePath}`);
    }
    console.log(`  ${geo.key}: using cached ${geo.cacheFile}`);
    return JSON.parse(readFileSync(cachePath, 'utf8'));
  }

  const key = process.env.CENSUS_API_KEY;
  if (!key) {
    throw new Error(
      'CENSUS_API_KEY is not set and no cache exists.\n' +
        'Get a free key at https://api.census.gov/data/key_signup.html, ' +
        'put it in .env.local, and re-run.',
    );
  }

  const url =
    `https://api.census.gov/data/${ACS_YEAR}/${ACS_DATASET}` +
    `?get=NAME,${VARIABLES.join(',')}` +
    `&for=${encodeURIComponent(geo.forClause)}` +
    `&key=${key}`;

  console.log(`  ${geo.key}: fetching from Census API...`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Census API ${res.status} for ${geo.key}: ${await res.text()}`);

  const json = await res.json();
  if (!Array.isArray(json) || json.length < 2) {
    throw new Error(`Census API returned no rows for ${geo.key}`);
  }

  // Cache WITHOUT the key anywhere in it.
  writeFileSync(cachePath, `${JSON.stringify(json)}\n`);
  console.log(`  ${geo.key}: cached ${json.length - 1} rows -> ${geo.cacheFile}`);
  return json;
}

// --- derive ------------------------------------------------------------------

const num = (v) => {
  const n = Number(v);
  // Census uses large negative sentinels for suppressed/unavailable values.
  return Number.isFinite(n) && n > -1e6 ? n : null;
};

function derive(row, header, idColumn) {
  const r = Object.fromEntries(header.map((h, i) => [h, row[i]]));

  const medianRentMonthly = num(r.B25064_001E);
  const medianHomePrice = num(r.B25077_001E);
  const medianPropertyTaxPaid = num(r.B25103_001E);
  const households = num(r.B25044_001E);
  const adults = num(r.B09021_001E);

  let vehiclesPerHousehold = null;
  if (households && households > 0) {
    let total = 0;
    let counted = 0;
    for (const [owner, renter, vehicles] of VEHICLE_BUCKETS) {
      const o = num(r[`B25044_${owner}E`]) ?? 0;
      const t = num(r[`B25044_${renter}E`]) ?? 0;
      total += vehicles * (o + t);
      counted += o + t;
    }
    if (counted > 0) vehiclesPerHousehold = total / counted;
  }

  const adultsPerHousehold = households && adults ? adults / households : null;
  const vehiclesPerAdult =
    vehiclesPerHousehold !== null && adultsPerHousehold
      ? vehiclesPerHousehold / adultsPerHousehold
      : null;

  const effectivePropertyTaxRate =
    medianPropertyTaxPaid !== null && medianHomePrice
      ? medianPropertyTaxPaid / medianHomePrice
      : null;

  const round = (v, dp) => (v === null ? null : Number(v.toFixed(dp)));

  return {
    id: r[idColumn],
    name: r.NAME,
    population: num(r.B01003_001E),
    medianHouseholdIncome: num(r.B19013_001E),
    averageHouseholdSize: num(r.B25010_001E),
    housing: {
      medianRentMonthly,
      medianHomePrice,
      medianPropertyTaxPaid,
      effectivePropertyTaxRate: round(effectivePropertyTaxRate, 5),
    },
    transport: {
      vehiclesPerHousehold: round(vehiclesPerHousehold, 3),
      adultsPerHousehold: round(adultsPerHousehold, 3),
      vehiclesPerAdult: round(vehiclesPerAdult, 3),
    },
  };
}

// --- run ---------------------------------------------------------------------

console.log(`Building housing + transport from ACS ${ACS_YEAR} 5-year estimates`);

const metroJson = await loadGeography(GEOGRAPHIES[0]);
const stateJson = await loadGeography(GEOGRAPHIES[1]);

const metrosMeta = JSON.parse(readFileSync(resolve(DATA_DIR, 'metros.json'), 'utf8'));
const wanted = new Set(
  Object.values(metrosMeta.metros).filter((m) => m.type === 'metro').map((m) => m.id),
);

const housing = {};
const transport = {};
const missing = [];

function record(id, d) {
  housing[id] = d.housing;
  transport[id] = d.transport;
}

// Metros
{
  const [header, ...rows] = metroJson;
  const idColumn = GEOGRAPHIES[0].idColumn;
  const seen = new Set();

  for (const row of rows) {
    const d = derive(row, header, idColumn);
    if (!wanted.has(d.id)) continue; // skips micropolitan areas
    seen.add(d.id);
    record(d.id, d);
  }
  for (const id of wanted) if (!seen.has(id)) missing.push(id);
}

// Rest-of-state
{
  const [header, ...rows] = stateJson;
  for (const row of rows) {
    const d = derive(row, header, GEOGRAPHIES[1].idColumn);
    const postal = STATE_FIPS[d.id];
    if (!postal) continue; // territories
    record(`rest-of-${postal}`, d);
  }
}

// --- sanity checks -----------------------------------------------------------

if (missing.length) {
  throw new Error(`no ACS data for ${missing.length} metros: ${missing.slice(0, 8).join(', ')}`);
}

const ids = Object.keys(housing);
if (ids.length !== wanted.size + 51) {
  throw new Error(`expected ${wanted.size + 51} entries, got ${ids.length}`);
}

const problems = [];
for (const id of ids) {
  const h = housing[id];
  const t = transport[id];

  if (!h.medianRentMonthly || h.medianRentMonthly < 300 || h.medianRentMonthly > 4000) {
    problems.push(`${id}: rent ${h.medianRentMonthly}`);
  }
  if (!h.medianHomePrice || h.medianHomePrice < 50_000 || h.medianHomePrice > 2_500_000) {
    problems.push(`${id}: home price ${h.medianHomePrice}`);
  }
  if (h.effectivePropertyTaxRate === null || h.effectivePropertyTaxRate < 0 || h.effectivePropertyTaxRate > 0.05) {
    problems.push(`${id}: property tax rate ${h.effectivePropertyTaxRate}`);
  }
  if (t.vehiclesPerAdult === null || t.vehiclesPerAdult < 0 || t.vehiclesPerAdult > 1.6) {
    problems.push(`${id}: vehicles/adult ${t.vehiclesPerAdult}`);
  }
}
if (problems.length) {
  throw new Error(`implausible values:\n  ${problems.slice(0, 12).join('\n  ')}`);
}

// --- emit --------------------------------------------------------------------

const provenance = {
  datasetVersion: VERSION,
  vintage: { acs: ACS_YEAR, estimates: '5-year' },
  source: {
    name: `US Census Bureau, American Community Survey ${ACS_YEAR} 5-year estimates`,
    url: `https://api.census.gov/data/${ACS_YEAR}/${ACS_DATASET}`,
    licence: 'US Government work — public domain',
    tables: {
      B25064: 'Median gross rent',
      B25077: 'Median value, owner-occupied units',
      B25103: 'Median real estate taxes paid',
      B25044: 'Tenure by vehicles available',
      B09021: 'Population 18 years and over',
      B25010: 'Average household size',
    },
  },
};

writeFileSync(
  resolve(DATA_DIR, 'housing.json'),
  `${JSON.stringify(
    {
      ...provenance,
      notes: [
        'effectivePropertyTaxRate = median real estate taxes paid / median home value. This is an EFFECTIVE rate as actually experienced, not a statutory millage rate — it already reflects assessment ratios, homestead exemptions and caps.',
        'Figures are metro-wide medians. A specific home may differ substantially, which is why every housing field is editable in the interface.',
      ],
      byMetro: housing,
    },
    null,
    2,
  )}\n`,
);

writeFileSync(
  resolve(DATA_DIR, 'transport.json'),
  `${JSON.stringify(
    {
      ...provenance,
      notes: [
        'vehiclesPerAdult = average vehicles per household / average adults per household. Cars follow drivers, so the denominator is adults (18+), not household size.',
        'The engine multiplies this by the adults implied by filing status, then rounds — see PROJECT.md D17.',
        'The "5 or more vehicles" bucket is counted as exactly 5, marginally understating a few rural metros.',
      ],
      byMetro: transport,
    },
    null,
    2,
  )}\n`,
);

// --- report ------------------------------------------------------------------

const metroIds = ids.filter((id) => !id.startsWith('rest-of-'));
const byRent = [...metroIds].sort((a, b) => housing[b].medianRentMonthly - housing[a].medianRentMonthly);
const byPropTax = [...metroIds].sort(
  (a, b) => housing[b].effectivePropertyTaxRate - housing[a].effectivePropertyTaxRate,
);
const byCars = [...metroIds].sort((a, b) => transport[a].vehiclesPerAdult - transport[b].vehiclesPerAdult);

const nameOf = (id) => metrosMeta.metros[id]?.shortName ?? id;
const show = (label, list, fmt) => {
  console.log(`\n  ${label}`);
  for (const id of list) console.log(`    ${nameOf(id).padEnd(24)} ${fmt(id)}`);
};

console.log(`\nWrote housing.json and transport.json`);
console.log(`  entries: ${ids.length} (${metroIds.length} metros + 51 rest-of-state)`);

show('Highest median rent:', byRent.slice(0, 4), (id) => `$${housing[id].medianRentMonthly.toLocaleString()}/mo`);
show('Lowest median rent:', byRent.slice(-3).reverse(), (id) => `$${housing[id].medianRentMonthly.toLocaleString()}/mo`);
show('Highest effective property tax:', byPropTax.slice(0, 4), (id) => `${(housing[id].effectivePropertyTaxRate * 100).toFixed(2)}%`);
show('Lowest effective property tax:', byPropTax.slice(-3).reverse(), (id) => `${(housing[id].effectivePropertyTaxRate * 100).toFixed(2)}%`);
show('Fewest vehicles per adult:', byCars.slice(0, 4), (id) => `${transport[id].vehiclesPerAdult}`);
show('Most vehicles per adult:', byCars.slice(-3).reverse(), (id) => `${transport[id].vehiclesPerAdult}`);
