/**
 * Builds data/<version>/spending.json — the national household spending
 * baseline that BEA price parities are applied to.
 *
 *   node scripts/build-spending.mjs
 *
 * Source: BLS Consumer Expenditure Survey, Table 1203 (income before taxes),
 * 2024, snapshotted to data/<version>/sources/bls-ces-table1203-2024.csv.
 *
 * ACQUISITION (one-off, already done; documented for reproducibility):
 *   The published table is an .xlsx at
 *   https://www.bls.gov/cex/tables/calendar-year/mean-item-share-average-standard-error/cu-income-before-taxes-2024.xlsx
 *   BLS requires a User-Agent carrying a contact email address, or it returns
 *   403. The relevant rows were extracted to the committed CSV above.
 *
 * WHAT THIS PRODUCES
 *
 * For each of nine income brackets, an annual dollar baseline split into
 * categories that map cleanly onto BEA's published price parities:
 *
 *   food           -> BEA "Goods"           (groceries and restaurants)
 *   otherGoods     -> BEA "Goods"           (apparel, alcohol, tobacco,
 *                                            housekeeping supplies, furnishings)
 *   utilities      -> BEA "Utilities"
 *   healthcare     -> BEA "Other services"
 *   otherServices  -> BEA "Other services"  (entertainment, personal care,
 *                                            education, reading, misc,
 *                                            household operations, giving)
 *
 * DELIBERATELY EXCLUDED from the living-cost total, because the engine models
 * each of them separately and double-counting would badly distort the answer:
 *
 *   shelter               housing is its own input (rent or mortgage)
 *   transportation        derived from car COUNT per metro, not national means
 *   insuranceAndPensions  saving, not consumption — it is money retained
 *
 * The excluded figures are still emitted, for the methodology page and so the
 * decomposition can be checked against the published total.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CURRENT_DATASET_VERSION } from './lib/version.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
/** Overridable so a new dated release can be built without editing every script. */
const VERSION = process.env.DATASET_VERSION || CURRENT_DATASET_VERSION;
const DATA_DIR = resolve(HERE, '..', 'data', VERSION);
const SNAPSHOT = resolve(DATA_DIR, 'sources', 'bls-ces-table1203-2024.csv');
const OUT = resolve(DATA_DIR, 'spending.json');
const CES_YEAR = 2024;

/** Category -> the CES rows summed into it, and the BEA parity it scales by. */
const CATEGORIES = {
  food: { parity: 'goods', rows: ['Food'] },
  otherGoods: {
    parity: 'goods',
    rows: [
      'Alcoholic beverages',
      'Housekeeping supplies',
      'Household furnishings and equipment',
      'Apparel and services',
      'Tobacco products and smoking supplies',
    ],
  },
  utilities: { parity: 'utilities', rows: ['Utilities, fuels, and public services'] },
  healthcare: { parity: 'otherServices', rows: ['Healthcare'] },
  otherServices: {
    parity: 'otherServices',
    rows: [
      'Household operations',
      'Entertainment',
      'Personal care products and services',
      'Reading',
      'Education',
      'Miscellaneous',
      'Cash contributions',
    ],
  },
};

const EXCLUDED = {
  shelter: ['Shelter'],
  transportation: ['Transportation'],
  insuranceAndPensions: ['Personal insurance and pensions'],
};

/**
 * Transport is modelled from car COUNT, not from national spending averages —
 * the whole point of PROJECT.md section 2. To do that we need a cost PER
 * VEHICLE, which is derived within each income bracket:
 *
 *   annualCostPerVehicle = vehicle-dependent spending / vehicles per household
 *
 * Both numerator and denominator come from the same CES bracket, so a
 * high-income household's more expensive cars are priced against its larger
 * fleet rather than a national average.
 *
 * Public transport is kept separate: a household that gives up a car in a
 * transit-rich metro does not simply stop paying for travel.
 */
const VEHICLE_COST_ROWS = [
  'Vehicle purchases (net outlay)',
  'Gasoline and other fuels',
  'Other vehicle expenses', // insurance, maintenance, finance charges, licences
];
const TRANSIT_ROW = 'Public and other transportation';

/**
 * Lower bound of each published bracket, used to pick a profile from a salary.
 * The final bracket is open-ended.
 */
const BRACKET_FLOORS = {
  'Less than $15,000': 0,
  '$15,000 to $29,999': 15_000,
  '$30,000 to $39,999': 30_000,
  '$40,000 to $49,999': 40_000,
  '$50,000 to $69,999': 50_000,
  '$70,000 to $99,999': 70_000,
  '$100,000 to $149,999': 100_000,
  '$150,000 to $199,999': 150_000,
  '$200,000 and more': 200_000,
};

// --- read -------------------------------------------------------------------

function parseCsv(text) {
  const out = [];
  let row = [], field = '', inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else inQuotes = false; }
      else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); out.push(row); row = []; field = ''; }
    else if (c !== '\r') field += c;
  }
  if (field.length || row.length) { row.push(field); out.push(row); }
  return out.filter((r) => r.length > 1);
}

const rows = parseCsv(readFileSync(SNAPSHOT, 'utf8'));
const header = rows[0];
const brackets = header.slice(1);

const table = new Map();
for (const r of rows.slice(1)) {
  table.set(r[0].trim(), r.slice(1).map((v) => (v === '' ? null : Number(v))));
}

const columnOf = (bracket) => brackets.indexOf(bracket);
const value = (rowLabel, bracket) => {
  const row = table.get(rowLabel);
  if (!row) throw new Error(`CES row not found: "${rowLabel}"`);
  const v = row[columnOf(bracket)];
  if (v === null || !Number.isFinite(v)) throw new Error(`no value for "${rowLabel}" / ${bracket}`);
  return v;
};

const sumRows = (labels, bracket) =>
  labels.reduce((total, label) => total + value(label, bracket), 0);

// --- build ------------------------------------------------------------------

const incomeBrackets = brackets.filter((b) => b !== 'All consumer units');
const profiles = [];

for (const bracket of incomeBrackets) {
  const floor = BRACKET_FLOORS[bracket];
  if (floor === undefined) throw new Error(`unmapped bracket: ${bracket}`);

  const categories = {};
  for (const [name, { rows: labels }] of Object.entries(CATEGORIES)) {
    categories[name] = Math.round(sumRows(labels, bracket));
  }

  const excluded = {};
  for (const [name, labels] of Object.entries(EXCLUDED)) {
    excluded[name] = Math.round(sumRows(labels, bracket));
  }

  const livingTotal = Object.values(categories).reduce((a, b) => a + b, 0);
  const publishedTotal = value('Average annual expenditures', bracket);
  const reconstructed = livingTotal + Object.values(excluded).reduce((a, b) => a + b, 0);

  const vehiclesPerHousehold = value('Average vehicles per consumer unit', bracket);
  const vehicleSpending = sumRows(VEHICLE_COST_ROWS, bracket);
  const transitSpending = value(TRANSIT_ROW, bracket);

  profiles.push({
    bracket,
    incomeFloor: floor,
    averageHouseholdSize: value('Average people per consumer unit', bracket),
    averageEarners: value('Average earners', bracket),
    averageChildren: value('Average children under 18', bracket),
    categories,
    livingTotal,
    transport: {
      vehiclesPerHousehold,
      vehicleSpending: Math.round(vehicleSpending),
      annualCostPerVehicle: Math.round(vehicleSpending / vehiclesPerHousehold),
      vehicleInsurance: Math.round(value('Vehicle insurance', bracket)),
      transitSpending: Math.round(transitSpending),
    },
    excluded,
    check: {
      publishedTotal,
      reconstructedTotal: reconstructed,
      differencePct: Number((((reconstructed - publishedTotal) / publishedTotal) * 100).toFixed(3)),
    },
  });
}

profiles.sort((a, b) => a.incomeFloor - b.incomeFloor);

// --- sanity checks ----------------------------------------------------------

if (profiles.length !== 9) throw new Error(`expected 9 income brackets, got ${profiles.length}`);

for (const p of profiles) {
  // The categories we keep plus the ones we exclude must reconstruct the
  // published total. If BLS changes the table structure, this catches it.
  if (Math.abs(p.check.differencePct) > 1.5) {
    throw new Error(
      `${p.bracket}: category decomposition off by ${p.check.differencePct}% ` +
        `(reconstructed ${p.check.reconstructedTotal} vs published ${p.check.publishedTotal})`,
    );
  }
  if (p.livingTotal < 5_000 || p.livingTotal > 120_000) {
    throw new Error(`${p.bracket}: implausible living total ${p.livingTotal}`);
  }
  if (!(p.averageHouseholdSize > 1 && p.averageHouseholdSize < 6)) {
    throw new Error(`${p.bracket}: implausible household size ${p.averageHouseholdSize}`);
  }
  const t = p.transport;
  if (!(t.vehiclesPerHousehold > 0.3 && t.vehiclesPerHousehold < 4)) {
    throw new Error(`${p.bracket}: implausible vehicles/household ${t.vehiclesPerHousehold}`);
  }
  if (!(t.annualCostPerVehicle > 2_000 && t.annualCostPerVehicle < 20_000)) {
    throw new Error(`${p.bracket}: implausible cost per vehicle ${t.annualCostPerVehicle}`);
  }
}

// Spending must rise with income.
for (let i = 1; i < profiles.length; i++) {
  if (profiles[i].livingTotal < profiles[i - 1].livingTotal) {
    throw new Error(
      `living total falls from ${profiles[i - 1].bracket} to ${profiles[i].bracket}`,
    );
  }
}

// --- emit -------------------------------------------------------------------

writeFileSync(
  OUT,
  `${JSON.stringify(
    {
      datasetVersion: VERSION,
      vintage: { ces: CES_YEAR },
      source: {
        name: `BLS Consumer Expenditure Survey, Table 1203 — income before taxes, ${CES_YEAR}`,
        url: 'https://www.bls.gov/cex/tables/calendar-year/mean-item-share-average-standard-error/cu-income-before-taxes-2024.xlsx',
        licence: 'US Government work — public domain',
        snapshot: `data/${VERSION}/sources/bls-ces-table1203-2024.csv`,
      },
      parityMapping: Object.fromEntries(
        Object.entries(CATEGORIES).map(([name, c]) => [name, c.parity]),
      ),
      transportModel: {
        method: 'annualCostPerVehicle = (vehicle purchases + fuel + other vehicle expenses) / vehicles per household, computed within each income bracket',
        rationale: 'Cost of living indexes measure PRICES, not QUANTITIES. Going from zero cars to two is the single largest hidden cost in a car-city move, and no price index captures it. See PROJECT.md section 2.',
        transitHandledSeparately: true,
      },
      excludedFromLivingTotal: {
        shelter: 'Housing is a separate user input (rent, or mortgage plus property tax).',
        transportation: 'Derived from car count per metro — see PROJECT.md section 2.',
        insuranceAndPensions: 'Saving rather than consumption; it is money retained, not spent.',
      },
      notes: [
        'Figures are national means by income bracket. Metro variation comes from applying BEA Regional Price Parities, not from local spending surveys.',
        'These are averages, not budgets. Any individual household will differ.',
        'Brackets are income BEFORE taxes, matching how salary is entered in the interface.',
      ],
      profiles,
    },
    null,
    2,
  )}\n`,
);

// --- report -----------------------------------------------------------------

console.log(`Wrote ${OUT}`);
console.log(`  income brackets: ${profiles.length}\n`);
console.log('  bracket                   size   food   othGds   utils  health  othSvc     LIVING   (excl. shelter/transport/pensions)');
for (const p of profiles) {
  const c = p.categories;
  console.log(
    `  ${p.bracket.padEnd(24)} ${String(p.averageHouseholdSize).padStart(4)}` +
      ` ${String(c.food).padStart(6)} ${String(c.otherGoods).padStart(8)}` +
      ` ${String(c.utilities).padStart(7)} ${String(c.healthcare).padStart(7)}` +
      ` ${String(c.otherServices).padStart(7)} ${String(p.livingTotal).padStart(10)}`,
  );
}
const worst = profiles.reduce((a, b) =>
  Math.abs(a.check.differencePct) > Math.abs(b.check.differencePct) ? a : b,
);
console.log(`\n  Decomposition check: worst bracket differs from BLS published total by ${worst.check.differencePct}% (${worst.bracket})`);
console.log('\n  bracket                  vehicles   $/vehicle   transit');
for (const p of profiles) {
  const t = p.transport;
  console.log(
    `  ${p.bracket.padEnd(24)} ${String(t.vehiclesPerHousehold).padStart(8)}` +
      ` ${('$' + t.annualCostPerVehicle.toLocaleString()).padStart(11)}` +
      ` ${('$' + t.transitSpending.toLocaleString()).padStart(9)}`,
  );
}
