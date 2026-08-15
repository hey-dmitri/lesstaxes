/**
 * Builds data/<version>/states.json from a committed snapshot of the
 * Tax Foundation state income tax table.
 *
 *   node scripts/build-state-tax-rules.mjs
 *
 * The snapshot lives in data/<version>/sources/ so this is fully reproducible
 * offline and the dataset can never change underneath a shared link.
 *
 * Tax Foundation content is CC BY-NC 4.0. This project is permanently
 * non-commercial (PROJECT.md section 1), so that licence is satisfied.
 * Attribution appears on the methodology page.
 *
 * KNOWN MODELLING DECISIONS — all deliberate, all disclosed:
 *
 *  1. Washington's 7%/9% applies to CAPITAL GAINS ONLY (source footnote tt).
 *     It is NOT a wage tax. Washington is therefore treated as having no wage
 *     income tax, alongside AK, FL, NV, NH, SD, TN, TX and WY.
 *
 *  2. Seven states levy their first positive rate above $0, leaving a
 *     zero-rate band below it. A {from: 0, rate: 0} bracket is prepended so
 *     every schedule starts at zero, as the engine requires.
 *
 *  3. The source publishes single and married-filing-jointly schedules only.
 *     Married-filing-separately and head-of-household are mapped to the single
 *     schedule. This is correct for MFS in most states and a documented
 *     approximation for head of household.
 *
 *  4. Some states express personal/dependent allowances as tax CREDITS rather
 *     than income exemptions. These are captured separately, because a credit
 *     reduces tax while an exemption reduces taxable income.
 *
 *  5. Income-based phase-outs of deductions, exemptions and credits (roughly a
 *     dozen states) are NOT modelled. They bite mainly at high incomes. Each
 *     affected state carries the source footnote so the limitation is visible
 *     on the methodology page.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CURRENT_DATASET_VERSION } from './lib/version.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
/** Overridable so a new dated release can be built without editing every script. */
const VERSION = process.env.DATASET_VERSION || CURRENT_DATASET_VERSION;
const DATA_DIR = resolve(HERE, '..', 'data', VERSION);
const SNAPSHOT = resolve(DATA_DIR, 'sources', 'taxfoundation-state-income-tax-2026.html');
const OUT = resolve(DATA_DIR, 'states.json');

const SOURCE_URL = 'https://taxfoundation.org/data/all/state/state-income-tax-rates-2026/';

/** Washington's schedule is capital-gains only — never a wage tax. */
const CAPITAL_GAINS_ONLY = new Set(['Washington']);

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
  Wyoming: 'WY', 'Washington DC': 'DC',
};

// --- tiny HTML helpers -----------------------------------------------------

const stripTags = (s) => s.replace(/<[^>]+>/g, ' ');

function unescapeHtml(s) {
  return s
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#8217;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)));
}

const clean = (s) => unescapeHtml(stripTags(s)).replace(/\s+/g, ' ').trim();

function parseMoney(raw) {
  const s = String(raw ?? '').replace(/[$,]/g, '').trim();
  if (!s || /^(n\.?a\.?|none|-)$/i.test(s)) return null;
  return /^-?[\d.]+$/.test(s) ? Number(s) : s; // non-numeric kept for credit strings
}

function parseRate(raw) {
  const s = String(raw ?? '').trim();
  const m = /^([\d.]+)%$/.exec(s);
  if (!m) return null;
  // Rates are stored as FRACTIONS. Round to kill float noise (2.2% -> 0.022).
  return Number((Number(m[1]) / 100).toFixed(6));
}

/** "153 credit" -> 153 */
function creditAmount(v) {
  if (typeof v !== 'string') return null;
  const m = /([\d,.]+)\s*credit/i.exec(v);
  return m ? Number(m[1].replace(/,/g, '')) : null;
}

// --- parse -----------------------------------------------------------------

const html = readFileSync(SNAPSHOT, 'utf8');

const tables = html.match(/<table[\s\S]*?<\/table>/g) ?? [];
if (tables.length < 2) throw new Error(`expected >=2 tables in snapshot, found ${tables.length}`);
const table = tables[1];

const rows = (table.match(/<tr[\s\S]*?<\/tr>/g) ?? [])
  .map((r) => (r.match(/<t[dh][^>]*>[\s\S]*?<\/t[dh]>/g) ?? []).map(clean))
  .filter((cells) => cells.length > 0);

// Footnote text, keyed by letter.
const footnoteText = {};
{
  const tail = html.split('</table>').pop() ?? '';
  const flat = unescapeHtml(stripTags(tail)).replace(/\s+/g, ' ');
  for (const m of flat.matchAll(/\(([a-z]{1,2})\)\s+([^(]{25,}?)(?=\s*\([a-z]{1,2}\)\s|$)/g)) {
    footnoteText[m[1]] = m[2].trim();
  }
}

const states = {};
let current = null;

for (const cells of rows.slice(1)) {
  const first = cells[0] ?? '';
  if (!first || /^State$/i.test(first)) continue;

  let key = current;

  if (!first.startsWith('-')) {
    const m = /^(.*?)\s*\(([^)]*)\)\s*$/.exec(first);
    const name = (m ? m[1] : first).trim();
    if (!STATE_CODES[name]) continue; // skip stray rows

    const footnotes = m ? m[2].split(',').map((x) => x.trim()).filter(Boolean) : [];
    key = name;
    current = name;

    const sdSingle = parseMoney(cells[7]);
    const sdCouple = parseMoney(cells[8]);
    const peSingle = parseMoney(cells[9]);
    const peCouple = parseMoney(cells[10]);
    const peDep = parseMoney(cells[11]);

    states[name] = {
      code: STATE_CODES[name],
      name,
      hasWageIncomeTax: true,
      brackets: { single: [], marriedJointly: [] },
      standardDeduction: {
        single: typeof sdSingle === 'number' ? sdSingle : 0,
        marriedJointly: typeof sdCouple === 'number' ? sdCouple : 0,
      },
      personalExemption: {
        single: typeof peSingle === 'number' ? peSingle : 0,
        marriedJointly: typeof peCouple === 'number' ? peCouple : 0,
        dependent: typeof peDep === 'number' ? peDep : 0,
      },
      personalCredit: {
        single: creditAmount(peSingle) ?? 0,
        marriedJointly: creditAmount(peCouple) ?? 0,
        dependent: creditAmount(peDep) ?? 0,
      },
      federalTaxDeductible: footnotes.includes('b'),
      hasLocalIncomeTax: footnotes.includes('a'),
      footnotes,
      notes: [],
    };
  }

  if (!key || !states[key]) continue;

  const sRate = parseRate(cells[1]);
  const sFrom = parseMoney(cells[3]);
  if (sRate !== null && typeof sFrom === 'number') {
    states[key].brackets.single.push({ from: sFrom, rate: sRate });
  }

  const jRate = parseRate(cells[4]);
  const jFrom = parseMoney(cells[6]);
  if (jRate !== null && typeof jFrom === 'number') {
    states[key].brackets.marriedJointly.push({ from: jFrom, rate: jRate });
  }
}


/**
 * HOW EACH STATE TREATS A HEAD OF HOUSEHOLD.
 *
 * Tax Foundation publishes single and married-filing-jointly columns only, so
 * this cannot come from the source above. It has to be read off each state's
 * own publication, and until it is, the honest label is "assumed-single" —
 * NOT "single", which would claim a check nobody performed.
 *
 * That distinction is the whole point. Every graduated state was silently
 * treated as though a head of household files on the single schedule, and in
 * California that overcharged a single parent $2,028 a year on $120,000 of
 * taxable income. The state publishes its own Schedule Z. Maryland sends them
 * to the JOINT schedule outright. Nobody had looked.
 *
 * Each entry below was read from the state's own revenue department, and the
 * URL and date are recorded so the next person can re-check rather than
 * re-trust. Anything absent from this table stays "assumed-single" and shows
 * up in the coverage report the build prints.
 */
const HEAD_OF_HOUSEHOLD = {
  California: {
    basis: 'own',
    // FTB 2025 Schedule Z. Plus the 1% Mental Health Services surcharge above
    // $1M, which the schedules omit and which is applied to every status.
    brackets: [
      { from: 0, rate: 0.01 },
      { from: 22_173, rate: 0.02 },
      { from: 52_530, rate: 0.04 },
      { from: 67_716, rate: 0.06 },
      { from: 83_805, rate: 0.08 },
      { from: 98_990, rate: 0.093 },
      { from: 505_208, rate: 0.103 },
      { from: 606_251, rate: 0.113 },
      { from: 1_000_000, rate: 0.123 },
      { from: 1_010_417, rate: 0.133 },
    ],
    source: 'https://www.ftb.ca.gov/forms/2025/2025-540-tax-rate-schedules.pdf',
    checked: '2026-08-15',
  },
  Maryland: {
    // "Taxpayers Filing Joint Returns, Head of Household, or Qualifying
    // Widows/Widowers" — one table, stated in those words.
    basis: 'marriedJointly',
    source: 'https://www.marylandtaxes.gov/individual/income/tax-info/tax-rates.php',
    checked: '2026-08-15',
  },
  Minnesota: {
    basis: 'own',
    // Minnesota publishes tax year 2026 already, unlike most states.
    brackets: [
      { from: 0, rate: 0.0535 },
      { from: 41_010, rate: 0.068 },
      { from: 164_800, rate: 0.0785 },
      { from: 270_060, rate: 0.0985 },
    ],
    source: 'https://www.revenue.state.mn.us/minnesota-income-tax-rates-and-brackets',
    checked: '2026-08-15',
  },
  Maine: {
    basis: 'own',
    brackets: [
      { from: 0, rate: 0.058 },
      { from: 40_200, rate: 0.0675 },
      { from: 95_150, rate: 0.0715 },
    ],
    standardDeduction: 22_500,
    source: 'https://www.maine.gov/revenue/sites/maine.gov.revenue/files/inline-files/ind_tax_rate_sched_2025.pdf',
    checked: '2026-08-15',
  },
  'New York': {
    // New York publishes no separate head-of-household RATE schedule — the
    // brackets are shared with single filers — but it does publish its own
    // standard deduction, and $11,200 against $8,000 is real money that this
    // engine was throwing away.
    basis: 'own',
    standardDeduction: 11_200,
    source: 'https://www.tax.ny.gov/forms/html-instructions/2025/it/it201i-2025.htm',
    checked: '2026-08-15',
  },
  Connecticut: {
    basis: 'own',
    // Every threshold sits between the single and joint ones rather than
    // matching either, so neither fallback would have been right.
    brackets: [
      { from: 0, rate: 0.02 },
      { from: 16_000, rate: 0.045 },
      { from: 80_000, rate: 0.055 },
      { from: 160_000, rate: 0.06 },
      { from: 320_000, rate: 0.065 },
      { from: 400_000, rate: 0.069 },
      { from: 800_000, rate: 0.0699 },
    ],
    source: 'https://portal.ct.gov/drs/drs-forms/current-year-forms/calculators-and-tables',
    checked: '2026-08-15',
  },
  'New Jersey': {
    /*
     * NJ-1040 Rate Schedules: Table A is "Single / Married filing separate",
     * Table B is "Married/CU couple filing joint return / HEAD OF HOUSEHOLD /
     * Qualifying widow(er)". The tax table columns say the same thing more
     * bluntly: "1 or 3" against "2, 4, or 5", where 4 is head of household.
     */
    basis: 'marriedJointly',
    source: 'https://www.nj.gov/treasury/taxation/pdf/current/njtaxratesch.pdf',
    checked: '2026-08-15',
  },
  /*
   * These five publish ONE rate schedule and one set of allowances for
   * everybody. Verified rather than assumed, which is the whole point of
   * recording it: Ohio's own return groups "Single, head of household or
   * qualifying surviving spouse" as a single filing status, and Virginia goes
   * further — a head of household IS filing status 1, Single, with a tick-box.
   */
  Ohio: {
    basis: 'single',
    source: 'https://tax.ohio.gov/individual/file-now/annual-tax-rates',
    checked: '2026-08-15',
  },
  Virginia: {
    basis: 'single',
    source: 'https://www.tax.virginia.gov/sites/default/files/vatax-pdf/2025-760-instructions.pdf',
    checked: '2026-08-15',
  },
  Wisconsin: {
    // "For single taxpayers, taxpayers qualified to file as head of household,
    // estates, and trusts" — the state's own rate page, in those words.
    basis: 'single',
    source: 'https://www.revenue.wi.gov/Pages/FAQS/pcs-taxrates.aspx',
    checked: '2026-08-15',
  },
  'South Carolina': {
    basis: 'single',
    source: 'https://dor.sc.gov/sites/dor/files/forms/SC1040Instr_2025.pdf',
    checked: '2026-08-15',
  },
  Missouri: {
    /*
     * One rate chart for everybody, but a much larger standard deduction: MO
     * conforms to the FEDERAL figure, which is $24,150 for a head of household
     * against $16,100 for a single filer. Taking the single figure was costing
     * them roughly $380 a year. There is also a $1,400 additional exemption
     * that only a head of household or qualifying widow(er) may claim.
     */
    basis: 'own',
    standardDeduction: 24_150,
    personalExemption: 1_400,
    source: 'https://dor.mo.gov/forms/4711_2025.pdf',
    checked: '2026-08-15',
  },
  Hawaii: {
    basis: 'own',
    // Schedule III, "Unmarried Heads of Households", tax years after 2024.
    brackets: [
      { from: 0, rate: 0.014 },
      { from: 14_400, rate: 0.032 },
      { from: 21_600, rate: 0.055 },
      { from: 28_800, rate: 0.064 },
      { from: 36_000, rate: 0.068 },
      { from: 54_000, rate: 0.072 },
      { from: 72_000, rate: 0.076 },
      { from: 187_500, rate: 0.079 },
      { from: 262_500, rate: 0.0825 },
      { from: 337_500, rate: 0.09 },
      { from: 412_500, rate: 0.1 },
      { from: 487_500, rate: 0.11 },
    ],
    source: 'https://tax.hawaii.gov/forms/d_25table-on/d_25table-on_p13/',
    checked: '2026-08-15',
  },
  Oklahoma: {
    /*
     * The rate table is headed "Head of Household, Married Filing Jointly OR
     * Widow(er)" — one schedule for all three. But the standard deduction is
     * $9,350, its own figure between the single $6,350 and the joint $12,700,
     * which is why allowances are looked up separately from brackets.
     */
    basis: 'marriedJointly',
    standardDeduction: 9_350,
    source: 'https://oklahoma.gov/tax/individuals/pay-taxes.html',
    checked: '2026-08-15',
  },
  /*
   * NEBRASKA AND VERMONT ARE DELIBERATELY ABSENT, and the build guard is why.
   *
   * Both publish their own head-of-household schedule and I transcribed both.
   * Nebraska's 2025 schedule has FOUR brackets topping at 5.20%; the brackets
   * this project ships are 2026, where the statute collapses the top two into
   * one 4.55% band. Setting a 2025 schedule against 2026 single brackets made a
   * head of household pay MORE than a single filer at $120,000, and the guard
   * threw rather than shipping it. Vermont is the same story with different
   * numbers.
   *
   * Mixing tax years within one state is the error this whole exercise exists
   * to remove, so both wait for their 2026 figures.
   */
  'New Mexico': {
    // Statute 7-2-7, effective 1 January 2025: one table for "married
    // individuals filing joint returns, heads of household and surviving
    // spouses".
    basis: 'marriedJointly',
    source: 'https://law.justia.com/codes/new-mexico/chapter-7/article-2/section-7-2-7-d-1/',
    checked: '2026-08-15',
  },
  Oregon: {
    /*
     * Joint brackets, own deduction — the Oklahoma shape again. Form OR-40
     * itself prints "Head of household $4,560" against a single filer's $2,835
     * and a joint $5,670, so sending the deduction with the brackets would have
     * been $1,110 too generous.
     */
    basis: 'marriedJointly',
    /*
     * The published 2025 figure. Oregon indexes annually and its 2026 head-of-
     * household deduction is not out, so this is very slightly low — against
     * the reader, which is the safe direction. The alternative was letting it
     * fall back to the joint $5,820, which would be $1,260 too generous. No
     * figure is invented here; a real published one is used a year late and
     * said so.
     */
    standardDeduction: 4_560,
    source: 'https://www.oregon.gov/dor/forms/FormsPubs/form-or-40_101-040_2025.pdf',
    checked: '2026-08-15',
  },
  'North Dakota': {
    basis: 'own',
    brackets: [
      { from: 0, rate: 0 },
      { from: 64_950, rate: 0.0195 },
      { from: 271_450, rate: 0.025 },
    ],
    source: 'https://www.tax.nd.gov/individual-income-tax',
    checked: '2026-08-15',
  },
};


/**
 * MANDATORY EMPLOYEE PAYROLL CONTRIBUTIONS.
 *
 * Eleven states deduct disability or paid-leave contributions from every
 * paycheque by law. They are not income tax, they are not FICA, and this engine
 * modelled none of them. California's is the largest by a distance: 1.3% of
 * ALL wages with no ceiling at all, which is $1,300 a year at $100,000 and
 * $3,900 at $300,000. Every Californian on this site was shown that money as
 * theirs to spend.
 *
 * Rates are the 2026 EMPLOYEE share. Several programmes split the cost with the
 * employer and the split varies with headcount; where it does, the figure here
 * is the employee share at a normal-sized employer, which is what a person
 * reading a payslip will see.
 *
 * DEDUCTIBLE ONES ARE MARKED. The IRS treats mandatory contributions to the
 * California, New Jersey and New York disability funds, the Rhode Island
 * temporary disability fund and the Washington supplemental workers'
 * compensation fund as state income tax for Schedule A. The newer paid-leave
 * programmes have no such ruling, so they are not claimed as deductible —
 * understating a deduction is the safe direction.
 *
 * Maine and Delaware are deliberately absent: their employee share exists only
 * if the employer elects to split the cost, so there is no figure that is true
 * for everyone. DC's programme is employer-funded entirely.
 *
 * Source: EY, "2026 state disability, paid family and medical leave and
 * long-term care insurance wage base and rates", 5 January 2026, cross-checked
 * against each state's own labour department where it publishes one.
 */
const SS_WAGE_BASE_2026 = 184_500;

const PAYROLL_CONTRIBUTIONS = {
  California: [
    { id: 'ca-sdi', name: 'State Disability Insurance', rate: 0.013, wageCap: null, deductible: true },
  ],
  'New Jersey': [
    { id: 'nj-tdi', name: 'Temporary Disability Insurance', rate: 0.0019, wageCap: 171_100, deductible: true },
    { id: 'nj-fli', name: 'Family Leave Insurance', rate: 0.0023, wageCap: 171_100, deductible: true },
  ],
  'New York': [
    // Half a per cent of weekly wages, but capped at 60 cents a week, which
    // binds for anyone earning over $6,240 — so in practice a flat $31.20.
    { id: 'ny-dbl', name: 'Disability Benefits Law', rate: 0.005, wageCap: 6_240, deductible: true },
    { id: 'ny-pfl', name: 'Paid Family Leave', rate: 0.00432, wageCap: 95_348.76, deductible: true },
  ],
  'Rhode Island': [
    { id: 'ri-tdi', name: 'Temporary Disability Insurance', rate: 0.011, wageCap: 100_000, deductible: true },
  ],
  Washington: [
    // 71.43% of a 1.13% total premium.
    { id: 'wa-pfml', name: 'Paid Family and Medical Leave', rate: 0.0113 * 0.7143, wageCap: SS_WAGE_BASE_2026, deductible: true },
  ],
  Hawaii: [
    // Half a per cent, capped at $7.50 a week.
    { id: 'hi-tdi', name: 'Temporary Disability Insurance', rate: 0.005, wageCap: 78_000, deductible: false },
  ],
  Connecticut: [
    { id: 'ct-pfl', name: 'Paid Leave', rate: 0.005, wageCap: SS_WAGE_BASE_2026, deductible: false },
  ],
  Colorado: [
    { id: 'co-famli', name: 'Family and Medical Leave Insurance', rate: 0.0044, wageCap: SS_WAGE_BASE_2026, deductible: false },
  ],
  Massachusetts: [
    { id: 'ma-pfml', name: 'Paid Family and Medical Leave', rate: 0.0046, wageCap: SS_WAGE_BASE_2026, deductible: false },
  ],
  Oregon: [
    { id: 'or-pfml', name: 'Paid Leave Oregon', rate: 0.006, wageCap: SS_WAGE_BASE_2026, deductible: false },
  ],
  Minnesota: [
    { id: 'mn-paid-leave', name: 'Paid Leave', rate: 0.0044, wageCap: SS_WAGE_BASE_2026, deductible: false },
  ],
};

const PAYROLL_SOURCE = {
  citation: 'EY, "2026 state disability, paid family and medical leave and long-term care insurance wage base and rates" (5 January 2026), cross-checked against state labour departments',
  url: 'https://taxnews.ey.com/news/2026-0131-2026-state-disability-paid-family-and-medical-leave-and-long-term-care-insurance-wage-base-and-rates',
  checked: '2026-08-15',
};


/**
 * COMMUNITY PROPERTY STATES.
 *
 * In these nine, a married couple filing separately does not each report what
 * they earned. IRS Publication 555: "A spouse's wages, earnings, and net
 * profits from a sole proprietorship are community income and must be evenly
 * split." Each return carries half the combined wages, whichever spouse
 * actually earned them.
 *
 * The engine already split a couple's income when BOTH of them earned. It
 * treated one earner filing separately as a single return carrying the whole
 * salary, which is right in the other 41 states and wrong here: in Texas at
 * $150,000 that overstated federal tax by $9,394.
 *
 * PAYROLL TAX DOES NOT SPLIT. Publication 555 is explicit that self-employment
 * tax follows the spouse carrying on the business, and the same logic holds for
 * Social Security and Medicare: they are levied on the person who earned the
 * wage, not on whoever reports it. So the income tax halves and the payroll tax
 * does not, which is why this cannot be faked by pretending there are two
 * earners.
 *
 * Alaska, Tennessee, South Dakota and Florida allow couples to ELECT community
 * property treatment. Publication 555 explicitly does not address the election
 * and it is not the default, so they are not included.
 *
 * Source: IRS Publication 555 (rev. December 2024).
 * https://www.irs.gov/pub/irs-pdf/p555.pdf
 */
const COMMUNITY_PROPERTY = new Set([
  'Arizona',
  'California',
  'Idaho',
  'Louisiana',
  'Nevada',
  'New Mexico',
  'Texas',
  'Washington',
  'Wisconsin',
]);


/**
 * FIGURES READ OFF THE STATE'S OWN PUBLICATION, overriding the aggregator.
 *
 * Tax Foundation is a good secondary source for brackets and it is where every
 * bracket here comes from. It is not the state, and where the two disagree the
 * state wins.
 *
 * California is the first one checked in detail and it found three things: a
 * dependent credit that was carrying the PERSONAL credit's value, a standard
 * deduction a year out of date, and no head-of-household deduction at all when
 * California gives one the same as a joint filer's.
 */
const STATE_OVERRIDES = {
  California: {
    // FTB Tax News, October 2025: "2025 Indexing".
    standardDeduction: { single: 5_706, marriedJointly: 11_412, headOfHousehold: 11_412 },
    personalCredit: {
      single: 153,
      marriedJointly: 306,
      headOfHousehold: 153,
      // $475, not $153. The dependent credit was carrying the personal credit's
      // figure, understating a family with two children by $644 a year.
      dependent: 475,
    },
    source: 'https://www.ftb.ca.gov/about-ftb/newsroom/tax-news/2025/10.html',
    checked: '2026-08-15',
    note: 'Exemption credits phase out above $252,203 single / $504,411 joint / $378,310 head of household. Not modelled.',
  },
};


/**
 * STATE ITEMISED DEDUCTIONS.
 *
 * The engine always applied the state STANDARD deduction, even though it
 * already knew the reader's property tax and mortgage interest. California and
 * New York both let you itemise on the state return whether or not you itemised
 * federally, and California's rules are far more generous than the federal ones:
 *
 *   - No SALT cap. California explicitly does not conform to OBBBA's
 *     "increased limitation on individual deductions for certain state and
 *     local taxes" — Schedule CA (540) instructions, "What's New".
 *   - Mortgage interest on acquisition debt up to $1,000,000, not $750,000.
 *     FTB's own deductions page states both figures side by side.
 *
 * On a San Jose buyer at $300,000 the two together are worth roughly $6,600 of
 * California tax.
 *
 * WHAT IS DEDUCTED HERE is only what this engine actually knows: property tax
 * and mortgage interest. A real Schedule CA also carries charitable giving,
 * medical costs above 7.5% of income and miscellaneous deductions above 2% —
 * none of which this site asks about. So the figure is a floor, and a reader
 * with those will do better than it says.
 *
 * STATE INCOME TAX IS NOT DEDUCTED. California requires it subtracted on
 * Schedule CA; you cannot deduct California tax from California income.
 *
 * NOT MODELLED, and it runs the reader's way: California reduces itemised
 * deductions for high earners, by the lesser of 6% of income above roughly
 * $252,000 or 80% of the deductions. Above that income this figure is a little
 * too generous.
 *
 * Only California is populated. Every other state keeps the standard deduction
 * until its own rules have been read, which is the same honesty rule the
 * head-of-household table uses.
 */
const ITEMIZED_DEDUCTIONS = {
  California: {
    deductPropertyTax: true,
    deductStateIncomeTax: false,
    mortgageDebtLimit: 1_000_000,
    source: 'https://www.ftb.ca.gov/file/personal/deductions/index.html',
    checked: '2026-08-15',
    note: 'California itemised deductions here cover property tax and mortgage interest only — the two figures this site knows. Charitable giving, medical costs and miscellaneous deductions are not asked about and are not included. The high-income reduction of itemised deductions is not modelled.',
  },
};


/**
 * STATE EARNED INCOME CREDITS.
 *
 * The federal EITC is modelled; the states that add their own on top were not,
 * so the households least able to absorb a wrong answer were the ones getting
 * one. Most states set theirs as a flat percentage of the federal credit, which
 * makes it straightforward once the federal figure exists.
 *
 * ONLY WHERE SOURCES AGREE. NCSL (May 2026), the IRS's own list and ITEP's 2025
 * appendix disagree on several states — Massachusetts reads 30% or 40%
 * depending which you open, Vermont and Virginia and DC are all mid-change.
 * Anything where two independent sources do not match is left out rather than
 * guessed, which is the same rule the head-of-household table follows.
 *
 * DELIBERATELY ABSENT and why:
 *   CA, MN, WA   own formulas, not a percentage of the federal credit at all
 *   DE           taxpayer chooses between a refundable and a larger
 *                nonrefundable credit, and this engine cannot make that choice
 *   MA, VT, VA   sources disagree or the credit is mid-change
 *   DC           85% in 2025 rising to 100%, and the sources differ on when
 *   OR           9%, or 12% with a child under three; this site never asks a
 *                child's age, so the lower figure would be a guess either way
 *
 * REFUNDABILITY MATTERS MORE THAN THE PERCENTAGE for this audience. A
 * refundable credit pays out below zero tax; a nonrefundable one stops at zero
 * and is worth nothing to a household that already owes nothing, which is
 * exactly the household it is aimed at.
 *
 * Sources: NCSL "Earned Income Tax Credit Overview" table 2 (May 2026); IRS
 * "States and local governments with Earned Income Tax Credit"; ITEP "State
 * Earned Income Tax Credits in 2025".
 */
const STATE_EITC = {
  Colorado: { percent: 0.5, refundable: true },
  Connecticut: { percent: 0.4, refundable: true },
  Hawaii: { percent: 0.4, refundable: true },
  Illinois: { percent: 0.2, refundable: true },
  Indiana: { percent: 0.1, refundable: true },
  Iowa: { percent: 0.15, refundable: true },
  Kansas: { percent: 0.17, refundable: true },
  Louisiana: { percent: 0.05, refundable: true },
  Michigan: { percent: 0.3, refundable: true },
  Missouri: { percent: 0.1, refundable: false },
  Montana: { percent: 0.2, refundable: true },
  Nebraska: { percent: 0.1, refundable: true },
  'New Jersey': { percent: 0.4, refundable: true },
  'New Mexico': { percent: 0.25, refundable: true },
  'New York': { percent: 0.3, refundable: true },
  Ohio: { percent: 0.3, refundable: false },
  Oklahoma: { percent: 0.05, refundable: true },
  'Rhode Island': { percent: 0.16, refundable: true },
  'South Carolina': { percent: 1.25, refundable: false },
  Utah: { percent: 0.2, refundable: false },

  // These vary with the number of children, which the engine knows.
  Maine: { byChildren: { 0: 0.5, 1: 0.25, 2: 0.25, 3: 0.25 }, refundable: true },
  Maryland: { byChildren: { 0: 1.0, 1: 0.5, 2: 0.5, 3: 0.5 }, refundable: true },
  Wisconsin: { byChildren: { 0: 0, 1: 0.04, 2: 0.11, 3: 0.34 }, refundable: true },
};

const STATE_EITC_SOURCE = {
  citation: 'NCSL "Earned Income Tax Credit Overview" (May 2026), cross-checked against the IRS list of states with an EITC and ITEP "State Earned Income Tax Credits in 2025"',
  url: 'https://www.ncsl.org/human-services/earned-income-tax-credit-overview',
  checked: '2026-08-15',
};

// --- post-process ----------------------------------------------------------

const warnings = [];

/** Every state must carry an explicit decision, even if it is "not checked". */
function validateHeadOfHousehold(name, s) {
  const basis = s.headOfHouseholdBasis;
  if (!['own', 'marriedJointly', 'single', 'assumed-single'].includes(basis)) {
    throw new Error(`${name}: unknown headOfHouseholdBasis ${basis}`);
  }
  // A basis of "own" must bring SOMETHING of its own, but it need not be
  // brackets — New York publishes its own deduction on the shared schedule.
  if (
    basis === 'own' &&
    !(s.brackets.headOfHousehold || []).length &&
    s.standardDeduction.headOfHousehold === undefined &&
    s.personalExemption.headOfHousehold === undefined
  ) {
    throw new Error(`${name}: headOfHouseholdBasis is "own" but nothing of its own was supplied`);
  }
  if (basis !== 'own' && s.brackets.headOfHousehold) {
    throw new Error(`${name}: carries a head-of-household schedule its basis does not use`);
  }
  // A head of household is never taxed harder than a single filer on the same
  // income. If a transcription put a threshold in wrong, this catches it.
  if (basis === 'own' && (s.brackets.headOfHousehold || []).length) {
    for (const income of [30_000, 60_000, 120_000, 250_000]) {
      const asHoh = applyBracketsLocal(income, s.brackets.headOfHousehold);
      const asSingle = applyBracketsLocal(income, s.brackets.single);
      if (asHoh > asSingle + 0.01) {
        throw new Error(
          `${name}: head of household pays more than single at $${income} ` +
            `(${asHoh.toFixed(2)} vs ${asSingle.toFixed(2)}) — check the transcription`,
        );
      }
    }
  }
}

/** Local copy so this script stays free of engine imports. */
function applyBracketsLocal(income, brackets) {
  let tax = 0;
  for (let i = 0; i < brackets.length; i++) {
    const from = brackets[i].from;
    if (income <= from) break;
    const to = i + 1 < brackets.length ? Math.min(income, brackets[i + 1].from) : income;
    tax += (to - from) * brackets[i].rate;
  }
  return tax;
}

for (const [name, s] of Object.entries(states)) {
  s.notes = s.footnotes.map((f) => footnoteText[f]).filter(Boolean);

  const eitc = STATE_EITC[name];
  s.earnedIncomeCredit = eitc
    ? {
        percentOfFederal: eitc.percent ?? null,
        byChildren: eitc.byChildren ?? null,
        refundable: eitc.refundable,
      }
    : null;
  if (eitc) {
    const rates = eitc.byChildren ? Object.values(eitc.byChildren) : [eitc.percent];
    for (const r of rates) {
      if (!(r >= 0 && r <= 1.5)) throw new Error(`${name}: implausible EITC match ${r}`);
    }
  }

  const itemized = ITEMIZED_DEDUCTIONS[name];
  s.itemizedDeductions = itemized
    ? {
        deductPropertyTax: itemized.deductPropertyTax,
        deductStateIncomeTax: itemized.deductStateIncomeTax,
        mortgageDebtLimit: itemized.mortgageDebtLimit,
        source: { url: itemized.source, checked: itemized.checked },
      }
    : null;
  if (itemized?.note) s.notes.push(itemized.note);

  const override = STATE_OVERRIDES[name];
  if (override) {
    if (override.standardDeduction) Object.assign(s.standardDeduction, override.standardDeduction);
    if (override.personalCredit) Object.assign(s.personalCredit, override.personalCredit);
    if (override.personalExemption) Object.assign(s.personalExemption, override.personalExemption);
    s.verifiedAgainstState = { url: override.source, checked: override.checked };
    if (override.note) s.notes.push(override.note);
  }

  s.communityProperty = COMMUNITY_PROPERTY.has(name);
  s.payrollContributions = PAYROLL_CONTRIBUTIONS[name] ?? [];
  for (const c of s.payrollContributions) {
    if (!(c.rate > 0 && c.rate < 0.05)) {
      throw new Error(`${name}: implausible payroll contribution rate ${c.rate} for ${c.id}`);
    }
    if (c.wageCap !== null && !(c.wageCap > 1_000)) {
      throw new Error(`${name}: implausible wage cap ${c.wageCap} for ${c.id}`);
    }
  }

  const hoh = HEAD_OF_HOUSEHOLD[name];
  s.headOfHouseholdBasis = hoh ? hoh.basis : 'assumed-single';
  if (hoh?.brackets) s.brackets.headOfHousehold = hoh.brackets;
  if (hoh?.standardDeduction !== undefined) {
    s.standardDeduction.headOfHousehold = hoh.standardDeduction;
  }
  if (hoh?.personalExemption !== undefined) {
    s.personalExemption.headOfHousehold = hoh.personalExemption;
  }
  if (hoh) s.headOfHouseholdSource = { url: hoh.source, checked: hoh.checked };
  validateHeadOfHousehold(name, s);

  if (CAPITAL_GAINS_ONLY.has(name)) {
    s.hasWageIncomeTax = false;
    s.brackets = { single: [], marriedJointly: [] };
    s.notes.unshift(
      'Levies a tax on capital gains income only. There is no tax on wage income, so this calculator treats the state income tax on salary as zero.',
    );
    continue;
  }

  if (s.brackets.single.length === 0) {
    s.hasWageIncomeTax = false;
    continue;
  }

  // Prepend an explicit zero-rate band where the first positive rate starts
  // above $0, so every schedule begins at zero as the engine requires.
  for (const status of ['single', 'marriedJointly']) {
    const b = s.brackets[status];
    if (b.length > 0 && b[0].from !== 0) {
      b.unshift({ from: 0, rate: 0 });
      s.notes.push(
        `Income below $${b[1].from.toLocaleString()} (${status === 'single' ? 'single' : 'married filing jointly'}) is not taxed.`,
      );
    }
  }

  // Fall back to the single schedule if a joint schedule is missing.
  if (s.brackets.marriedJointly.length === 0) {
    s.brackets.marriedJointly = s.brackets.single.map((x) => ({ ...x }));
    warnings.push(`${name}: no joint schedule published; reused single schedule`);
  }

  // Validate.
  for (const status of ['single', 'marriedJointly']) {
    const b = s.brackets[status];
    if (b[0].from !== 0) warnings.push(`${name}/${status}: does not start at 0`);
    for (let i = 0; i < b.length; i++) {
      if (b[i].rate < 0 || b[i].rate > 1) warnings.push(`${name}/${status}: rate ${b[i].rate} out of range`);
      if (i > 0 && b[i].from <= b[i - 1].from) warnings.push(`${name}/${status}: bracket ${i} out of order`);
    }
  }
}

// --- sanity checks: fail loudly rather than emit a corrupt dataset ----------

const count = Object.keys(states).length;
if (count !== 51) throw new Error(`expected 51 jurisdictions (50 states + DC), got ${count}`);

const noTax = Object.values(states).filter((s) => !s.hasWageIncomeTax).map((s) => s.code).sort();
const EXPECTED_NO_TAX = ['AK', 'FL', 'NH', 'NV', 'SD', 'TN', 'TX', 'WA', 'WY'];
if (JSON.stringify(noTax) !== JSON.stringify(EXPECTED_NO_TAX)) {
  throw new Error(`no-wage-tax states changed.\n  expected: ${EXPECTED_NO_TAX}\n  got:      ${noTax}`);
}

const topRate = Math.max(
  ...Object.values(states).flatMap((s) => s.brackets.single.map((b) => b.rate)),
);
if (topRate > 0.15) throw new Error(`implausible top state rate ${topRate}`);

// --- emit ------------------------------------------------------------------

const byCode = {};
for (const s of Object.values(states).sort((a, b) => a.code.localeCompare(b.code))) {
  byCode[s.code] = s;
}

const output = {
  taxYear: 2026,
  datasetVersion: VERSION,
  source: {
    citation: 'Tax Foundation, "State Individual Income Tax Rates and Brackets, 2026"',
    url: SOURCE_URL,
    licence: 'CC BY-NC 4.0 — satisfied because this project is permanently non-commercial',
    snapshot: `data/${VERSION}/sources/taxfoundation-state-income-tax-2026.html`,
    confidence: 'secondary — reputable aggregator of state statutes; high-population states spot-verified against state revenue departments',
  },
  payrollContributionSource: PAYROLL_SOURCE,
  earnedIncomeCreditSource: STATE_EITC_SOURCE,
  filingStatusMapping: {
    single: 'single',
    marriedJointly: 'marriedJointly',
    marriedSeparately: 'single',
    headOfHousehold: 'single',
    _note:
      'The source publishes single and joint schedules only. MFS maps to single (correct in most states); head of household maps to single (a documented approximation — some states publish distinct HoH schedules).',
  },
  limitations: [
    'Income-based phase-outs of standard deductions, personal exemptions and credits are not modelled. They mainly affect high earners; affected states carry the source footnote in `notes`.',
    'States allowing a deduction for federal income tax paid (AL, MO, OR) are flagged via `federalTaxDeductible` but the circular federal/state dependency is not yet resolved iteratively.',
    'Local income taxes are excluded here and handled separately; see local.json.',
    'Alternative minimum taxes, recapture provisions and supplemental high-income surtaxes beyond the published bracket schedule are not modelled.',
  ],
  states: byCode,
};

writeFileSync(OUT, `${JSON.stringify(output, null, 2)}\n`);

// --- report ----------------------------------------------------------------

const withTax = Object.values(byCode).filter((s) => s.hasWageIncomeTax);
console.log(`Wrote ${OUT}`);
console.log(`  jurisdictions:        ${count}`);
console.log(`  with wage income tax: ${withTax.length}`);
console.log(`  no wage income tax:   ${noTax.length} (${noTax.join(', ')})`);
console.log(`  flat tax (1 bracket): ${withTax.filter((s) => s.brackets.single.length === 1).length}`);
console.log(`  federal tax deductible: ${Object.values(byCode).filter((s) => s.federalTaxDeductible).map((s) => s.code).join(', ')}`);
console.log(`  have local income tax:  ${Object.values(byCode).filter((s) => s.hasLocalIncomeTax).map((s) => s.code).join(', ')}`);
console.log(`  top marginal rate:      ${(topRate * 100).toFixed(2)}%`);

/*
 * HEAD OF HOUSEHOLD COVERAGE, printed every build.
 *
 * The point of printing it is that the unchecked states stay visible. They
 * were invisible before, which is how California went years overcharging a
 * single parent $2,028 on $120,000 while the code called it "conservative".
 */
const graduated = Object.values(byCode).filter(
  (s) => s.hasWageIncomeTax && s.brackets.single.length > 1,
);
const checked = graduated.filter((s) => s.headOfHouseholdBasis !== 'assumed-single');
const unchecked = graduated.filter((s) => s.headOfHouseholdBasis === 'assumed-single');
console.log(`\n  HEAD OF HOUSEHOLD — ${checked.length} of ${graduated.length} graduated states verified`);
for (const s of checked) {
  console.log(`    ${s.code}  ${s.headOfHouseholdBasis.padEnd(15)} ${s.headOfHouseholdSource.url}`);
}
console.log(`  NOT yet checked against the state's own publication (${unchecked.length}):`);
console.log(`    ${unchecked.map((s) => s.code).join(' ')}`);
if (warnings.length) {
  console.log('\nWARNINGS:');
  for (const w of warnings) console.log(`  - ${w}`);
} else {
  console.log('\nNo warnings.');
}
