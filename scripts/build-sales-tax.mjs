/**
 * Builds data/<version>/sales-tax.json.
 *
 *   node scripts/build-sales-tax.mjs
 *
 * Two things are needed to estimate sales tax on a household's spending:
 * the RATE, and the SHARE of spending that is actually taxable. The second is
 * where naive calculators go wrong — most states exempt groceries, and almost
 * all services are untaxed, so the taxable base is far smaller than total
 * spending. See PROJECT.md section 2.
 *
 * Sources:
 *   Rates    Tax Foundation, "State and Local Sales Tax Rates, 2026"
 *            (CC BY-NC 4.0; satisfied — this project is non-commercial)
 *   Grocery  State statutes, corroborated across several 2026 summaries
 *   Shares   Derived from BLS Consumer Expenditure category composition
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CURRENT_DATASET_VERSION } from './lib/version.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
/** Overridable so a new dated release can be built without editing every script. */
const VERSION = process.env.DATASET_VERSION || CURRENT_DATASET_VERSION;
const DATA_DIR = resolve(HERE, '..', 'data', VERSION);
const SNAPSHOT = resolve(DATA_DIR, 'sources', 'taxfoundation-sales-tax-2026.csv');
const OUT = resolve(DATA_DIR, 'sales-tax.json');

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

/**
 * Grocery (food-for-home) treatment, tax year 2026.
 *
 *   full     taxed at the ordinary state rate
 *   reduced  taxed at a special lower state rate (the number is that rate)
 *   exempt   not taxed by the state
 *
 * Recent movers: Illinois exempted groceries 1 Jan 2026; Kansas 1 Jan 2025;
 * Oklahoma 2023; New Mexico and West Virginia earlier.
 */
const GROCERY_TREATMENT = {
  HI: { treatment: 'full' },
  ID: { treatment: 'full', note: 'Offsets with a grocery tax credit, which this model does not apply.' },
  MS: { treatment: 'full' },
  SD: { treatment: 'full' },

  AL: { treatment: 'reduced', rate: 0.03 },
  AR: { treatment: 'reduced', rate: 0.00125 },
  MO: { treatment: 'reduced', rate: 0.01225 },
  TN: { treatment: 'reduced', rate: 0.04 },
  UT: { treatment: 'reduced', rate: 0.03 },
  VA: { treatment: 'reduced', rate: 0.025 },
};

/**
 * Share of each spending category subject to sales tax.
 *
 * These are estimates, not statute. They encode two robust facts about US
 * sales taxes: tangible goods are broadly taxable, and services broadly are
 * not. Erring low is deliberate — overstating the taxable base would inflate
 * the sales-tax line, and sales tax is a genuinely small term that should not
 * be dressed up as larger than it is.
 */
const TAXABLE_SHARES = {
  // Food is split because groceries and restaurant meals are treated very
  // differently: restaurant meals are taxable essentially everywhere.
  food: {
    groceryPortion: 0.612,
    restaurantPortion: 0.388,
    note: 'Split from BLS: food at home $6,224 of $10,169 total food spending (61.2%).',
  },
  otherGoods: 0.90,
  utilities: 0.30,
  healthcare: 0.05,
  otherServices: 0.15,
};

// --- read --------------------------------------------------------------------

function parseCsv(text) {
  const out = [];
  let row = [], field = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i+1] === '"') { field += '"'; i++; } else q = false; } else field += c; }
    else if (c === '"') q = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); out.push(row); row = []; field = ''; }
    else if (c !== '\r') field += c;
  }
  if (field.length || row.length) { row.push(field); out.push(row); }
  return out.filter((r) => r.length > 1);
}

const rows = parseCsv(readFileSync(SNAPSHOT, 'utf8'));
const header = rows[0].map((h) => h.trim());
const col = (name) => header.indexOf(name);

const iState = col('State');
const iStateRate = col('State Tax Rate');
const iLocalRate = col('Avg. Local Tax Rate');
const iMaxLocal = col('Max Local');
const iCombined = col('Combined Tax Rate');

const round = (v, dp = 5) => Number(Number(v).toFixed(dp));

const states = {};

for (const r of rows.slice(1)) {
  // Strip footnote markers: "California (a)" -> "California"
  const name = r[iState].replace(/\s*\([a-z]+\)\s*$/i, '').trim();
  const code = STATE_CODES[name];
  if (!code) throw new Error(`unmapped state: "${r[iState]}"`);

  const stateRate = Number(r[iStateRate]);
  const avgLocalRate = Number(r[iLocalRate]);
  const combinedRate = Number(r[iCombined]);
  const maxLocalRate = Number(r[iMaxLocal]);

  const grocery = GROCERY_TREATMENT[code] ?? { treatment: 'exempt' };

  let groceryRate;
  if (grocery.treatment === 'full') groceryRate = combinedRate;
  else if (grocery.treatment === 'reduced') groceryRate = grocery.rate + avgLocalRate;
  else groceryRate = 0;

  states[code] = {
    code,
    name,
    stateRate: round(stateRate),
    avgLocalRate: round(avgLocalRate),
    maxLocalRate: round(maxLocalRate),
    combinedRate: round(combinedRate),
    grocery: {
      treatment: grocery.treatment,
      effectiveRate: round(groceryRate),
      ...(grocery.note ? { note: grocery.note } : {}),
    },
  };
}

// --- sanity checks -----------------------------------------------------------

const codes = Object.keys(states);
if (codes.length !== 51) throw new Error(`expected 51 jurisdictions, got ${codes.length}`);

const NO_SALES_TAX = ['AK', 'DE', 'MT', 'NH', 'OR'];
for (const code of NO_SALES_TAX) {
  if (states[code].stateRate !== 0) {
    throw new Error(`${code} should have no STATE sales tax, got ${states[code].stateRate}`);
  }
}

for (const [code, s] of Object.entries(states)) {
  if (s.combinedRate < 0 || s.combinedRate > 0.12) throw new Error(`${code}: combined ${s.combinedRate}`);
  if (s.grocery.effectiveRate > s.combinedRate + 1e-9) {
    throw new Error(`${code}: grocery rate exceeds combined rate`);
  }
  if (s.avgLocalRate > s.maxLocalRate + 1e-9) throw new Error(`${code}: avg local exceeds max local`);
}

const shareValues = [TAXABLE_SHARES.otherGoods, TAXABLE_SHARES.utilities,
  TAXABLE_SHARES.healthcare, TAXABLE_SHARES.otherServices];
if (shareValues.some((v) => v < 0 || v > 1)) throw new Error('taxable share outside 0..1');

const foodSplit = TAXABLE_SHARES.food.groceryPortion + TAXABLE_SHARES.food.restaurantPortion;
if (Math.abs(foodSplit - 1) > 0.001) throw new Error(`food split must sum to 1, got ${foodSplit}`);

// --- emit --------------------------------------------------------------------

writeFileSync(
  OUT,
  `${JSON.stringify(
    {
      datasetVersion: VERSION,
      taxYear: 2026,
      sources: [
        {
          name: 'Tax Foundation, "State and Local Sales Tax Rates, 2026"',
          url: 'https://taxfoundation.org/data/all/state/sales-tax-rates/',
          licence: 'CC BY-NC 4.0 — satisfied; this project is permanently non-commercial',
          snapshot: `data/${VERSION}/sources/taxfoundation-sales-tax-2026.csv`,
          confidence: 'secondary — reputable aggregator of state statutes',
        },
        {
          name: 'Grocery exemption status by state, tax year 2026',
          licence: 'State statute',
          confidence: 'secondary — corroborated across multiple 2026 summaries; worth re-checking each January, when most changes take effect',
        },
      ],
      taxableShares: TAXABLE_SHARES,
      limitations: [
        'Local rates are population-weighted state averages, not the exact rate for a given metro. Chicago at 10.25% is above the Illinois average; the model uses the average.',
        'Taxable shares by category are informed estimates, not statute. Services and healthcare are broadly untaxed; tangible goods broadly are. Erring low is deliberate.',
        'In Alaska, Colorado, Louisiana and Arizona, local jurisdictions may tax groceries even where the state does not. Not modelled.',
        'Idaho offsets its grocery tax with a credit, which is not applied here.',
        'Sales tax is typically a few hundred dollars a year of difference between metros — real, but small next to income tax and housing.',
      ],
      states,
    },
    null,
    2,
  )}\n`,
);

// --- report ------------------------------------------------------------------

const sorted = codes.slice().sort((a, b) => states[b].combinedRate - states[a].combinedRate);
const pc = (v) => `${(v * 100).toFixed(2)}%`;

console.log(`Wrote ${OUT}`);
console.log(`  jurisdictions: ${codes.length}`);
console.log(`  no state sales tax: ${NO_SALES_TAX.join(', ')}`);

console.log('\n  Highest combined rate:');
for (const c of sorted.slice(0, 5)) console.log(`    ${states[c].name.padEnd(16)} ${pc(states[c].combinedRate)}`);
console.log('  Lowest combined rate:');
for (const c of sorted.slice(-4).reverse()) console.log(`    ${states[c].name.padEnd(16)} ${pc(states[c].combinedRate)}`);

const taxedGroceries = codes.filter((c) => states[c].grocery.treatment !== 'exempt');
console.log(`\n  Tax groceries (${taxedGroceries.length} of 51):`);
for (const c of taxedGroceries.sort()) {
  const s = states[c];
  console.log(`    ${s.name.padEnd(16)} ${s.grocery.treatment.padEnd(8)} effective ${pc(s.grocery.effectiveRate)}`);
}
