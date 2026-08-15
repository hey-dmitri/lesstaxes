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
 *   The "Income before taxes" row was added later, when spending stopped being
 *   a step function of salary and needed to know what income each bracket
 *   describes. It is the same row of the same BLS table, taken from FRED,
 *   which republishes the CE series and is reachable without the contact
 *   header. Series IDs, all read at 2024:
 *
 *     Less than $15,000     CXUINCBEFTXLB0218M      7,637
 *     $15,000 to $29,999    CXUINCBEFTXLB0219M     22,443
 *     $30,000 to $39,999    CXUINCBEFTXLB0207M     34,984
 *     $40,000 to $49,999    CXUINCBEFTXLB0208M     44,824
 *     $50,000 to $69,999    CXUINCBEFTXLB0209M     59,582
 *     $70,000 to $99,999    CXUINCBEFTXLB0220M     83,888
 *     $100,000 to $149,999  CXUINCBEFTXLB0221M    121,852
 *     $150,000 to $199,999  CXUINCBEFTXLB0222M    171,847
 *     $200,000 and more     CXUINCBEFTXLB0223M    322,142
 *
 *   The all-consumer-units figure, $104,207, is from the CE 2024 news release.
 *   Note the series numbering is NOT contiguous — LB0207-0209 carry three of
 *   the middle brackets while the rest sit in LB0218-0223. Every ID above was
 *   confirmed against its published title before use, because guessing one
 *   wrong would bend the spending curve without failing anything.
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
      // 'Cash contributions' deliberately absent — see CASH_CONTRIBUTIONS_ROW.
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
/*
 * Running a car, split by which price index actually governs it.
 *
 * The whole per-vehicle figure used to be multiplied by the GOODS parity. A car
 * and its petrol are goods. Insurance, servicing, finance charges and licensing
 * are not — they are services and financial products, and BEA prices those
 * separately. The two indexes differ by up to nine points between metros, so
 * this was several hundred dollars a car in the wrong column.
 */
const VEHICLE_GOODS_ROWS = ['Vehicle purchases (net outlay)', 'Gasoline and other fuels'];
const VEHICLE_SERVICE_ROWS = [
  'Other vehicle expenses', // insurance, maintenance, finance charges, licences
];
const VEHICLE_COST_ROWS = [...VEHICLE_GOODS_ROWS, ...VEHICLE_SERVICE_ROWS];

/*
 * Giving, alimony and child support.
 *
 * These sat inside "other services" and were multiplied by the local services
 * parity, so a donation grew because local haircuts and dentists cost more. A
 * gift to a charity is not bought at local prices, and a support order is set
 * by a court. They are now carried separately and priced nationally.
 */
const CASH_CONTRIBUTIONS_ROW = 'Cash contributions';

/**
 * Restating 2024 dollars in today's money.
 *
 * Every dollar figure behind this site was measured in 2024 — the Census rent
 * and home-value tables, and this spending survey. The tax rules are 2026 and
 * the salary is whatever the reader types in today. So the costs were roughly
 * six per cent too low against a current salary.
 *
 * SIX PER CENT ON COSTS IS NOT SIX PER CENT ON THE ANSWER. Money left over is
 * a small remainder of two large numbers, so the error lands on the remainder
 * almost undiluted: for a Chicago renter on $100,000 it was 13% of the answer,
 * and 27% for a buyer.
 *
 * Three indexes rather than one, because they have moved differently and using
 * the wrong one is a knowingly worse number. All are the seasonally adjusted
 * series, read at the latest published month against the 2024 annual average:
 *
 *   basket     CPIAUCSL       CPI-U all items          313.70 -> 332.813
 *   rent       CUSR0000SAH1   CPI shelter              400.57 -> 429.098
 *   homePrice  CSUSHPISA      Case-Shiller US national 321.36 -> 331.023
 *
 * The house price index is a repeat-sales measure and the right one for a home
 * VALUE; CPI shelter measures the cost of renting and would be wrong here. The
 * unadjusted Case-Shiller reads 1.0428 at the same date, but May is a strong
 * month in a seasonal series, so the adjusted figure is the honest one.
 *
 * NOT adjusted: tax rules, which are already 2026; the salary, which the reader
 * supplies; price parities and property tax rates, which are ratios, not money.
 */
const PRICE_LEVEL = {
  baseYear: CES_YEAR,
  asOf: '2026-07',
  factors: {
    basket: {
      value: 332.813 / 313.7,
      series: 'CPIAUCSL',
      name: 'CPI-U, all items, seasonally adjusted',
      base: 313.7,
      current: 332.813,
      currentMonth: '2026-07',
    },
    rent: {
      value: 429.098 / 400.57,
      series: 'CUSR0000SAH1',
      name: 'CPI-U, shelter, seasonally adjusted',
      base: 400.57,
      current: 429.098,
      currentMonth: '2026-07',
    },
    homePrice: {
      value: 331.023 / 321.36,
      series: 'CSUSHPISA',
      name: 'S&P CoreLogic Case-Shiller US National Home Price Index, seasonally adjusted',
      base: 321.36,
      current: 331.023,
      currentMonth: '2026-05',
    },
  },
  source: {
    name: 'Federal Reserve Bank of St. Louis (FRED), republishing BLS and S&P Dow Jones Indices',
    url: 'https://fred.stlouisfed.org/',
    note: 'Base is the average of the twelve monthly readings for the source vintage year. Current is the latest month published at the time this release was cut.',
  },
};
const TRANSIT_ROW = 'Public and other transportation';

/**
 * The utilities row, split by whether ACS gross rent already contains it.
 *
 * The rent figures this site quotes are Census MEDIAN GROSS RENT, and Census
 * defines that as "the contract rent plus the estimated average monthly cost of
 * utilities (electricity, gas, and water and sewer) and fuels (oil, coal,
 * kerosene, wood, etc.) if these are paid by the renter".
 *
 * So for a renter, four of the five things in the BLS utilities row are already
 * inside the rent, and charging the whole row again on top double-counted them.
 * About 70% of the line, every bracket: $2,661 a year in Chicago at $100,000.
 *
 * Telephone service is the exception. It is in the BLS row and it is NOT in
 * gross rent, so it stays a living cost for everyone.
 *
 * Source: 2024 ACS Subject Definitions, "Gross Rent".
 * https://www2.census.gov/programs-surveys/acs/tech_docs/subject_definitions/2024_ACSSubjectDefinitions.pdf
 */
const UTILITIES_INSIDE_GROSS_RENT = [
  'Natural gas',
  'Electricity',
  'Fuel oil and other fuels',
  'Water and other public services',
];
const UTILITIES_TELEPHONE = ['Telephone services'];

/**
 * What an owner spends keeping the house standing.
 *
 * BLS publishes shelter as three parts — owned dwellings, rented dwellings and
 * other lodging — and owned dwellings as three more: mortgage interest, property
 * taxes, and this. The engine excluded the whole shelter block and added back
 * only a mortgage payment and property tax, so repairs, upkeep and home
 * insurance were never restored for anybody.
 *
 * Insurance is INSIDE this line. The site's documented "insurance is missing"
 * gap was one ingredient of a line item that was missing whole.
 *
 * THE PUBLISHED FIGURE IS AN AVERAGE OVER OWNERS AND RENTERS TOGETHER, and
 * renters pay none of it, so it has to be divided by the share who own before
 * it describes an owner. Both numbers are published. At $100,000-$150,000 that
 * is $2,960 spread across everyone, but $4,000 for someone who actually owns.
 */
const OWNER_UPKEEP_ROW = 'Maintenance repairs insurance other expenses for owned dwelling';
const OWNED_DWELLINGS_ROW = 'Owned dwellings';
const OTHER_LODGING_ROW = 'Other lodging';
const HOMEOWNER_PERCENT_ROW = 'Percent homeowner';

/**
 * Lower bound of each published bracket. Kept for labelling and for the range
 * checks below; the engine picks profiles by meanIncome, not by floor.
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

/**
 * Upper bound of each closed bracket, used only to check that the published
 * mean income really does fall inside its own bracket. The top one is open.
 */
const BRACKET_CEILINGS = {
  'Less than $15,000': 15_000,
  '$15,000 to $29,999': 30_000,
  '$30,000 to $39,999': 40_000,
  '$40,000 to $49,999': 50_000,
  '$50,000 to $69,999': 70_000,
  '$70,000 to $99,999': 100_000,
  '$100,000 to $149,999': 150_000,
  '$150,000 to $199,999': 200_000,
  '$200,000 and more': Infinity,
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

  /*
   * Cash contributions are spending and belong in the total. They are carried
   * outside `categories` only because they take no local price parity — see
   * CASH_CONTRIBUTIONS_ROW — and every category in that object is defined by
   * the parity it scales with.
   */
  const cashContributions = Math.round(value(CASH_CONTRIBUTIONS_ROW, bracket));
  const livingTotal =
    Object.values(categories).reduce((a, b) => a + b, 0) + cashContributions;
  const publishedTotal = value('Average annual expenditures', bracket);
  const reconstructed = livingTotal + Object.values(excluded).reduce((a, b) => a + b, 0);

  const vehiclesPerHousehold = value('Average vehicles per consumer unit', bracket);
  const vehicleSpending = sumRows(VEHICLE_COST_ROWS, bracket);
  const transitSpending = value(TRANSIT_ROW, bracket);

  profiles.push({
    bracket,
    incomeFloor: floor,
    /*
     * The income this bracket's spending actually describes.
     *
     * A bracket's published mean spending is the average over households
     * spread across the whole bracket, so it belongs at the bracket's mean
     * INCOME, not at its floor. Pinning it to the floor is what made spending
     * a step function of salary: a $1 raise across $150,000 moved the basket
     * by $13,189 and took thousands off the answer.
     *
     * With this, the engine interpolates between neighbouring means and
     * spending becomes continuous. It matters most for the open top bracket,
     * whose mean income is $322,142 — nothing like the $200,000 floor, and
     * treating it as $200,000 would make the top segment absurdly steep.
     */
    meanIncome: Math.round(value('Income before taxes', bracket)),
    /*
     * How the utilities figure divides between what a renter's gross rent
     * already covers and what it does not. See UTILITIES_INSIDE_GROSS_RENT.
     */
    utilitiesSplit: {
      insideGrossRent: Math.round(sumRows(UTILITIES_INSIDE_GROSS_RENT, bracket)),
      telephone: Math.round(sumRows(UTILITIES_TELEPHONE, bracket)),
    },
    /* Repairs, upkeep and home insurance. See OWNER_UPKEEP_ROW. */
    ownerUpkeep: {
      perConsumerUnit: Math.round(value(OWNER_UPKEEP_ROW, bracket)),
      homeownerShare: value(HOMEOWNER_PERCENT_ROW, bracket) / 100,
      perOwner: Math.round(
        value(OWNER_UPKEEP_ROW, bracket) / (value(HOMEOWNER_PERCENT_ROW, bracket) / 100),
      ),
    },
    averageHouseholdSize: value('Average people per consumer unit', bracket),
    averageEarners: value('Average earners', bracket),
    averageChildren: value('Average children under 18', bracket),
    categories,
    livingTotal,
    /* Priced nationally, not at local service prices. See CASH_CONTRIBUTIONS_ROW. */
    cashContributions,
    transport: {
      vehiclesPerHousehold,
      vehicleSpending: Math.round(vehicleSpending),
      annualCostPerVehicle: Math.round(vehicleSpending / vehiclesPerHousehold),
      /* The same figure split by which price index governs it. */
      goodsPerVehicle: Math.round(sumRows(VEHICLE_GOODS_ROWS, bracket) / vehiclesPerHousehold),
      servicesPerVehicle: Math.round(
        sumRows(VEHICLE_SERVICE_ROWS, bracket) / vehiclesPerHousehold,
      ),
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

/*
 * The mean incomes are the x-axis the engine interpolates along, so they have
 * to be strictly increasing and each one has to sit inside its own bracket. A
 * transcription slip here would not throw anywhere else — it would quietly
 * bend the spending curve.
 */
for (let i = 0; i < profiles.length; i++) {
  const p = profiles[i];
  const ceiling = BRACKET_CEILINGS[p.bracket];
  if (ceiling === undefined) throw new Error(`no ceiling mapped for bracket: ${p.bracket}`);
  if (!(p.meanIncome >= p.incomeFloor && p.meanIncome < ceiling)) {
    throw new Error(
      `${p.bracket}: mean income ${p.meanIncome} is outside its own bracket ` +
        `[${p.incomeFloor}, ${ceiling})`,
    );
  }
  if (i > 0 && p.meanIncome <= profiles[i - 1].meanIncome) {
    throw new Error(
      `${p.bracket}: mean income ${p.meanIncome} does not exceed ` +
        `${profiles[i - 1].bracket}'s ${profiles[i - 1].meanIncome}`,
    );
  }
}

/*
 * The two halves of the utilities split must add back up to the published
 * utilities figure. Nothing else would catch a BLS relabelling that quietly
 * drops one of the five component rows on the floor.
 */
for (const p of profiles) {
  const split = p.utilitiesSplit.insideGrossRent + p.utilitiesSplit.telephone;
  if (Math.abs(split - p.categories.utilities) > 2) {
    throw new Error(
      `${p.bracket}: utilities split sums to ${split}, published total is ` +
        `${p.categories.utilities}`,
    );
  }
  // Sanity on the shape of the answer: the part inside rent is the large part
  // everywhere, and telephone is never trivial or dominant.
  const share = p.utilitiesSplit.insideGrossRent / p.categories.utilities;
  if (!(share > 0.5 && share < 0.85)) {
    throw new Error(`${p.bracket}: ${(share * 100).toFixed(0)}% inside gross rent looks wrong`);
  }
}

/*
 * The owner upkeep figure has to sit inside the block it was taken from, or a
 * BLS relabelling could silently hand the engine the wrong row. Shelter breaks
 * into owned dwellings + rented dwellings + other lodging, and owned dwellings
 * into mortgage interest + property taxes + upkeep, so both of these must hold
 * with room to spare for the parts not named here.
 */
for (const bracket of incomeBrackets) {
  const p = profiles.find((x) => x.bracket === bracket);
  const upkeep = p.ownerUpkeep.perConsumerUnit;
  const owned = value(OWNED_DWELLINGS_ROW, bracket);
  const lodging = value(OTHER_LODGING_ROW, bracket);
  const shelter = p.excluded.shelter;

  if (!(upkeep > 0 && upkeep < owned)) {
    throw new Error(`${bracket}: upkeep ${upkeep} does not sit inside owned dwellings ${owned}`);
  }
  if (!(owned + lodging < shelter)) {
    throw new Error(
      `${bracket}: owned ${owned} + other lodging ${lodging} leaves nothing for rented ` +
        `dwellings inside shelter ${shelter}`,
    );
  }
  if (!(p.ownerUpkeep.homeownerShare > 0.2 && p.ownerUpkeep.homeownerShare <= 1)) {
    throw new Error(`${bracket}: implausible homeowner share ${p.ownerUpkeep.homeownerShare}`);
  }
  if (!(p.ownerUpkeep.perOwner > 1_500 && p.ownerUpkeep.perOwner < 15_000)) {
    throw new Error(`${bracket}: implausible upkeep per owner ${p.ownerUpkeep.perOwner}`);
  }
}

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

/*
 * The inflation factors rescale every dollar on the site, and a fat finger here
 * would fail nothing else. They must be uplifts, and they must be sane ones.
 */
for (const [name, f] of Object.entries(PRICE_LEVEL.factors)) {
  if (!(f.value > 1 && f.value < 1.5)) {
    throw new Error(`price level factor ${name} is ${f.value}, which is not a plausible uplift`);
  }
  if (Math.abs(f.value - f.current / f.base) > 1e-9) {
    throw new Error(`price level factor ${name} does not match its own base and current readings`);
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
      /*
       * The single most important thing to know about these numbers before
       * adding anything to them: they are what households PAID at the till,
       * sales tax included. The engine used to compute a separate sales tax on
       * top of this basket, which charged it twice.
       */
      priceLevel: PRICE_LEVEL,
      salesTaxTreatment: {
        includedInCategories: true,
        note: 'CE expenditures are transaction costs including sales and excise tax. Where a respondent reported a price without tax, BLS adds it before publishing. A separate sales tax line on top of these figures is a double count.',
        sources: [
          'https://www.bls.gov/cex/csxfaqs.htm — question 14, "Is sales tax included in expenditures?"',
          'https://www.bls.gov/cex/csxgloss.htm — "Expenditures consist of the transaction costs, including excise and sales taxes"',
          'https://www.bls.gov/opub/hom/cex/concepts.htm — "Expenditure amounts ... include all applicable sales and excise taxes"',
          'https://www.bls.gov/cex/research_papers/pdf/sun-sales-tax-in-consumer-expenditure-data.pdf',
        ],
      },
      notes: [
        'Figures are national means by income bracket. Metro variation comes from applying BEA Regional Price Parities, not from local spending surveys.',
        'These are averages, not budgets. Any individual household will differ.',
        'Brackets are income BEFORE taxes, matching how salary is entered in the interface.',
        'Amounts include the sales tax the household paid. See salesTaxTreatment.',
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
