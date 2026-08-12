/**
 * Generates the Stage 1 review page: worked tax examples that can be checked
 * row by row against any online tax calculator.
 *
 *   npx tsx scripts/report-tax-examples.ts > /tmp/tax-examples.html
 *
 * This exists so the project owner, who does not write code, can verify the
 * tax engine before any interface is built on top of it.
 */

import { formatUSD, formatPercent } from '../engine/money';
import { computeFederal } from '../engine/tax/federal';
import { computeFica } from '../engine/tax/fica';
import {
  FEDERAL_RULES_2026,
  FICA_RULES_2026,
  IRS_GOLDEN_VALUES,
  STATE_RULES_2026,
  stateRules,
  ALL_STATE_CODES,
  NO_WAGE_TAX_STATES,
} from '../engine/tax/rules';
import { applyBrackets } from '../engine/tax/brackets';
import { computeStateTax } from '../engine/tax/state';
import type { FilingStatus } from '../engine/types';

interface Scenario {
  label: string;
  salary: number;
  filingStatus: FilingStatus;
  children: number;
  stateCode: string;
}

const SCENARIOS: Scenario[] = [
  { label: 'Single, no kids', salary: 75_000, filingStatus: 'single', children: 0, stateCode: 'IL' },
  { label: 'Single, no kids', salary: 150_000, filingStatus: 'single', children: 0, stateCode: 'IL' },
  { label: 'Single, no kids', salary: 150_000, filingStatus: 'single', children: 0, stateCode: 'TX' },
  { label: 'Single, no kids', salary: 150_000, filingStatus: 'single', children: 0, stateCode: 'CA' },
  { label: 'Single, no kids', salary: 150_000, filingStatus: 'single', children: 0, stateCode: 'NY' },
  { label: 'Married, 2 kids', salary: 150_000, filingStatus: 'marriedJointly', children: 2, stateCode: 'IL' },
  { label: 'Married, 2 kids', salary: 150_000, filingStatus: 'marriedJointly', children: 2, stateCode: 'TX' },
  { label: 'Married, no kids', salary: 250_000, filingStatus: 'marriedJointly', children: 0, stateCode: 'CA' },
  { label: 'Married, 3 kids', salary: 90_000, filingStatus: 'marriedJointly', children: 3, stateCode: 'OH' },
  { label: 'Head of household, 1 kid', salary: 85_000, filingStatus: 'headOfHousehold', children: 1, stateCode: 'PA' },
  { label: 'Single, high earner', salary: 600_000, filingStatus: 'single', children: 0, stateCode: 'NJ' },
  { label: 'Married, high earner', salary: 900_000, filingStatus: 'marriedJointly', children: 2, stateCode: 'CA' },
];

const STATUS_LABEL: Record<FilingStatus, string> = {
  single: 'Single',
  marriedJointly: 'Married filing jointly',
  marriedSeparately: 'Married filing separately',
  headOfHousehold: 'Head of household',
};

function runScenario(s: Scenario) {
  const state = computeStateTax(
    { grossSalary: s.salary, filingStatus: s.filingStatus, children: s.children },
    stateRules(s.stateCode),
  );

  // Renter with no local income tax — isolates federal + state + FICA.
  const federal = computeFederal(
    {
      grossSalary: s.salary,
      filingStatus: s.filingStatus,
      children: s.children,
      stateAndLocalIncomeTax: state.tax,
      propertyTax: 0,
      mortgageInterest: 0,
    },
    FEDERAL_RULES_2026,
  );

  const fica = computeFica(s.salary, s.filingStatus, FICA_RULES_2026);
  const total = federal.tax + state.tax + fica.total;

  return {
    ...s,
    state,
    federal,
    fica,
    total,
    takeHome: s.salary - total,
    effectiveRate: total / s.salary,
  };
}

const esc = (v: string) =>
  v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const rows = SCENARIOS.map(runScenario);

// --- golden value table ----------------------------------------------------

const goldenRows = (Object.keys(IRS_GOLDEN_VALUES) as FilingStatus[]).flatMap((status) =>
  IRS_GOLDEN_VALUES[status].map((g) => {
    const ours = applyBrackets(g.taxableIncome, FEDERAL_RULES_2026.brackets[status]);
    return {
      status,
      taxableIncome: g.taxableIncome,
      irs: g.tax,
      ours,
      match: Math.abs(ours - g.tax) < 0.005,
    };
  }),
);

const allGoldenMatch = goldenRows.every((r) => r.match);

// --- state comparison at a fixed salary ------------------------------------

const COMPARE_SALARY = 150_000;
const stateComparison = ALL_STATE_CODES.map((code) => {
  const r = computeStateTax(
    { grossSalary: COMPARE_SALARY, filingStatus: 'single', children: 0 },
    stateRules(code),
  );
  return { code, name: STATE_RULES_2026[code].name, tax: r.tax };
}).sort((a, b) => b.tax - a.tax);

// --- render ----------------------------------------------------------------

console.log(`<title>LessTaxes — Stage 1: Tax Engine Verification</title>
<style>
  /* Light palette: cool carbon-paper neutrals, ink-blue accent.
     Green/red are verification semantics only, never decoration. */
  :root {
    --ground:#f7f8fa; --surface:#ffffff; --ink:#171a21; --muted:#656d7e;
    --rule:#e1e5ec; --rule-strong:#c9d0dc; --accent:#2c4c8c;
    --good:#0f7a4d; --good-ground:#e8f4ee; --bad:#b4241c; --bad-ground:#fbecea;
  }
  @media (prefers-color-scheme: dark) {
    :root:not([data-theme="light"]) {
      --ground:#101319; --surface:#171b23; --ink:#e6e9ef; --muted:#8e97a8;
      --rule:#262c38; --rule-strong:#39414f; --accent:#7fa3e8;
      --good:#4ade80; --good-ground:#12281d; --bad:#f87171; --bad-ground:#2c1616;
    }
  }
  :root[data-theme="dark"] {
    --ground:#101319; --surface:#171b23; --ink:#e6e9ef; --muted:#8e97a8;
    --rule:#262c38; --rule-strong:#39414f; --accent:#7fa3e8;
    --good:#4ade80; --good-ground:#12281d; --bad:#f87171; --bad-ground:#2c1616;
  }

  *, *::before, *::after { box-sizing:border-box; }

  body {
    margin:0; padding:3rem 1.25rem 6rem;
    background:var(--ground); color:var(--ink);
    font:16px/1.65 ui-sans-serif,-apple-system,"Segoe UI",system-ui,sans-serif;
    -webkit-font-smoothing:antialiased;
  }
  .wrap { max-width:900px; margin:0 auto; display:flex; flex-direction:column; gap:0; }

  .eyebrow {
    font-size:.7rem; letter-spacing:.14em; text-transform:uppercase;
    color:var(--muted); font-weight:600; margin:0 0 .6rem;
  }
  h1 {
    font-family:ui-serif,Georgia,"Iowan Old Style","Times New Roman",serif;
    font-size:2.1rem; font-weight:600; letter-spacing:-.015em;
    line-height:1.15; text-wrap:balance; margin:0 0 .5rem;
  }
  .sub { color:var(--muted); margin:0 0 2.5rem; font-size:.95rem; }

  h2 {
    font-family:ui-serif,Georgia,"Iowan Old Style","Times New Roman",serif;
    font-size:1.25rem; font-weight:600; letter-spacing:-.01em;
    margin:3.25rem 0 .35rem; padding-top:1.5rem;
    border-top:1px solid var(--rule-strong); text-wrap:balance;
  }
  h2 .idx {
    font-family:ui-monospace,SFMono-Regular,Menlo,monospace;
    font-size:.8rem; color:var(--accent); margin-right:.6rem;
    font-weight:700; letter-spacing:0;
  }

  /* Certification block — deliberately reads as a stamped attestation,
     not a rounded card with an accent rail. */
  .attest {
    display:flex; align-items:baseline; gap:1.25rem; flex-wrap:wrap;
    background:var(--surface); border:1px solid var(--rule-strong);
    border-top:3px double var(--rule-strong);
    padding:1.15rem 1.35rem; margin:0 0 1rem;
  }
  .attest .tally {
    font-family:ui-monospace,SFMono-Regular,Menlo,monospace;
    font-variant-numeric:tabular-nums; font-size:1.7rem; font-weight:700;
    letter-spacing:-.02em; color:var(--good); line-height:1;
  }
  .attest.failed .tally { color:var(--bad); }
  .attest .claim { font-size:.92rem; color:var(--ink); flex:1 1 18rem; }
  .attest .claim em { color:var(--muted); font-style:normal; display:block;
                      font-size:.85rem; margin-top:.15rem; }

  .note { color:var(--muted); font-size:.87rem; margin:.6rem 0 0; max-width:65ch; }

  .scroll {
    overflow-x:auto; -webkit-overflow-scrolling:touch;
    margin:1.25rem 0 0; border:1px solid var(--rule); background:var(--surface);
  }
  table { border-collapse:collapse; width:100%; font-size:.86rem; }
  th, td {
    padding:.55rem .8rem; text-align:right; white-space:nowrap;
    border-bottom:1px solid var(--rule);
  }
  th:first-child, td:first-child { text-align:left; }
  thead th {
    position:sticky; top:0; background:var(--surface);
    color:var(--muted); font-weight:600; font-size:.68rem;
    text-transform:uppercase; letter-spacing:.09em;
    border-bottom:1px solid var(--rule-strong);
  }
  tbody tr:last-child td { border-bottom:none; }
  tbody tr:hover td { background:color-mix(in srgb, var(--accent) 5%, transparent); }

  /* Every figure is monospaced and column-aligned — this is a ledger. */
  .num {
    font-family:ui-monospace,SFMono-Regular,Menlo,monospace;
    font-variant-numeric:tabular-nums;
  }
  .verdict { font-weight:700; }
  .verdict.ok { color:var(--good); }
  .verdict.no { color:var(--bad); }
  .muted { color:var(--muted); }
  .zero { color:var(--muted); }

  code {
    font-family:ui-monospace,SFMono-Regular,Menlo,monospace;
    background:color-mix(in srgb, var(--ink) 7%, transparent);
    padding:.12em .38em; border-radius:3px; font-size:.85em;
  }
  ul { padding-left:1.15rem; max-width:68ch; }
  li { margin:.5rem 0; }
  a { color:var(--accent); }
  a:focus-visible, tr:focus-visible { outline:2px solid var(--accent); outline-offset:2px; }
</style>
<div class="wrap">
<p class="eyebrow">LessTaxes &middot; Stage 1 of 10</p>
<h1>Tax Engine Verification</h1>
<p class="sub">Tax year 2026 &middot; dataset <code>2026.1</code> &middot; federal, FICA and all 51 state jurisdictions</p>

<div class="attest${allGoldenMatch ? '' : ' failed'}">
  <span class="tally">${goldenRows.filter((r) => r.match).length}&thinsp;/&thinsp;${goldenRows.length}</span>
  <span class="claim">
    IRS-published figures reproduced exactly.
    <em>${allGoldenMatch
      ? 'Every cumulative amount in the official rate tables matches to the cent.'
      : 'MISMATCH — do not build on this until resolved.'}</em>
  </span>
</div>
<p class="note"><strong>How to check this yourself:</strong> take any row from section 2 into an
online tax calculator set to tax year 2026. The federal, state and FICA figures should agree.
Section 1 is self-verifying &mdash; it compares our arithmetic against numbers the IRS printed
in its own tables.</p>

<h2><span class="idx">01</span>Golden values &mdash; our arithmetic against the IRS&rsquo;s published figures</h2>
<p class="note">The IRS rate tables state the cumulative tax at each bracket threshold
(&ldquo;$56,631 plus 35% of the excess over $256,200&rdquo;). Reproducing those exactly proves
both that the brackets were transcribed correctly and that the bracket arithmetic is right.
Source: IRS Rev. Proc. 2025-32, Tables 1&ndash;4.</p>
<div class="scroll"><table>
<thead><tr><th>Filing status</th><th>Taxable income</th><th>IRS published</th><th>LessTaxes</th><th>Match</th></tr></thead>
<tbody>
${goldenRows
  .map(
    (r) => `<tr>
  <td>${esc(STATUS_LABEL[r.status])}</td>
  <td class="num">${formatUSD(r.taxableIncome)}</td>
  <td class="num">$${r.irs.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
  <td class="num">$${r.ours.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
  <td class="verdict ${r.match ? 'ok' : 'no'}">${r.match ? '✓' : '✗'}</td>
</tr>`,
  )
  .join('\n')}
</tbody></table></div>

<h2><span class="idx">02</span>Worked examples &mdash; check any row against an online calculator</h2>
<p class="note">Renter, no local income tax, wage income only, standard deduction unless
itemizing wins. Federal + state + FICA.</p>
<div class="scroll"><table>
<thead><tr>
  <th>Scenario</th><th>State</th><th>Salary</th><th>Federal</th><th>State</th>
  <th>FICA</th><th>Total tax</th><th>Take-home</th><th>Eff. rate</th>
</tr></thead>
<tbody>
${rows
  .map(
    (r) => `<tr>
  <td>${esc(r.label)}</td>
  <td>${esc(r.stateCode)}</td>
  <td class="num">${formatUSD(r.salary)}</td>
  <td class="num">${formatUSD(r.federal.tax)}</td>
  <td class="num">${formatUSD(r.state.tax)}</td>
  <td class="num">${formatUSD(r.fica.total)}</td>
  <td class="num"><strong>${formatUSD(r.total)}</strong></td>
  <td class="num">${formatUSD(r.takeHome)}</td>
  <td class="num muted">${formatPercent(r.effectiveRate)}</td>
</tr>`,
  )
  .join('\n')}
</tbody></table></div>

<h2><span class="idx">03</span>State income tax on $150,000 &mdash; single filer, all 51 jurisdictions</h2>
<p class="note">Sorted highest to lowest. The nine states at $0 levy no tax on wage income.</p>
<div class="scroll"><table>
<thead><tr><th>State</th><th>Code</th><th>Tax on $150,000</th><th>Effective rate</th></tr></thead>
<tbody>
${stateComparison
  .map(
    (s) => `<tr>
  <td>${esc(s.name)}</td>
  <td class="muted">${esc(s.code)}</td>
  <td class="num${s.tax === 0 ? ' zero' : ''}">${formatUSD(s.tax)}</td>
  <td class="num muted">${formatPercent(s.tax / COMPARE_SALARY, 2)}</td>
</tr>`,
  )
  .join('\n')}
</tbody></table></div>

<h2><span class="idx">04</span>Coverage and known limitations</h2>
<ul>
  <li><strong>${ALL_STATE_CODES.length} jurisdictions</strong> &mdash; 50 states plus DC.</li>
  <li><strong>${NO_WAGE_TAX_STATES.length} with no wage income tax:</strong>
      ${NO_WAGE_TAX_STATES.join(', ')}.
      Washington is included here because its 7%/9% tax applies to
      <em>capital gains only</em>, not wages.</li>
  <li><strong>Head of household and married-filing-separately</strong> use each state&rsquo;s
      single schedule. Correct for MFS in most states; an approximation for head of household.</li>
  <li><strong>Income-based phase-outs</strong> of state deductions, exemptions and credits
      are not modelled. They mainly affect high earners.</li>
  <li><strong>Alabama, Missouri and Oregon</strong> allow deducting federal tax from state
      taxable income. Flagged in the data but not yet modelled &mdash; it creates a circular
      dependency that needs iterative solving.</li>
  <li><strong>Social Security</strong> is capped once per household rather than per worker,
      which understates it for dual-earner couples above the wage base.</li>
  <li><strong>Local income taxes</strong> &mdash; engine complete and tested (flat rate,
      bracketed, and state-surcharge forms). Rate data for New York City, Yonkers,
      Philadelphia, Ohio cities, Maryland counties and Detroit is pending: those rates are
      metro-keyed and land with the Stage 2 dataset.</li>
</ul>
</div>`);
