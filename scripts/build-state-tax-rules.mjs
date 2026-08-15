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

// --- post-process ----------------------------------------------------------

const warnings = [];

/** Every state must carry an explicit decision, even if it is "not checked". */
function validateHeadOfHousehold(name, s) {
  const basis = s.headOfHouseholdBasis;
  if (!['own', 'marriedJointly', 'single', 'assumed-single'].includes(basis)) {
    throw new Error(`${name}: unknown headOfHouseholdBasis ${basis}`);
  }
  if (basis === 'own' && !(s.brackets.headOfHousehold || []).length) {
    throw new Error(`${name}: headOfHouseholdBasis is "own" but no schedule was supplied`);
  }
  if (basis !== 'own' && s.brackets.headOfHousehold) {
    throw new Error(`${name}: carries a head-of-household schedule its basis does not use`);
  }
  // A head of household is never taxed harder than a single filer on the same
  // income. If a transcription put a threshold in wrong, this catches it.
  if (basis === 'own') {
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
