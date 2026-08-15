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
import { CURRENT_DATASET_VERSION } from './lib/version.mjs';
import { writeDataset } from './lib/write-dataset.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
/** Overridable so a new dated release can be built without editing every script. */
const VERSION = process.env.DATASET_VERSION || CURRENT_DATASET_VERSION;
const DATA_DIR = resolve(HERE, '..', 'data', VERSION);
const SRC = resolve(DATA_DIR, 'sources');

const ACS_YEAR = 2024;
const ACS_DATASET = 'acs/acs5';
const OFFLINE = process.argv.includes('--offline');
/** Ignore the cache and pull fresh data. Used by the quarterly refresh. */
const REFRESH = process.argv.includes('--refresh');

const VEHICLE_BUCKETS = [
  // [owner variable, renter variable, vehicles represented]
  ['003', '010', 0],
  ['004', '011', 1],
  ['005', '012', 2],
  ['006', '013', 3],
  ['007', '014', 4],
  ['008', '015', 5], // "5 or more" counted as 5
];

/**
 * Median gross rent by bedroom count.
 *
 * PROJECT.md section 7 named HUD Fair Market Rents for this. ACS B25031 is used
 * instead: it is published on the SAME CBSA geography already in use, in the
 * same release and vintage as every other figure here, through the same API and
 * key. HUD publishes on its own HMFA areas, which do not map cleanly onto CBSAs,
 * and quotes a 40th-percentile administrative figure rather than a median. The
 * mapping work and the mixed vintage would both be sources of error that this
 * table simply does not have.
 */
const BEDROOM_VARIABLES = [
  ['B25031_002E', 0], // studio
  ['B25031_003E', 1],
  ['B25031_004E', 2],
  ['B25031_005E', 3],
  ['B25031_006E', 4],
  ['B25031_007E', 5], // 5 or more
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
  'B25119_002E', // median household income — OWNER occupied
  'B25119_003E', // median household income — RENTER occupied
  ...BEDROOM_VARIABLES.map(([v]) => v),
  ...VEHICLE_BUCKETS.flatMap(([o, r]) => [`B25044_${o}E`, `B25044_${r}E`]),
];

// The Census API rejects a request for more than 50 variables.
if (VARIABLES.length + 1 > 50) {
  throw new Error(`too many ACS variables for one request: ${VARIABLES.length + 1}`);
}

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

/**
 * The third geography: a metro's slice of ONE state.
 *
 * 43 of the metros here cross a state line, some of them four ways. Housing was
 * metro-wide for all of them, so a household in Newark was quoted the whole New
 * York metro's rent and home value — $614,200 against the $484,600 that the New
 * Jersey side actually shows. The documentation used to claim this was not
 * available from public data. It plainly is: ACS summary level 311,
 * "metropolitan statistical area / micropolitan statistical area (or part)",
 * carries every table already used here, sliced by state.
 *
 * The wildcard is only allowed on the metro, not on the state, so this is one
 * request per state rather than one for the country. Only the states that
 * actually appear in a multi-state metro are fetched.
 */
const METRO_STATE_GEOGRAPHY = {
  key: 'metro-state',
  cacheFile: `census-acs${ACS_YEAR}-metro-state.json`,
  forClause: 'metropolitan statistical area/micropolitan statistical area (or part):*',
  idColumn: 'metropolitan statistical area/micropolitan statistical area (or part)',
};

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

/**
 * Load every state part, one request per state, merged into a single cached
 * table with the same shape the other geographies produce.
 */
async function loadMetroStateParts(stateFips) {
  const cachePath = resolve(SRC, METRO_STATE_GEOGRAPHY.cacheFile);

  if (!REFRESH && (OFFLINE || existsSync(cachePath))) {
    if (!existsSync(cachePath)) {
      throw new Error(`--offline given but cache missing: ${cachePath}`);
    }
    console.log(`  metro-state: using cached ${METRO_STATE_GEOGRAPHY.cacheFile}`);
    return JSON.parse(readFileSync(cachePath, 'utf8'));
  }

  const key = process.env.CENSUS_API_KEY;
  if (!key) throw new Error('CENSUS_API_KEY is not set and no metro-state cache exists.');

  let header = null;
  const rows = [];
  for (const fips of stateFips) {
    const url =
      `https://api.census.gov/data/${ACS_YEAR}/${ACS_DATASET}` +
      `?get=NAME,${VARIABLES.join(',')}` +
      `&for=${encodeURIComponent(METRO_STATE_GEOGRAPHY.forClause)}` +
      `&in=state:${fips}` +
      `&key=${key}`;

    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Census API ${res.status} for state ${fips}: ${await res.text()}`);
    }
    const json = await res.json();
    if (!Array.isArray(json) || json.length < 2) continue;
    if (!header) header = json[0];
    rows.push(...json.slice(1));
  }

  const table = [header, ...rows];
  writeFileSync(cachePath, `${JSON.stringify(table)}\n`);
  console.log(`  metro-state: cached ${rows.length} rows -> ${METRO_STATE_GEOGRAPHY.cacheFile}`);
  return table;
}

async function loadGeography(geo) {
  const cachePath = resolve(SRC, geo.cacheFile);

  if (!REFRESH && (OFFLINE || existsSync(cachePath))) {
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

// --- the income curve --------------------------------------------------------

/**
 * How much more (or less) rent a household pays than the typical renter,
 * as a function of income.
 *
 * WHY THIS EXISTS. B25064 is the median across the entire rental stock — every
 * subsidised unit, every long-tenured tenant, every studio. The household
 * paying it earns around the metro median. Handing that figure to someone who
 * entered a $150,000 salary understated their rent by roughly a fifth, and by
 * DIFFERENT amounts in different metros (1.02x in San Francisco, 1.36x in
 * Miami), so it distorted the comparison and not merely the level.
 *
 * HOW IT IS BUILT. B25074 gives median rent burden by income band, nationally.
 * Multiplying a band's midpoint income by its median burden gives the rent a
 * household in that band actually carries; dividing by the national median rent
 * gives a multiplier. The result crosses 1.0 near $55,000 — close to the median
 * renter's income, which is the anchor property you want — and rises
 * sub-linearly above it, matching the well-established finding that housing
 * takes a falling SHARE of income as income rises.
 *
 * WHY IT IS NATIONAL AND NOT PER-METRO. Burden is far more uniform across
 * metros than price is (14.4% in Chicago against 15.5% in Austin, while the
 * rents differ by 21%). Anchoring each metro to its own burden would quietly
 * compress the housing difference between cities toward zero — assuming away
 * precisely the thing this site exists to measure. So the LOCAL bedroom-matched
 * median sets the price, and this single national curve sets the level.
 */
const INCOME_BANDS = [
  // [first variable of the band's burden buckets, midpoint income]
  ['B25074_003E', 7_500],
  ['B25074_012E', 15_000],
  ['B25074_021E', 27_500],
  ['B25074_030E', 42_500],
  ['B25074_039E', 62_500],
  ['B25074_048E', 87_500],
  // The top band is "$100,000 or more" and open-ended. $150,000 is taken as
  // representative; above it the curve extrapolates on the last elasticity.
  ['B25074_057E', 150_000],
];

/** Burden buckets, as [lower %, upper %]. The top is capped at a nominal 75%. */
const BURDEN_BUCKETS = [
  [0, 20], [20, 25], [25, 30], [30, 35], [35, 40], [40, 50], [50, 75],
];

/**
 * Home value by owner income (B25121), for the ownership equivalent of the
 * rent curve. Buying carried exactly the flaw renting used to: the metro median
 * home value is what the MEDIAN owner owns, and property tax is derived from
 * it, so a high earner was quoted a house well below what they would buy and an
 * understated tax bill on top of it.
 *
 * The top value bucket is open-ended at $500,000, which makes the median
 * uncomputable for high earners in expensive metros — the same wall B25122 hit
 * for rent. Nationally the distribution is wide enough that every band resolves,
 * which is the other reason this curve is national rather than per-metro.
 */
const VALUE_BUCKETS = [
  [0, 10_000], [10_000, 20_000], [20_000, 30_000], [30_000, 40_000],
  [40_000, 50_000], [50_000, 60_000], [60_000, 70_000], [70_000, 80_000],
  [80_000, 90_000], [90_000, 100_000], [100_000, 200_000], [200_000, 250_000],
  [250_000, 500_000], [500_000, null],
];

/** First variable of each income band's 14 value buckets, with its midpoint. */
const VALUE_BANDS = INCOME_BANDS.map(([, income], i) => [2 + i * 15 + 1, income]);

async function loadNational() {
  const cachePath = resolve(SRC, `census-acs${ACS_YEAR}-national-rent.json`);

  if (!REFRESH && existsSync(cachePath)) {
    console.log(`  national: using cached ${cachePath.split('/').pop()}`);
    return JSON.parse(readFileSync(cachePath, 'utf8'));
  }
  if (OFFLINE) throw new Error(`--offline given but cache missing: ${cachePath}`);

  const key = process.env.CENSUS_API_KEY;
  if (!key) throw new Error('CENSUS_API_KEY is not set and no national cache exists.');

  // 7 bands x 7 buckets = 49 variables, which is inside the API's limit of 50.
  const burdenVars = INCOME_BANDS.flatMap(([first]) => {
    const n = Number(first.slice(7, 10)); // "B25074_003E" -> 3
    if (!Number.isFinite(n)) throw new Error(`cannot parse band variable ${first}`);
    return Array.from({ length: 7 }, (_, k) => `B25074_${String(n + k).padStart(3, '0')}E`);
  });

  const fetchOne = async (vars) => {
    const url =
      `https://api.census.gov/data/${ACS_YEAR}/${ACS_DATASET}` +
      `?get=${vars.join(',')}&for=us:1&key=${key}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Census API ${res.status} (national): ${await res.text()}`);
    return res.json();
  };

  // 98 variables for the value cross-tab, so it goes in two halves — the API
  // rejects a request for more than 50.
  const valueVars = VALUE_BANDS.flatMap(([first]) =>
    Array.from({ length: 14 }, (_, k) => `B25121_${String(first + k).padStart(3, '0')}E`),
  );

  console.log('  national: fetching rent burden and home value by income band...');
  const [burden, rent, value1, value2] = await Promise.all([
    fetchOne(burdenVars),
    fetchOne(['B25064_001E', ...BEDROOM_VARIABLES.map(([v]) => v), 'B25077_001E']),
    fetchOne(valueVars.slice(0, 49)),
    fetchOne(valueVars.slice(49)),
  ]);

  const json = { burden, rent, value: [value1, value2] };
  writeFileSync(cachePath, `${JSON.stringify(json)}\n`);
  console.log('  national: cached');
  return json;
}

function buildIncomeCurve(national) {
  const values = national.burden[1].slice(0, 49).map(Number);
  const nationalMedianRent = Number(national.rent[1][0]);
  if (!nationalMedianRent) throw new Error('no national median rent');

  const points = INCOME_BANDS.map(([, income], bandIndex) => {
    const counts = values.slice(bandIndex * 7, bandIndex * 7 + 7);
    const total = counts.reduce((a, b) => a + b, 0);
    if (total <= 0) throw new Error(`empty burden band at index ${bandIndex}`);

    // Median burden, interpolated inside whichever bucket contains the midpoint.
    let cumulative = 0;
    let index = 0;
    for (let i = 0; i < 7; i++) {
      cumulative += counts[i];
      if (cumulative >= total / 2) { index = i; break; }
    }
    const before = counts.slice(0, index).reduce((a, b) => a + b, 0);
    const [lo, hi] = BURDEN_BUCKETS[index];
    const burden = lo + ((total / 2 - before) / counts[index]) * (hi - lo);

    const impliedMonthlyRent = (income * (burden / 100)) / 12;
    return {
      income,
      medianBurdenPct: Number(burden.toFixed(2)),
      factor: Number((impliedMonthlyRent / nationalMedianRent).toFixed(4)),
    };
  });

  // Must rise with income: a curve that dips would make a raise cut your rent.
  for (let i = 1; i < points.length; i++) {
    if (points[i].factor <= points[i - 1].factor) {
      throw new Error(
        `income curve is not increasing at $${points[i].income}: ` +
          `${points[i - 1].factor} -> ${points[i].factor}`,
      );
    }
  }
  // ...and sub-linearly, or high earners would be charged implausible rent.
  const first = points[0];
  const last = points[points.length - 1];
  const elasticity =
    Math.log(last.factor / first.factor) / Math.log(last.income / first.income);
  if (elasticity <= 0 || elasticity >= 1) {
    throw new Error(`implausible income elasticity of rent: ${elasticity.toFixed(3)}`);
  }

  return { nationalMedianRent, points, elasticity: Number(elasticity.toFixed(4)) };
}

/**
 * The same idea for home value: what someone at this income actually owns,
 * relative to what the median owner owns.
 *
 * One wrinkle rent does not have. The two lowest income bands are NOT monotonic
 * — households reporting under $10,000 own more valuable homes than those
 * reporting $10,000-$19,999 — because that band is full of retirees who are
 * asset-rich and income-poor. Left alone it would mean a pay rise shrank your
 * house. This site models wage income only (PROJECT.md §11.1), so those
 * households are out of scope anyway; the curve is forced non-decreasing by
 * capping each band at the one above it, which pulls the distorted bottom DOWN
 * rather than inflating everything else up to meet it.
 */
function buildHomeValueCurve(national) {
  const counts = [
    ...national.value[0][1].slice(0, 49).map(Number),
    ...national.value[1][1].slice(0, 49).map(Number),
  ];
  const nationalMedianValue = Number(national.rent[1][national.rent[0].length - 2]);
  if (!nationalMedianValue) throw new Error('no national median home value');

  const medians = VALUE_BANDS.map(([, income], bandIndex) => {
    const band = counts.slice(bandIndex * 14, bandIndex * 14 + 14);
    const total = band.reduce((a, b) => a + b, 0);
    if (total <= 0) throw new Error(`empty value band at index ${bandIndex}`);

    let cumulative = 0;
    let index = 0;
    for (let i = 0; i < 14; i++) {
      cumulative += band[i];
      if (cumulative >= total / 2) { index = i; break; }
    }
    const [lo, hi] = VALUE_BUCKETS[index];
    if (hi === null) {
      throw new Error(
        `median home value for the $${income} band falls in the open $500,000+ bucket`,
      );
    }
    const before = band.slice(0, index).reduce((a, b) => a + b, 0);
    return { income, value: lo + ((total / 2 - before) / band[index]) * (hi - lo) };
  });

  // Backward pass: cap each band at the one above it.
  for (let i = medians.length - 2; i >= 0; i--) {
    medians[i].value = Math.min(medians[i].value, medians[i + 1].value);
  }

  const points = medians.map(({ income, value }) => ({
    income,
    medianValue: Math.round(value),
    factor: Number((value / nationalMedianValue).toFixed(4)),
  }));

  for (let i = 1; i < points.length; i++) {
    if (points[i].factor < points[i - 1].factor) {
      throw new Error(`home value curve decreases at $${points[i].income}`);
    }
  }

  const first = points[0];
  const last = points[points.length - 1];
  const elasticity = Math.log(last.factor / first.factor) / Math.log(last.income / first.income);
  if (elasticity <= 0 || elasticity >= 1) {
    throw new Error(`implausible income elasticity of home value: ${elasticity.toFixed(3)}`);
  }

  return { nationalMedianValue, points, elasticity: Number(elasticity.toFixed(4)) };
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
  const medianOwnerIncome = num(r.B25119_002E);
  const medianRenterIncome = num(r.B25119_003E);
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

  /**
   * Rent by bedroom count. Small metros suppress the rarer sizes, so each gap
   * falls back to the all-units median scaled by the national ratio for that
   * size — better than dropping the household-size correction entirely, and
   * flagged in the output so the data page can say which figures are derived.
   */
  const rentByBedrooms = {};
  const derivedBedrooms = [];
  for (const [variable, bedrooms] of BEDROOM_VARIABLES) {
    const value = num(r[variable]);
    if (value && value > 0) {
      rentByBedrooms[bedrooms] = value;
    } else {
      derivedBedrooms.push(bedrooms);
      rentByBedrooms[bedrooms] = null; // filled in once the national ratios exist
    }
  }

  return {
    id: r[idColumn],
    name: r.NAME,
    population: num(r.B01003_001E),
    medianHouseholdIncome: num(r.B19013_001E),
    averageHouseholdSize: num(r.B25010_001E),
    housing: {
      medianRentMonthly,
      rentByBedrooms,
      derivedBedrooms,
      medianHomePrice,
      // Who the local medians actually belong to. Scaling a local median by a
      // NATIONAL income factor double-counts: an expensive metro's median home
      // is already owned by high earners, so a $150,000 buyer in San Francisco
      // came out at $1.5m — a third above the local median, while earning
      // BELOW the local median owner. Anchoring to these makes the factor 1.0
      // for the household the median actually describes.
      medianOwnerIncome,
      medianRenterIncome,
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

/* Only the states that appear in a metro spanning more than one of them. */
const POSTAL_TO_FIPS = Object.fromEntries(
  Object.entries(STATE_FIPS).map(([fips, postal]) => [postal, fips]),
);
const SPLIT_STATE_FIPS = [
  ...new Set(
    Object.values(metrosMeta.metros)
      .filter((m) => m.type === 'metro' && m.states.length > 1)
      .flatMap((m) => m.states)
      .map((postal) => POSTAL_TO_FIPS[postal])
      .filter(Boolean),
  ),
].sort();
const metroStateJson = await loadMetroStateParts(SPLIT_STATE_FIPS);
const wanted = new Set(
  Object.values(metrosMeta.metros).filter((m) => m.type === 'metro').map((m) => m.id),
);

const housing = {};
const transport = {};
/** Keyed "<metroId>:<state>" — only for metros that cross a state line. */
const housingByState = {};
const transportByState = {};
const missing = [];

function record(id, d) {
  housing[id] = d.housing;
  transport[id] = d.transport;
}

/** Which states each multi-state metro spans, from metros.json. */
const SPLIT_METROS = new Map(
  Object.values(metrosMeta.metros)
    .filter((m) => m.type === 'metro' && m.states.length > 1)
    .map((m) => [m.id, m.states]),
);

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

// State parts of the metros that cross a state line
{
  const [header, ...rows] = metroStateJson;
  const idIndex = header.indexOf(METRO_STATE_GEOGRAPHY.idColumn);
  const stateIndex = header.indexOf('state');

  for (const row of rows) {
    const metroId = row[idIndex];
    const postal = STATE_FIPS[row[stateIndex]];
    if (!postal || !SPLIT_METROS.has(metroId)) continue;
    if (!SPLIT_METROS.get(metroId).includes(postal)) continue;

    const d = derive(row, header, METRO_STATE_GEOGRAPHY.idColumn);
    housingByState[`${metroId}:${postal}`] = d.housing;
    transportByState[`${metroId}:${postal}`] = d.transport;
  }
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

// --- the income curve, and filling the bedroom gaps ---------------------------

const national = await loadNational();
const incomeCurve = buildIncomeCurve(national);
const homeValueCurve = buildHomeValueCurve(national);

// National rent by bedroom count, as a ratio to the national all-units median.
// Used only to fill metros where a size is suppressed.
const nationalAllRent = Number(national.rent[1][0]);
const nationalBedroomRatio = {};
for (const [, bedrooms] of BEDROOM_VARIABLES) {
  const index = BEDROOM_VARIABLES.findIndex(([, b]) => b === bedrooms) + 1;
  const value = Number(national.rent[1][index]);
  if (!value || value <= 0) throw new Error(`no national rent for ${bedrooms}BR`);
  nationalBedroomRatio[bedrooms] = value / nationalAllRent;
}

let filled = 0;
/*
 * State parts get the same treatment as whole metros: a suppressed unit size
 * is filled from the national ratio, and rent is forced not to fall as
 * bedrooms are added. A state part is a smaller sample than its metro, so more
 * of its cells are suppressed — which is exactly why the per-field fallback to
 * the whole metro exists downstream.
 */
for (const h of [...Object.values(housing), ...Object.values(housingByState)]) {
  for (const bedrooms of Object.keys(h.rentByBedrooms)) {
    if (h.rentByBedrooms[bedrooms] === null) {
      // A state part with no all-units median of its own cannot be filled and
      // is left null, so the engine falls back to the whole metro's figure.
      h.rentByBedrooms[bedrooms] =
        h.medianRentMonthly === null
          ? null
          : Math.round(h.medianRentMonthly * nationalBedroomRatio[bedrooms]);
      if (h.rentByBedrooms[bedrooms] !== null) filled++;
    }
  }
  // Rent must not fall as bedrooms are added, or a child would cut the bill.
  let previous = 0;
  for (const bedrooms of [0, 1, 2, 3, 4, 5]) {
    const value = h.rentByBedrooms[bedrooms];
    if (value !== null && value < previous) h.rentByBedrooms[bedrooms] = previous;
    if (h.rentByBedrooms[bedrooms] !== null) previous = h.rentByBedrooms[bedrooms];
  }
}
console.log(
  `  income curve: ${incomeCurve.points.length} points, ` +
    `elasticity ${incomeCurve.elasticity}, ` +
    `factor ${incomeCurve.points[0].factor} -> ${incomeCurve.points.at(-1).factor}`,
);
console.log(`  bedroom rents: ${filled} suppressed cells filled from national ratios`);
console.log(
  `  home value curve: elasticity ${homeValueCurve.elasticity}, ` +
    `factor ${homeValueCurve.points[0].factor} -> ${homeValueCurve.points.at(-1).factor}`,
);

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
  if (!h.medianOwnerIncome || h.medianOwnerIncome < 15_000 || h.medianOwnerIncome > 400_000) {
    problems.push(`${id}: median owner income ${h.medianOwnerIncome}`);
  }
  if (!h.medianRenterIncome || h.medianRenterIncome < 8_000 || h.medianRenterIncome > 300_000) {
    problems.push(`${id}: median renter income ${h.medianRenterIncome}`);
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
  for (const bedrooms of [0, 1, 2, 3, 4, 5]) {
    const value = h.rentByBedrooms[bedrooms];
    if (!value || value < 200 || value > 8000) {
      problems.push(`${id}: ${bedrooms}BR rent ${value}`);
    }
  }
  // A three-bedroom that costs less than a studio means the columns are crossed.
  if (h.rentByBedrooms[3] < h.rentByBedrooms[0]) {
    problems.push(`${id}: 3BR (${h.rentByBedrooms[3]}) below studio (${h.rentByBedrooms[0]})`);
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
      B25031: 'Median gross rent by bedrooms',
      B25074: 'Household income by gross rent as a percentage of household income',
      B25077: 'Median value, owner-occupied units',
      B25103: 'Median real estate taxes paid',
      B25044: 'Tenure by vehicles available',
      B09021: 'Population 18 years and over',
      B25010: 'Average household size',
    },
  },
};

writeDataset(
  resolve(DATA_DIR, 'housing.json'),
  `${JSON.stringify(
    {
      ...provenance,
      notes: [
        'effectivePropertyTaxRate = median real estate taxes paid / median home value. This is an EFFECTIVE rate as actually experienced, not a statutory millage rate — it already reflects assessment ratios, homestead exemptions and caps.',
        'rentByBedrooms is the local median for each unit size (B25031). The engine picks a size from household composition, so a single person and a family of four are no longer quoted the same rent.',
        'incomeCurve scales that local median for income. B25064 alone is the median across the whole rental stock, paid by a household earning near the metro median — roughly a fifth below what a $150,000 earner pays, and by different margins in different metros.',
        'The curve is national on purpose: rent burden varies far less between metros than rent does, so anchoring each metro to its own burden would compress the very difference this site measures.',
        'homeValueCurve does the same for buying (B25121). The metro median home value is what the MEDIAN owner owns, and property tax is derived from it, so a high earner was quoted both a cheaper house and a smaller tax bill than they would really face.',
        'Its lowest two income bands are forced down to keep the curve non-decreasing: households reporting almost no income own unusually valuable homes because that group is mostly retirees, and this site models wage income only.',
        'Figures are metro-wide medians. A specific home may differ substantially, which is why every housing field is editable in the interface.',
        'byMetroState carries the same figures for one state\'s slice of a metro that crosses a state line (ACS summary level 311). A state part is a smaller sample than its metro, so individual cells are suppressed more often; the engine falls back to the whole metro FIELD BY FIELD rather than discarding the whole entry.',
      ],
      incomeCurve,
      homeValueCurve,
      byMetro: housing,
      byMetroState: housingByState,
    },
    null,
    2,
  )}\n`,
);

writeDataset(
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
      byMetroState: transportByState,
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
