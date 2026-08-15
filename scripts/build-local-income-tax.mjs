/**
 * Builds data/<version>/local-income-tax.json.
 *
 *   node scripts/build-local-income-tax.mjs
 *
 * Only about ten states permit local income taxes, but where they exist they
 * are large enough to change a relocation decision — New York City adds nearly
 * 3.9% on top of New York State. Capturing that is the main reason this app
 * works at metro rather than state level (PROJECT.md D1).
 *
 * COVERAGE, STATED PLAINLY
 *
 *   Explicit, city-specific:  New York City, Yonkers, Philadelphia, Detroit,
 *                             Columbus, Cincinnati
 *   State-average fallback:   AL, IN, IA, KY, MD, MI, MO, OH, OR, PA
 *
 * The fallback uses Tax Foundation's average effective local rate as a share
 * of AGI for that state. That is accurate where local rates are uniform
 * (Maryland's counties all sit between 2.25% and 3.20% against a 2.4%
 * average) and badly wrong for concentrated high-rate cities — Philadelphia
 * levies 3.74% against a Pennsylvania average of 0.99%.
 *
 * Every city rate here is transcribed from that city's own revenue department
 * and carries its source URL. A remembered rate is worse than an average,
 * because it looks sourced; where a rate could not be verified against a
 * primary source it is deliberately still on the average, and listed under
 * `limitations`.
 *
 * THE NEW YORK CITY PROBLEM
 *
 * The New York-Newark-Jersey City metro spans 22 counties across three states.
 * Only residents of the five boroughs pay New York City income tax. A single
 * metro-wide rate would be wrong for everybody — too high for Westchester, too
 * low for Brooklyn. So NYC and Yonkers are modelled as OPTIONAL jurisdictions
 * the user confirms, rather than being applied blindly to the whole metro.
 */

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CURRENT_DATASET_VERSION } from './lib/version.mjs';
import { writeDataset } from './lib/write-dataset.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
/** Overridable so a new dated release can be built without editing every script. */
const VERSION = process.env.DATASET_VERSION || CURRENT_DATASET_VERSION;
const DATA_DIR = resolve(HERE, '..', 'data', VERSION);
const OUT = resolve(DATA_DIR, 'local-income-tax.json');

/**
 * New York City resident income tax.
 * Corroborated across independent sources; tax.ny.gov itself blocks automated
 * access, so this carries a lower confidence rating than the state tables and
 * should be re-verified against Form IT-201 instructions before launch.
 */
/**
 * City income taxes, each transcribed from the levying authority.
 *
 * MUTUALLY EXCLUSIVE WITH THE STATE AVERAGE. A metro is far larger than its
 * principal city: only Philadelphia residents pay Philadelphia's wage tax, and
 * someone elsewhere in that metro pays their own township's rate, for which the
 * state average is the honest stand-in. So these are emitted as a GROUP — the
 * user picks one, and exactly one applies. Summing them would invent a tax
 * nobody pays.
 */
const CITY_TAXES = [
  {
    id: 'philadelphia',
    kind: 'flatRate',
    name: 'Philadelphia',
    stateCode: 'PA',
    metroId: '37980',
    // Philadelphia's rate changes every 1 July on a legislated reduction
    // schedule, so tax year 2026 spans two rates: 3.74% to 30 June and 3.735%
    // from 1 July. This is the calendar-2026 blend, matching TAX_YEAR.
    rate: 0.037375,
    prompt: 'Do you live inside the City of Philadelphia?',
    source:
      'City of Philadelphia Department of Revenue, Tax Rate History — https://www.phila.gov/departments/department-of-revenue/forms-documents/regulations-rulings/tax-rate-history/',
    note: 'Resident Wage/Earnings Tax. Calendar-2026 blend of 3.74% (to 30 Jun) and 3.735% (from 1 Jul).',
  },
  {
    id: 'detroit',
    kind: 'flatRate',
    name: 'Detroit',
    stateCode: 'MI',
    metroId: '19820',
    rate: 0.024,
    prompt: 'Do you live inside the City of Detroit?',
    source:
      'City of Detroit Office of the Treasury, Income Tax Information — https://detroitmi.gov/departments/office-chief-financial-officer/ocfo-divisions/office-treasury/income-tax/income-tax-information',
    note: 'Resident rate 2.4%; non-residents pay 1.2%, which this model does not use.',
  },
  {
    id: 'columbus',
    kind: 'flatRate',
    name: 'Columbus',
    stateCode: 'OH',
    metroId: '18140',
    rate: 0.025,
    prompt: 'Do you live inside the City of Columbus?',
    source:
      'City of Columbus Income Tax Division — https://www.columbus.gov/Government/City-Auditor/Income-Tax-Division',
    note: 'Municipal income tax, 2.5%.',
  },
  {
    id: 'cincinnati',
    kind: 'flatRate',
    name: 'Cincinnati',
    stateCode: 'OH',
    metroId: '17140',
    rate: 0.018,
    prompt: 'Do you live inside the City of Cincinnati?',
    source: 'City of Cincinnati Income Taxes — https://www.cincinnati-oh.gov/finance/income-taxes/',
    note: 'Municipal income tax, 1.8%.',
  },
  {
    id: 'cleveland',
    kind: 'flatRate',
    name: 'Cleveland',
    stateCode: 'OH',
    metroId: '17410',
    rate: 0.025,
    prompt: 'Do you live inside the City of Cleveland?',
    source:
      'Central Collection Agency (City of Cleveland Division of Taxation), Tax Rates — https://ccatax.ci.cleveland.oh.us/?p=taxrates',
    note: 'Municipal income tax, 2.5%. Ohio grants a credit for tax paid to a work city; this models a resident who also works locally.',
  },
  {
    id: 'pittsburgh',
    kind: 'flatRate',
    name: 'Pittsburgh',
    stateCode: 'PA',
    metroId: '38300',
    rate: 0.03,
    prompt: 'Do you live inside the City of Pittsburgh?',
    source:
      'City of Pittsburgh, Taxes — https://www.pittsburghpa.gov/City-Government/Finance-Budget/Taxes',
    note: 'Resident Earned Income Tax: 1% city plus 2% school district, 3% total.',
  },
  {
    id: 'louisville',
    kind: 'flatRate',
    name: 'Louisville Metro',
    stateCode: 'KY',
    metroId: '31140',
    rate: 0.022,
    prompt: 'Do you live in Louisville Metro (Jefferson County)?',
    source:
      'Louisville Metro Revenue Commission, Form W-1 instructions — https://louisvilleky.gov/sites/default/files/2024-12/w-1_instructions_2025.pdf',
    note: 'Occupational licence fee, resident rate 2.2%: Louisville Metro 1.25%, TARC 0.2%, school boards 0.75%. Applies to the whole of Jefferson County, not just the city.',
  },
  {
    id: 'kansas-city',
    kind: 'flatRate',
    name: 'Kansas City',
    stateCode: 'MO',
    metroId: '28140',
    rate: 0.01,
    prompt: 'Do you live inside Kansas City, Missouri?',
    source:
      'City of Kansas City, Missouri, Earnings Tax — https://www.kcmo.gov/city-hall/departments/finance/earnings-tax',
    note: 'Earnings tax, 1% of earned income. Paid by all KCMO residents wherever they work.',
  },
  {
    id: 'st-louis',
    kind: 'flatRate',
    name: 'St. Louis',
    stateCode: 'MO',
    metroId: '41180',
    rate: 0.01,
    prompt: 'Do you live inside the City of St. Louis?',
    source:
      'City of St. Louis Collector of Revenue, Earnings Tax — https://www.stlouis-mo.gov/government/departments/collector/earnings-tax/',
    note: 'Earnings tax, 1%. Paid by City of St. Louis residents regardless of where their employer is.',
  },
  {
    id: 'baltimore-city',
    kind: 'flatRate',
    name: 'Baltimore City',
    stateCode: 'MD',
    metroId: '12580',
    rate: 0.032,
    prompt: 'Do you live inside Baltimore City?',
    source:
      'Comptroller of Maryland, Withholding Tax Facts January 2026 - December 2026 — https://www.marylandcomptroller.gov/content/dam/mdcomp/tax/legal-publications/facts/withholding-tax-facts-2026.pdf',
    note:
      'Baltimore City local income tax, 3.20% for 2026. Maryland levies this on Maryland TAXABLE income rather than on gross, so applying it to gross overstates it by roughly the deduction times the rate — about $190 a year at $150,000. That is far smaller than the error it replaces: the Maryland state average is 2.40%, understating a Baltimore City resident by about $1,200 a year.',
  },
];

/**
 * Portland is the awkward one, and it is worth spelling out why.
 *
 * Two separate taxes overlap. Metro's Supportive Housing Services tax covers
 * the whole Metro district — parts of Multnomah, Washington and Clackamas
 * counties. Multnomah County's Preschool for All tax covers Multnomah County
 * only. A Portland resident pays BOTH; someone in Beaverton pays only the
 * first; someone outside the district pays neither.
 *
 * Both are bracketed rather than flat, and the brackets are the important part:
 * below $125,000 single or $200,000 joint, neither is owed at all. Modelling
 * Portland on Oregon's 0.18% state average charged everyone in the metro a
 * little and the people who actually owe these taxes far too little.
 *
 * Two caveats, both stated on the data page. The thresholds are inflation
 * adjusted from tax year 2026 and the adjusted figures were not published in
 * a form that could be sourced here, so these are the legislated base amounts.
 * And both taxes are levied on Oregon TAXABLE income while this applies them
 * to gross, which pulls a household just above a threshold in slightly early.
 */
/*
 * THE RATES HERE WERE A FULL POINT TOO HIGH, and Portland is expensive enough
 * that a wrong local rate is worth more than most state errors.
 *
 * We charged 2.5% and 4%. Multnomah County and the Portland Revenue Division —
 * the office that actually administers the tax — both say, word for word:
 * "1.5% on Multnomah County taxable income over $125,000 for individuals or
 * $200,000 for joint filers, and an additional 1.5%" above $250,000 and
 * $400,000. So 1.5% then 3%, not 2.5% then 4%.
 *
 * A single filer on $300,000 was being charged $5,125 against a true $3,375 —
 * $1,750 a year too much, on top of everything else Portland costs.
 *
 * The thresholds are NOT indexed, unlike the Metro tax below. The rate rises
 * by 0.8 points in 2027, to 2.3% and 3.8%, thresholds unchanged.
 */
const PORTLAND_MULTNOMAH = {
  id: 'portland-multnomah',
  kind: 'bracketed',
  name: 'Portland (Multnomah County)',
  stateCode: 'OR',
  source: 'https://www.multco.us/finance/preschool-all-personal-income-tax',
  brackets: {
    single: [
      { from: 0, rate: 0 },
      { from: 125_000, rate: 0.015 },
      { from: 250_000, rate: 0.03 },
    ],
    marriedJointly: [
      { from: 0, rate: 0 },
      { from: 200_000, rate: 0.015 },
      { from: 400_000, rate: 0.03 },
    ],
  },
};

/*
 * The Metro housing tax is 1%, unchanged — but its thresholds START MOVING in
 * 2026: $128,000 single and $205,000 joint, up from $125,000 and $200,000,
 * "adjusted annually for inflation" from this year on. The Preschool tax next
 * door is not indexed at all, so the two now drift apart and cannot share a
 * threshold.
 *
 * Metro's "joint" band also covers a HEAD OF HOUSEHOLD, which is why one is
 * declared here rather than left to fall back to the single schedule.
 */
const PORTLAND_METRO = {
  id: 'portland-metro',
  kind: 'bracketed',
  name: 'Greater Portland (Metro district)',
  stateCode: 'OR',
  source: 'https://www.portland.gov/revenue/personal-tax',
  brackets: {
    single: [
      { from: 0, rate: 0 },
      { from: 128_000, rate: 0.01 },
    ],
    marriedJointly: [
      { from: 0, rate: 0 },
      { from: 205_000, rate: 0.01 },
    ],
    headOfHousehold: [
      { from: 0, rate: 0 },
      { from: 205_000, rate: 0.01 },
    ],
  },
};


const NYC = {
  id: 'nyc',
  kind: 'bracketed',
  name: 'New York City',
  stateCode: 'NY',
  brackets: {
    single: [
      { from: 0, rate: 0.03078 },
      { from: 12_000, rate: 0.03762 },
      { from: 25_000, rate: 0.03819 },
      { from: 50_000, rate: 0.03876 },
    ],
    marriedJointly: [
      { from: 0, rate: 0.03078 },
      { from: 21_600, rate: 0.03762 },
      { from: 45_000, rate: 0.03819 },
      { from: 90_000, rate: 0.03876 },
    ],
  },
  standardDeduction: { single: 0, marriedJointly: 0 },
  exemptionPerDependent: 0,
  confidence: 'secondary — corroborated across independent sources; verify against NY Form IT-201 instructions before launch',
};

/** Yonkers levies a surcharge on the New York State liability, not on income. */
const YONKERS = {
  id: 'yonkers',
  kind: 'stateSurcharge',
  name: 'Yonkers',
  stateCode: 'NY',
  rate: 0.1675,
  confidence: 'secondary — verify current surcharge percentage before launch',
};

/**
 * Average effective local income tax rate as a share of AGI, by state.
 * Tax Foundation, "State Individual Income Tax Rates and Brackets, 2026",
 * footnote (a). Figures are 2023, the latest available.
 */
const STATE_AVERAGE_LOCAL = {
  AL: 0.0007,
  IN: 0.0035,
  IA: 0.0008,
  KY: 0.0093,
  MD: 0.0240,
  MI: 0.0016,
  MO: 0.0018,
  NY: 0.0160,
  OH: 0.0120,
  OR: 0.0018,
  PA: 0.0099,
};

/**
 * Is the local income tax effectively STATEWIDE, or confined to specific cities?
 *
 * This distinction matters more than it first appears. New York's 1.60% state
 * average is generated entirely by New York City and Yonkers — no other New
 * York locality levies an income tax at all. Applying that average to Buffalo
 * or Rochester would invent a tax that does not exist, and would do so at a
 * rate driven by a city 400 miles away.
 *
 * Where a tax is statewide (Maryland's counties, Ohio's municipalities,
 * Pennsylvania's earned income taxes, Indiana's counties, Kentucky's
 * occupational taxes, Iowa's school surtaxes), the state average is a fair
 * approximation for any metro in it.
 *
 * Where it is city-specific, the tax applies ONLY to the metros listed here.
 */
const STATEWIDE_LOCAL_TAX = new Set(['MD', 'OH', 'PA', 'IN', 'KY', 'IA']);

/** Metros in city-specific states that actually contain a taxing jurisdiction. */
const CITY_SPECIFIC_METROS = {
  MO: ['28140', '41180'],                            // Kansas City, St. Louis — 1% earnings tax
  OR: ['38900'],                                     // Portland metro — SHS and PFA taxes
  MI: ['19820', '22420', '24340', '29620', '40980'], // Detroit, Flint, Grand Rapids, Lansing, Saginaw
  AL: ['12220', '13820', '23460', '33660'],          // Auburn, Birmingham, Gadsden, Mobile
  // NY is handled separately: NYC and Yonkers only, and both are optional.
};

/** Cities whose actual rate materially exceeds their state average. */
const KNOWN_UNDERSTATED = {
  PA: 'Philadelphia levies a resident wage tax far above the Pennsylvania average of 0.99%.',
  OH: 'Columbus, Cleveland, Cincinnati and Toledo all levy municipal income taxes above the Ohio average of 1.2%.',
  MI: 'Detroit levies a resident income tax well above the Michigan average of 0.16%.',
  KY: 'Louisville and Lexington levy occupational taxes above the Kentucky average of 0.93%.',
  MO: 'Kansas City and St. Louis each levy a 1% earnings tax, against a Missouri average of 0.18%.',
  OR: 'The Portland metro levies supportive-housing and preschool taxes above the Oregon average of 0.18%.',
};

// --- assemble ---------------------------------------------------------------

const metrosMeta = JSON.parse(readFileSync(resolve(DATA_DIR, 'metros.json'), 'utf8'));

const jurisdictions = {
  [NYC.id]: NYC,
  [YONKERS.id]: YONKERS,
  [PORTLAND_MULTNOMAH.id]: PORTLAND_MULTNOMAH,
  [PORTLAND_METRO.id]: PORTLAND_METRO,
};

for (const [code, rate] of Object.entries(STATE_AVERAGE_LOCAL)) {
  const id = `avg-${code}`;
  jurisdictions[id] = {
    id,
    kind: 'flatRate',
    name: `${code} average local income tax`,
    stateCode: code,
    rate,
    isStateAverage: true,
    ...(KNOWN_UNDERSTATED[code] ? { understatementNote: KNOWN_UNDERSTATED[code] } : {}),
    confidence: 'secondary — state average, not a city-specific rate',
  };
}

/**
 * Metro -> applicable jurisdictions.
 *
 * `optional: true` means the interface must ask; the user genuinely may or may
 * not live inside the taxing boundary.
 */
for (const city of CITY_TAXES) {
  jurisdictions[city.id] = {
    id: city.id,
    kind: city.kind,
    name: city.name,
    stateCode: city.stateCode,
    rate: city.rate,
    isStateAverage: false,
    source: city.source,
    note: city.note,
  };
}

const CITY_BY_METRO = Object.fromEntries(CITY_TAXES.map((c) => [c.metroId, c]));
const PORTLAND_METRO_ID = '38900';

const byMetro = {};
const NEW_YORK_METRO = '35620';

for (const metro of Object.values(metrosMeta.metros)) {
  const state = metro.primaryState;
  const entries = [];

  if (metro.id === NEW_YORK_METRO) {
    entries.push(
      {
        jurisdictionId: 'nyc',
        optional: true,
        defaultApplies: true,
        prompt: 'Do you live in one of the five boroughs of New York City?',
      },
      {
        jurisdictionId: 'yonkers',
        optional: true,
        defaultApplies: false,
        prompt: 'Do you live in Yonkers?',
      },
    );
  } else if (state === 'NY') {
    // No New York locality outside NYC and Yonkers levies an income tax.
    // Deliberately empty.
  } else if (metro.id === PORTLAND_METRO_ID) {
    // Three genuine possibilities, exactly one of which applies: inside
    // Multnomah County (both taxes), elsewhere in the Metro district (the
    // housing tax only), or outside it (neither, so the state average).
    entries.push(
      {
        jurisdictionId: PORTLAND_MULTNOMAH.id,
        optional: true,
        defaultApplies: true,
        group: 'locality',
        label: 'Multnomah County',
        prompt: 'Do you live in Multnomah County, which includes most of Portland?',
      },
      {
        jurisdictionId: PORTLAND_METRO.id,
        optional: true,
        defaultApplies: false,
        group: 'locality',
        label: 'Rest of Metro',
        prompt: 'Do you live elsewhere inside the Metro district — Washington or Clackamas County?',
      },
      {
        jurisdictionId: 'avg-OR',
        optional: true,
        defaultApplies: false,
        group: 'locality',
        label: 'Outside Metro',
        prompt: 'Do you live outside the Metro district?',
      },
    );
  } else if (CITY_BY_METRO[metro.id]) {
    // The principal city and "somewhere else in this metro" are alternatives,
    // not additions. Exactly one applies, so they share a group.
    const city = CITY_BY_METRO[metro.id];
    entries.push(
      {
        jurisdictionId: city.id,
        optional: true,
        defaultApplies: true,
        group: 'locality',
        label: `Inside ${city.name}`,
        prompt: city.prompt,
      },
      {
        jurisdictionId: `avg-${state}`,
        optional: true,
        defaultApplies: false,
        group: 'locality',
        label: `Elsewhere in the metro (${state} average)`,
      },
    );
  } else if (STATEWIDE_LOCAL_TAX.has(state)) {
    entries.push({ jurisdictionId: `avg-${state}`, optional: false, defaultApplies: true });
  } else if (CITY_SPECIFIC_METROS[state]?.includes(metro.id)) {
    entries.push({ jurisdictionId: `avg-${state}`, optional: false, defaultApplies: true });
  }

  if (entries.length) byMetro[metro.id] = entries;
}

// --- sanity checks ----------------------------------------------------------

for (const [metroId, entries] of Object.entries(byMetro)) {
  const groups = {};
  for (const e of entries) {
    if (!e.group) continue;
    groups[e.group] ??= [];
    groups[e.group].push(e);
  }
  for (const [name, members] of Object.entries(groups)) {
    const defaults = members.filter((m) => m.defaultApplies).length;
    if (defaults !== 1) {
      throw new Error(
        `${metroId} group "${name}" has ${defaults} defaults — exactly one must apply, ` +
          `or the metro either double-counts a local tax or drops it`,
      );
    }
  }
}
for (const city of CITY_TAXES) {
  if (!byMetro[city.metroId]?.some((e) => e.jurisdictionId === city.id)) {
    throw new Error(`${city.name} was never attached to metro ${city.metroId}`);
  }
}

if (!byMetro[NEW_YORK_METRO]) throw new Error('New York metro has no local jurisdictions');
if (byMetro[NEW_YORK_METRO].length !== 2) throw new Error('expected NYC and Yonkers for the NY metro');

for (const [id, j] of Object.entries(jurisdictions)) {
  if (j.kind === 'flatRate' && (j.rate < 0 || j.rate > 0.05)) {
    throw new Error(`${id}: implausible flat rate ${j.rate}`);
  }
  if (j.kind === 'stateSurcharge' && (j.rate < 0 || j.rate > 0.5)) {
    throw new Error(`${id}: implausible surcharge ${j.rate}`);
  }
  if (j.kind === 'bracketed') {
    for (const schedule of ['single', 'marriedJointly']) {
      const b = j.brackets[schedule];
      if (!b?.length || b[0].from !== 0) throw new Error(`${id}/${schedule}: must start at 0`);
      for (let i = 1; i < b.length; i++) {
        if (b[i].from <= b[i - 1].from) throw new Error(`${id}/${schedule}: brackets out of order`);
        if (b[i].rate > 0.06) throw new Error(`${id}/${schedule}: implausible rate ${b[i].rate}`);
      }
    }
  }
}

const covered = Object.keys(byMetro).length;
if (covered < 40) throw new Error(`only ${covered} metros mapped — expected many more across 11 states`);

// Metros that must NOT carry a local income tax, because none exists there.
for (const [metroId, label] of [['15380', 'Buffalo'], ['40380', 'Rochester'], ['10580', 'Albany'], ['41700', 'San Antonio']]) {
  if (byMetro[metroId]) throw new Error(`${label} (${metroId}) should have no local income tax`);
}
if (!byMetro['28140'] || !byMetro['19820']) throw new Error('Kansas City and Detroit should carry a local income tax');

// --- emit -------------------------------------------------------------------

writeDataset(
  OUT,
  `${JSON.stringify(
    {
      datasetVersion: VERSION,
      taxYear: 2026,
      sources: [
        {
          name: 'New York City and Yonkers resident income tax',
          confidence: 'secondary — tax.ny.gov blocks automated access; figures corroborated across independent sources',
        },
        {
          name: 'Tax Foundation, "State Individual Income Tax Rates and Brackets, 2026", footnote (a) — average effective local income tax rates by state',
          url: 'https://taxfoundation.org/data/all/state/state-income-tax-rates-2026/',
          licence: 'CC BY-NC 4.0 — satisfied; this project is permanently non-commercial',
          confidence: 'secondary; underlying figures are 2023, the latest available',
        },
      ],
      limitations: [
        'Outside New York City and Yonkers, local income tax uses the STATE AVERAGE effective rate rather than a city-specific rate.',
        'This understates high-rate cities. Philadelphia, Columbus, Cleveland, Cincinnati, Detroit, Louisville, Kansas City, St. Louis and Portland all levy more than their state averages.',
        'It is accurate where local rates are uniform — Maryland counties all fall between 2.25% and 3.20% against a 2.4% average.',
        'Adding city-specific rates for the largest affected metros is the highest-value refinement to this dataset.',
        'New York City and Yonkers are modelled as OPTIONAL because the New York metro spans 22 counties and only five-borough residents pay the city tax.',
        'No New York locality outside New York City and Yonkers levies an income tax, so Buffalo, Rochester, Syracuse and Albany correctly carry none. Applying the NY state average there would invent a tax that does not exist.',
        'In Missouri, Oregon, Michigan and Alabama the tax is city-specific, so it is applied only to metros that actually contain a taxing jurisdiction.',
      ],
      jurisdictions,
      byMetro,
    },
    null,
    2,
  )}\n`,
);

// --- report -----------------------------------------------------------------

const stateCounts = {};
for (const metroId of Object.keys(byMetro)) {
  const state = metrosMeta.metros[metroId].primaryState;
  stateCounts[state] = (stateCounts[state] ?? 0) + 1;
}

console.log(`Wrote ${OUT}`);
console.log(`  jurisdictions defined: ${Object.keys(jurisdictions).length}`);
console.log(`  metros with a local income tax: ${covered} of ${Object.keys(metrosMeta.metros).length}`);
console.log('\n  by state:');
for (const [state, n] of Object.entries(stateCounts).sort((a, b) => b[1] - a[1])) {
  const rate = STATE_AVERAGE_LOCAL[state];
  const label = state === 'NY' ? 'NYC + Yonkers (optional), avg elsewhere' : `${(rate * 100).toFixed(2)}% average`;
  console.log(`    ${state}  ${String(n).padStart(3)} metros   ${label}`);
}
console.log('\n  NYC top marginal rate: 3.876% (single, above $50,000) — on top of New York State');
