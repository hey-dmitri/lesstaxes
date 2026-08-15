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
 *   Explicit, city-specific:  New York City, Yonkers, Philadelphia, Pittsburgh,
 *                             Detroit, Columbus, Cincinnati, Cleveland,
 *                             Louisville, Kansas City, St. Louis, Baltimore,
 *                             and Portland twice — Multnomah County's preschool
 *                             tax and the Metro housing tax
 *   Per county, weighted:     every Indiana metro, by population
 *   State-average fallback:   AL, IA, KY, MD, MI, MO, OH, PA — the smaller
 *                             cities, where an average is much closer to right
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
    // New York City publishes its own head-of-household schedule and this
    // carried none, so a single parent was silently charged on the single one.
    headOfHousehold: [
      { from: 0, rate: 0.03078 },
      { from: 14_400, rate: 0.03762 },
      { from: 30_000, rate: 0.03819 },
      { from: 60_000, rate: 0.03876 },
    ],
    marriedJointly: [
      { from: 0, rate: 0.03078 },
      { from: 21_600, rate: 0.03762 },
      { from: 45_000, rate: 0.03819 },
      { from: 90_000, rate: 0.03876 },
    ],
  },
  /*
   * ZERO ON BOTH, AND THAT IS THE STATE'S OWN ARITHMETIC, not a shortcut.
   *
   * The IT-201 instructions for line 47 say to carry the line 38 amount
   * straight across. Line 38 is New York STATE taxable income, which already
   * has the state standard or itemised deduction and the state's $1,000 per
   * dependent taken out of it. So the city tax sits on a figure that has been
   * reduced once, by the state, and the city adds no allowance of its own.
   *
   * The one case the instructions carve out is a taxpayer who gave to the New
   * York Charitable Gifts Trust Fund and itemised the gift, who adds it back
   * on a small worksheet. This site does not ask about charitable giving at
   * all, so there is nothing to add back.
   */
  standardDeduction: { single: 0, marriedJointly: 0 },
  exemptionPerDependent: 0,
  source:
    'New York State Department of Taxation and Finance, Instructions for Form IT-201, "New York City tax rate schedule" — https://www.tax.ny.gov/pdf/current_forms/it/it201i.pdf',
  /*
   * WHAT "CHECKED" MEANS HERE, precisely, because it is worth being exact.
   *
   * The rate schedules were read out of two New York documents that agree with
   * each other: the IT-201 instructions above (tax year 2025) and the IT-2105
   * estimated-payment instructions for tax year 2026, which carry the same
   * three schedules unchanged. Every rate and every bracket start matched what
   * was already shipped here.
   *
   * The retrieval was indirect. tax.ny.gov refused connections outright from
   * the machine doing the checking, so both PDFs came through a fetching
   * service pointed at those exact state URLs. The URL recorded is the state's
   * own and the documents are plainly genuine — full form structure, line
   * numbers, internal cross-references, and two separate documents agreeing —
   * but nobody here opened a socket to New York's server, and pretending
   * otherwise is the sort of small overclaim this project keeps finding in its
   * own prose.
   *
   * TWO LIMITS THIS MODEL HAS, both small and both in the reader's favour or
   * near enough:
   *
   * Below $65,000 of city taxable income the state says to use a lookup TABLE
   * of rounded amounts rather than these brackets. The table is built from
   * these same rates, so bracket arithmetic lands within a dollar or two — but
   * it is not the official method at those incomes.
   *
   * There is no city version of the state's high-income recapture. New York
   * State claws back the benefit of its lower brackets above $107,650; the
   * city has nothing of the kind, and its 3.876% top bracket simply runs to
   * the top. So four brackets are right at every income.
   */
  confidence: "primary — New York State's own IT-201 and IT-2105 instructions",
};

/** Yonkers levies a surcharge on the New York State liability, not on income. */
const YONKERS = {
  id: 'yonkers',
  kind: 'stateSurcharge',
  name: 'Yonkers',
  stateCode: 'NY',
  rate: 0.1675,
  /*
   * THE SURCHARGE IS ON STATE TAX AFTER CREDITS, which the engine already gets
   * right and which is worth writing down so it is not "simplified" later.
   *
   * The Yonkers worksheet at line 55 does not multiply the state liability. It
   * takes state tax from line 46, subtracts a list of credits — the child
   * credit, the real property tax credit, child and dependent care, earned
   * income, college tuition and others — and multiplies what is left by
   * 16.75%. Multiplying the pre-credit figure would overcharge every Yonkers
   * household that claims any of them.
   *
   * `computeLocalTax` is handed `state.tax`, which is this project's state
   * figure after its credits, so the basis is correct. Of the credits on the
   * state's list, only the earned income credit is modelled here; the others
   * are not, which leaves the Yonkers figure slightly high for a household
   * claiming them, in the same direction and for the same reason as New York's
   * own gap note.
   */
  source:
    'New York State Department of Taxation and Finance, Instructions for Form IT-201, Yonkers worksheet at line 55 — https://www.tax.ny.gov/pdf/current_forms/it/it201i.pdf',
  confidence: "primary — New York State's own IT-201 instructions, Yonkers worksheet",
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
/**
 * INDIANA'S COUNTY INCOME TAX, per metro.
 *
 * This was the largest single error in the dataset. Indiana was carrying the
 * state-average local rate of 0.35%, which is not merely low — it is below
 * the LOWEST county in the state. Porter County, the cheapest of the 92,
 * charges 0.50%; Randolph charges 3.00%. The population-weighted statewide
 * average is 1.7536%. We were understating Indiana tax by over $1,000 a year
 * and making the state look cheaper than it is, which is the direction that
 * sends somebody to the wrong city.
 *
 * WEIGHTED BY POPULATION, NOT TAKEN FROM THE PRINCIPAL COUNTY. Indiana taxes
 * by county of residence and a metro spans several counties, so a single
 * headline county would misrepresent most of the people in it. The Indiana
 * side of Chicago makes the case: Porter charges 0.50% and Jasper 2.8640%, a
 * spread of nearly six times, and Lake and Porter are both central so there is
 * no obvious principal county to pick. Indianapolis runs from Hamilton's
 * 1.10% to Morgan's 2.72%, and Marion — 45% of the metro — is not enough of it
 * for its 2.02% to stand in for the metro's 1.81%.
 *
 * Rates: Departmental Notice #1, effective 1 January 2026, cross-checked
 * against the rate chart printed on Schedule CT-40 for the prior year — the
 * two agree on 86 of 92 counties, and the six that differ are exactly the six
 * the notice flags as changed. Populations: Census Vintage 2025 estimates.
 *
 * ONE THING THIS CANNOT SEE. Indiana fixes your county on 1 January and does
 * not change it when you move, so somebody who moves INTO Indiana during the
 * year owes no county tax at all in year one unless they were already working
 * there on 1 January. This charges them from day one, which overstates their
 * first year — the safe direction, and noted.
 */
const INDIANA_COUNTY_TAX = {
  '26900': { rate: 0.018054, name: 'Indianapolis area counties' },
  '23060': { rate: 0.016286, name: 'Fort Wayne area counties' },
  '21780': { rate: 0.012073, name: 'Evansville area counties' },
  '43780': { rate: 0.0175, name: 'St. Joseph County' },
  '21140': { rate: 0.02, name: 'Elkhart County' },
  '29200': { rate: 0.014389, name: 'Lafayette area counties' },
  '34620': { rate: 0.015, name: 'Delaware County' },
  '45460': { rate: 0.019719, name: 'Terre Haute area counties' },
  '14020': { rate: 0.021877, name: 'Bloomington area counties' },
  '18020': { rate: 0.0175, name: 'Bartholomew County' },
  '29020': { rate: 0.0235, name: 'Howard County' },
  '33140': { rate: 0.0145, name: 'LaPorte County' },
  '16980': { rate: 0.013121, name: 'Indiana counties of the Chicago metro' },
  '31140': { rate: 0.018242, name: 'Indiana counties of the Louisville metro' },
  '17140': { rate: 0.015308, name: 'Indiana counties of the Cincinnati metro' },
};

/** Population-weighted across all 92 counties, for rural Indiana. */
const INDIANA_STATEWIDE_RATE = 0.017536;

const INDIANA_SOURCE = 'https://www.in.gov/dor/files/dn01.pdf';
const INDIANA_NOTE =
  'Indiana taxes by county of residence, and this is the population-weighted average of the counties in this metro. An individual county may be well above or below it — the state ranges from 0.50% to 3.00%. Indiana also fixes your county on 1 January and does not change it when you move, so someone moving into Indiana owes no county tax in their first year unless they already worked there; that is not modelled here, so a first year is overstated.';

const STATEWIDE_LOCAL_TAX = new Set(['MD', 'OH', 'PA', 'KY', 'IA']);

/** Metros in city-specific states that actually contain a taxing jurisdiction. */
const CITY_SPECIFIC_METROS = {
  MO: ['28140', '41180'],                            // Kansas City, St. Louis — 1% earnings tax
  OR: ['38900'],                                     // Portland metro — SHS and PFA taxes
  MI: ['19820', '22420', '24340', '29620', '40980'], // Detroit, Flint, Grand Rapids, Lansing, Saginaw
  AL: ['12220', '13820', '23460', '33660'],          // Auburn, Birmingham, Gadsden, Mobile
  // NY is handled separately: NYC and Yonkers only, and both are optional.
};

/** Cities whose actual rate materially exceeds their state average. */
/**
 * WHICH CITIES ARE STILL ON THE AVERAGE, by state.
 *
 * These notes used to name the cities the average understated, and they were
 * written when almost every big city was on it. As cities were given their own
 * published rates the notes were not revisited, so they ended up naming the
 * ones that had been fixed and missing the ones that had not.
 *
 * Michigan was exactly backwards: it warned about Detroit, which has carried
 * its own 2.4% for months, while Flint, Grand Rapids, Lansing and Saginaw all
 * still sit on a 0.16% average and all levy a real city tax.
 *
 * So the list now names ONLY cities that still fall back to the average, and
 * the note is generated around it. A state whose named cities are all modelled
 * gets no warning at all, because there is nothing left to warn about.
 */
const STILL_ON_THE_AVERAGE = {
  OH: ['Toledo'],
  KY: ['Lexington'],
  MI: ['Flint', 'Grand Rapids', 'Lansing', 'Saginaw'],
};

// --- assemble ---------------------------------------------------------------

/** "A, B and C" — so a generated sentence reads like a written one. */
const listOf = (names) =>
  names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;

const metrosMeta = JSON.parse(readFileSync(resolve(DATA_DIR, 'metros.json'), 'utf8'));

const jurisdictions = {
  [NYC.id]: NYC,
  [YONKERS.id]: YONKERS,
  [PORTLAND_MULTNOMAH.id]: PORTLAND_MULTNOMAH,
  [PORTLAND_METRO.id]: PORTLAND_METRO,
};

/*
 * INDIANA NO LONGER HAS A STATE AVERAGE, because every Indiana metro carries
 * its own counties' rates and the rural fallback carries the population-
 * weighted average of all 92. Leaving `avg-IN` defined left a jurisdiction in
 * the data that nothing referenced, describing a 0.35% rate the calculator had
 * stopped using — visible in the data browser and contradicted by this file's
 * own limitations.
 */
for (const [code, rate] of Object.entries(STATE_AVERAGE_LOCAL)) {
  if (code === 'IN') continue;
  // NEW YORK HAS NO STATE AVERAGE EITHER, for the opposite reason: no locality
  // outside New York City and Yonkers levies an income tax at all, so `byMetro`
  // deliberately assigns nothing to the other New York metros. `avg-NY` was
  // therefore referenced by nothing, while sitting in the data browser
  // advertising a 1.60% rate — which is really the city rate diluted across the
  // state, and would have been badly wrong anywhere it was applied.
  if (code === 'NY') continue;
  const id = `avg-${code}`;
  jurisdictions[id] = {
    id,
    kind: 'flatRate',
    name: `${code} average local income tax`,
    stateCode: code,
    rate,
    isStateAverage: true,
    ...(STILL_ON_THE_AVERAGE[code]
      ? {
          understatementNote:
            `${listOf(STILL_ON_THE_AVERAGE[code])} ` +
            `${STILL_ON_THE_AVERAGE[code].length === 1 ? 'levies' : 'levy'} a city income tax above this ` +
            `${(rate * 100).toFixed(2)}% average and are still charged the average here, which ` +
            `understates them. The state's larger cities now carry their own published rate.`,
        }
      : {}),
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

for (const [metroId, { rate, name }] of Object.entries(INDIANA_COUNTY_TAX)) {
  jurisdictions[`in-${metroId}`] = {
    id: `in-${metroId}`,
    kind: 'flatRate',
    name,
    stateCode: 'IN',
    rate,
    // Indiana charges the county rate on the SAME taxable income the state
    // taxes, after Indiana's exemptions — not on gross pay.
    appliesTo: 'stateTaxableIncome',
    isStateAverage: false,
    source: INDIANA_SOURCE,
    note: INDIANA_NOTE,
  };
}

jurisdictions['in-statewide'] = {
  id: 'in-statewide',
  kind: 'flatRate',
  name: 'Indiana county tax (statewide average)',
  stateCode: 'IN',
  rate: INDIANA_STATEWIDE_RATE,
  appliesTo: 'stateTaxableIncome',
  isStateAverage: true,
  source: INDIANA_SOURCE,
  note: INDIANA_NOTE,
};

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

  /*
   * Indiana is added regardless of the metro's primary state, because three of
   * its metros are led by Illinois, Kentucky and Ohio. The engine filters
   * jurisdictions by the state the reader picked, so the Indiana entry only
   * surfaces for someone on the Indiana side.
   */
  if (metro.states.includes('IN')) {
    entries.push({
      jurisdictionId: INDIANA_COUNTY_TAX[metro.id] ? `in-${metro.id}` : 'in-statewide',
      optional: false,
      defaultApplies: true,
    });
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
        'Thirteen cities carry their own published rate, through fourteen rules — Portland levies two, the Multnomah County preschool tax and the Metro housing tax. The others are New York City, Yonkers, Philadelphia, Detroit, Columbus, Cincinnati, Cleveland, Pittsburgh, Louisville, Kansas City, St. Louis and Baltimore. Every Indiana metro carries its counties\' rates weighted by population. Everywhere else uses the state average effective rate.',
        'Where a state average is still used it is for smaller cities, and the average is much closer to the truth there than it was for the large ones. It remains an average: an individual city may be above or below it.',
        'It is accurate where local rates are uniform — Maryland counties all fall between 2.25% and 3.20% against a 2.4% average.',
        'Indiana fixes your county on 1 January and does not change it when you move, so somebody moving into Indiana owes no county tax in their first year unless they already worked there. That is not modelled, so a first year is overstated.',
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
/*
 * COUNTED BY THE JURISDICTION EACH METRO ACTUALLY CARRIES, not by its primary
 * state's average rate.
 *
 * The old report keyed off primaryState and printed the state-average rate
 * beside it, which said "IN 13 metros 0.35% average" long after no Indiana
 * metro used that average at all — and printed "IL NaN%" for the Illinois
 * metros that carry Indiana jurisdictions, because Illinois has no average to
 * look up. A report that describes a dataset the build no longer produces is
 * worse than no report.
 */
const byKind = { named: 0, stateAverage: 0 };
for (const entries of Object.values(byMetro)) {
  for (const entry of entries) {
    const j = jurisdictions[entry.jurisdictionId];
    const state = j.stateCode;
    stateCounts[state] ??= { metros: 0, named: 0, average: 0 };
    stateCounts[state].metros += 1;
    if (j.isStateAverage) {
      stateCounts[state].average += 1;
      // The jurisdiction's OWN rate. Indiana's rural fallback is the average of
      // its 92 counties at 1.75%, not the 0.35% figure this state used to sit
      // on, and looking the label up by state code reprinted the old one.
      stateCounts[state].averageRate = j.kind === 'flatRate' ? j.rate : undefined;
      byKind.stateAverage += 1;
    } else {
      stateCounts[state].named += 1;
      byKind.named += 1;
    }
  }
}

console.log(`Wrote ${OUT}`);
console.log(`  jurisdictions defined: ${Object.keys(jurisdictions).length}`);
console.log(`  metros with a local income tax: ${covered} of ${Object.keys(metrosMeta.metros).length}`);
console.log('\n  by state:');
for (const [state, c] of Object.entries(stateCounts).sort((a, b) => b[1].metros - a[1].metros)) {
  const parts = [];
  if (c.named) parts.push(`${c.named} with published rates`);
  if (c.average) {
    const rate = c.averageRate ?? STATE_AVERAGE_LOCAL[state];
    parts.push(
      `${c.average} on the ${rate === undefined ? 'state' : `${(rate * 100).toFixed(2)}%`} average`,
    );
  }
  console.log(`    ${state}  ${String(c.metros).padStart(3)} entries   ${parts.join(', ')}`);
}
console.log(
  `\n  ${byKind.named} entries carry a published rate; ${byKind.stateAverage} still use a state average.`,
);
console.log('\n  NYC top marginal rate: 3.876% (single, above $50,000) — on top of New York State');
