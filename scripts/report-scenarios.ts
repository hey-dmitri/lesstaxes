/**
 * Generates the Stage 3 review page: complete scenarios computed end to end,
 * with every intermediate number visible.
 *
 *   npx tsx scripts/report-scenarios.ts > .stage3-report.html
 */

import { compare, defaultCityInputs } from '../engine/compare';
import { DATASET_VERSION, metro } from '../engine/dataset';
import { formatPercent, formatUSD } from '../engine/money';
import type { ComparisonResult, FilingStatus, Household } from '../engine/types';

interface Scenario {
  title: string;
  note: string;
  from: string;
  to: string;
  salary: number;
  destinationSalary?: number;
  filingStatus: FilingStatus;
  children: number;
  fromTenure?: 'rent' | 'own';
  toTenure?: 'rent' | 'own';
}

const SCENARIOS: Scenario[] = [
  {
    title: 'Chicago → Austin, with a pay cut',
    note: 'The original example. A $25,000 pay cut in exchange for no state income tax.',
    from: '16980', to: '12420', salary: 150_000, destinationSalary: 125_000,
    filingStatus: 'single', children: 0,
  },
  {
    title: 'Chicago → Austin, same salary',
    note: 'The same move if the employer matches the salary.',
    from: '16980', to: '12420', salary: 150_000,
    filingStatus: 'single', children: 0,
  },
  {
    title: 'New York → Austin, family, renting',
    note: 'Leaving both New York State and New York City income tax.',
    from: '35620', to: '12420', salary: 200_000, destinationSalary: 170_000,
    filingStatus: 'marriedJointly', children: 2,
  },
  {
    title: 'Chicago → Austin, renting then buying',
    note: 'Renting in Chicago, buying in Austin. Mortgage and property tax appear; itemising may start to beat the standard deduction.',
    from: '16980', to: '12420', salary: 150_000,
    filingStatus: 'marriedJointly', children: 2,
    fromTenure: 'rent', toTenure: 'own',
  },
  {
    title: 'San Francisco → Dallas',
    note: 'The classic tech relocation, at a substantial pay cut.',
    from: '41860', to: '19100', salary: 250_000, destinationSalary: 200_000,
    filingStatus: 'marriedJointly', children: 2,
  },
  {
    title: 'Seattle → Portland',
    note: 'The reverse case: leaving a no-income-tax state for a high-income-tax one.',
    from: '42660', to: '38900', salary: 180_000,
    filingStatus: 'single', children: 0,
  },
];

function run(s: Scenario): { s: Scenario; r: ComparisonResult; household: Household } {
  const household: Household = { filingStatus: s.filingStatus, children: s.children };
  const r = compare({
    datasetVersion: DATASET_VERSION,
    household,
    origin: defaultCityInputs(s.from, s.salary, household, s.fromTenure ?? 'rent'),
    destination: defaultCityInputs(
      s.to,
      s.destinationSalary ?? s.salary,
      household,
      s.toTenure ?? 'rent',
    ),
  });
  return { s, r, household };
}

const results = SCENARIOS.map(run);

const esc = (v: string) => v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const money = (v: number) => formatUSD(v);
const signed = (v: number) => formatUSD(v, { signed: true });
const cls = (v: number) => (v > 0 ? 'up' : v < 0 ? 'down' : 'flat');

const STATUS: Record<FilingStatus, string> = {
  single: 'Single',
  marriedJointly: 'Married filing jointly',
  marriedSeparately: 'Married filing separately',
  headOfHousehold: 'Head of household',
};

function waterfall(r: ComparisonResult) {
  const sameSalary = r.destination.grossSalary !== r.origin.grossSalary;
  const mid = r.destinationAtOriginSalary;

  // [label, origin, destination-at-origin-salary, destination, isTotal, federalRule]
  const rows: Array<[string, number, number, number, boolean, boolean]> = [
    ['Gross salary', r.origin.grossSalary, mid.grossSalary, r.destination.grossSalary, false, false],
    ['Federal income tax', -r.origin.tax.federal, -mid.tax.federal, -r.destination.tax.federal, false, true],
    ['State income tax', -r.origin.tax.state, -mid.tax.state, -r.destination.tax.state, false, false],
    ['Local income tax', -r.origin.tax.local, -mid.tax.local, -r.destination.tax.local, false, false],
    ['Social Security & Medicare', -r.origin.tax.fica, -mid.tax.fica, -r.destination.tax.fica, false, true],
    ['Housing', -r.origin.housing.shelter, -mid.housing.shelter, -r.destination.housing.shelter, false, false],
    ['Property tax', -r.origin.housing.propertyTax, -mid.housing.propertyTax, -r.destination.housing.propertyTax, false, false],
    ['Cars & transport', -r.origin.living.transport, -mid.living.transport, -r.destination.living.transport, false, false],
    ['Food', -r.origin.living.food, -mid.living.food, -r.destination.living.food, false, false],
    ['Utilities', -r.origin.living.utilities, -mid.living.utilities, -r.destination.living.utilities, false, false],
    ['Healthcare', -r.origin.living.healthcare, -mid.living.healthcare, -r.destination.living.healthcare, false, false],
    ['Everything else', -r.origin.living.other, -mid.living.other, -r.destination.living.other, false, false],
    ['Sales tax', -r.origin.salesTax, -mid.salesTax, -r.destination.salesTax, false, false],
    ['In your pocket', r.origin.leftover, mid.leftover, r.destination.leftover, true, false],
  ];

  return rows
    .filter(([, a, b, c, total]) => total || a !== 0 || b !== 0 || c !== 0)
    .map(([label, a, b, c, total, federalRule]) => {
      const cityMoved = Math.abs(b - a) >= 1;
      const tag = federalRule && !cityMoved
        ? '<span class="tag" title="Federal rules are identical in every state. Any change here comes from the salary, not the location.">same in both</span>'
        : '';
      const midCell = sameSalary
        ? `<td class="num ${cityMoved ? '' : 'flat'}">${money(b)}</td>`
        : '';
      return `<tr class="${total ? 'total' : ''}">
      <td>${esc(label)}${tag}</td>
      <td class="num">${money(a)}</td>
      ${midCell}
      <td class="num">${money(c)}</td>
      <td class="num ${cls(c - a)}">${signed(c - a)}</td>
    </tr>`;
    })
    .join('\n');
}

const cards = results
  .map(({ s, r, household }) => {
    const from = metro(s.from);
    const to = metro(s.to);
    const better = r.delta >= 0;
    const tenure =
      (s.fromTenure ?? 'rent') === (s.toTenure ?? 'rent')
        ? `${s.fromTenure ?? 'renting'}`
        : `${s.fromTenure ?? 'rent'} → ${s.toTenure ?? 'rent'}`;

    return `<section class="card">
  <h3>${esc(s.title)}</h3>
  <p class="meta">${esc(from.shortName)} → ${esc(to.shortName)} &middot;
     ${esc(STATUS[household.filingStatus])}${household.children ? `, ${household.children} children` : ''} &middot;
     ${esc(tenure)} &middot;
     ${money(r.origin.grossSalary)}${r.destination.grossSalary !== r.origin.grossSalary ? ` → ${money(r.destination.grossSalary)}` : ' (unchanged)'}</p>
  <p class="note">${esc(s.note)}</p>

  <div class="verdict ${better ? 'good' : 'bad'}">
    <span class="big">${signed(r.delta)}</span>
    <span class="per">per year ${better ? 'better off' : 'worse off'}</span>
    <span class="sub">${formatPercent(r.deltaPct)} of your spare cash &middot; ${signed(r.deltaMonthly)}/month</span>
  </div>

  <div class="why">
    <div><span class="lbl">The city alone</span><b class="${cls(r.cityEffect)}">${signed(r.cityEffect)}</b>
      <em>same salary, different city</em></div>
    <div><span class="lbl">The salary change</span><b class="${cls(r.salaryEffect)}">${signed(r.salaryEffect)}</b>
      <em>${r.destination.grossSalary === r.origin.grossSalary ? 'salary unchanged' : 'pay difference and its tax effect'}</em></div>
    <div><span class="lbl">Break-even salary</span><b>${money(r.breakEvenSalary)}</b>
      <em>needed in ${esc(to.shortName)} to match</em></div>
  </div>

  ${r.destination.grossSalary !== r.origin.grossSalary
      ? `<p class="colnote"><strong>Read the middle column first.</strong> It is
         ${esc(to.shortName)} <em>at your current ${money(r.origin.grossSalary)} salary</em>, so the
         gap between column&nbsp;1 and column&nbsp;2 is what the <strong>city</strong> did, and the
         gap between column&nbsp;2 and column&nbsp;3 is what the <strong>pay change</strong> did.
         Federal tax and Social Security are the same in every state &mdash; they move only
         because the salary moves.</p>`
      : ''}
  <div class="scroll"><table>
    <thead><tr>
      <th>Line</th>
      <th>${esc(from.shortName)}<br><span class="thsub">${money(r.origin.grossSalary)}</span></th>
      ${r.destination.grossSalary !== r.origin.grossSalary
        ? `<th>${esc(to.shortName)}<br><span class="thsub">at ${money(r.origin.grossSalary)}</span></th>` : ''}
      <th>${esc(to.shortName)}<br><span class="thsub">${money(r.destination.grossSalary)}</span></th>
      <th>Change</th>
    </tr></thead>
    <tbody>${waterfall(r)}</tbody>
  </table></div>
</section>`;
  })
  .join('\n');

// A single scenario shown as an ordered chain, to make the dependencies visible.
const demo = results[0].r;
const demoCity = demo.origin;

console.log(`<title>Pack or Stay — Stage 3: Worked Scenarios</title>
<style>
  :root {
    --ground:#f7f8fa; --surface:#ffffff; --ink:#171a21; --muted:#656d7e;
    --rule:#e1e5ec; --rule-strong:#c9d0dc; --accent:#2c4c8c;
    --good:#0f7a4d; --bad:#b4241c;
  }
  @media (prefers-color-scheme: dark) {
    :root:not([data-theme="light"]) {
      --ground:#101319; --surface:#171b23; --ink:#e6e9ef; --muted:#8e97a8;
      --rule:#262c38; --rule-strong:#39414f; --accent:#7fa3e8;
      --good:#4ade80; --bad:#f87171;
    }
  }
  :root[data-theme="dark"] {
    --ground:#101319; --surface:#171b23; --ink:#e6e9ef; --muted:#8e97a8;
    --rule:#262c38; --rule-strong:#39414f; --accent:#7fa3e8;
    --good:#4ade80; --bad:#f87171;
  }
  *,*::before,*::after { box-sizing:border-box; }
  body { margin:0; padding:3rem 1.25rem 6rem; background:var(--ground); color:var(--ink);
         font:16px/1.65 ui-sans-serif,-apple-system,"Segoe UI",system-ui,sans-serif;
         -webkit-font-smoothing:antialiased; }
  .wrap { max-width:940px; margin:0 auto; }
  .eyebrow { font-size:.7rem; letter-spacing:.14em; text-transform:uppercase;
             color:var(--muted); font-weight:600; margin:0 0 .6rem; }
  h1 { font-family:ui-serif,Georgia,"Iowan Old Style",serif; font-size:2.1rem;
       font-weight:600; letter-spacing:-.015em; margin:0 0 .5rem; }
  .sub { color:var(--muted); margin:0 0 2rem; font-size:.95rem; max-width:65ch; }
  h2 { font-family:ui-serif,Georgia,"Iowan Old Style",serif; font-size:1.25rem;
       font-weight:600; margin:3rem 0 .5rem; padding-top:1.5rem;
       border-top:1px solid var(--rule-strong); }
  h2 .idx { font-family:ui-monospace,SFMono-Regular,Menlo,monospace; font-size:.8rem;
            color:var(--accent); margin-right:.6rem; font-weight:700; }
  h3 { font-family:ui-serif,Georgia,"Iowan Old Style",serif; font-size:1.1rem;
       font-weight:600; margin:0 0 .3rem; }
  .note { color:var(--muted); font-size:.87rem; margin:.5rem 0 0; max-width:66ch; }
  .meta { font-size:.8rem; color:var(--muted); margin:0; }

  .card { background:var(--surface); border:1px solid var(--rule-strong);
          padding:1.5rem 1.6rem; margin:1.5rem 0 0; }

  .verdict { display:flex; flex-direction:column; gap:.1rem; margin:1.25rem 0 0;
             padding:1rem 1.1rem; border-left:3px solid var(--rule-strong);
             background:color-mix(in srgb, var(--accent) 4%, transparent); }
  .verdict.good { border-left-color:var(--good); }
  .verdict.bad { border-left-color:var(--bad); }
  .verdict .big { font-family:ui-monospace,SFMono-Regular,Menlo,monospace;
                  font-variant-numeric:tabular-nums; font-size:2rem; font-weight:700;
                  letter-spacing:-.03em; line-height:1.05; }
  .verdict.good .big { color:var(--good); } .verdict.bad .big { color:var(--bad); }
  .verdict .per { font-size:.95rem; }
  .verdict .sub { font-size:.82rem; color:var(--muted); margin-top:.25rem; }

  .why { display:grid; grid-template-columns:repeat(auto-fit,minmax(13rem,1fr));
         gap:1rem; margin:1.25rem 0 0; }
  .why > div { border-top:1px solid var(--rule); padding-top:.6rem; }
  .why .lbl { display:block; font-size:.7rem; text-transform:uppercase;
              letter-spacing:.08em; color:var(--muted); font-weight:600; }
  .why b { display:block; font-family:ui-monospace,SFMono-Regular,Menlo,monospace;
           font-variant-numeric:tabular-nums; font-size:1.15rem; margin:.15rem 0; }
  .why em { font-style:normal; font-size:.76rem; color:var(--muted); }

  .scroll { overflow-x:auto; margin:1.25rem 0 0; border:1px solid var(--rule); }
  table { border-collapse:collapse; width:100%; font-size:.84rem; }
  th,td { padding:.42rem .7rem; text-align:right; white-space:nowrap;
          border-bottom:1px solid var(--rule); }
  th:first-child, td:first-child { text-align:left; }
  thead th { color:var(--muted); font-weight:600; font-size:.67rem;
             text-transform:uppercase; letter-spacing:.08em;
             border-bottom:1px solid var(--rule-strong); }
  tr.total td { border-top:2px solid var(--rule-strong); border-bottom:none;
                font-weight:700; padding-top:.55rem; }
  .num { font-family:ui-monospace,SFMono-Regular,Menlo,monospace;
         font-variant-numeric:tabular-nums; }
  .up { color:var(--good); } .down { color:var(--bad); } .flat { color:var(--muted); }
  .thsub { font-weight:400; text-transform:none; letter-spacing:0; font-size:.72rem;
           color:var(--muted); font-family:ui-monospace,SFMono-Regular,Menlo,monospace; }
  .tag { display:inline-block; margin-left:.5rem; font-size:.62rem; text-transform:uppercase;
         letter-spacing:.07em; color:var(--muted); border:1px solid var(--rule-strong);
         border-radius:2px; padding:.05rem .3rem; vertical-align:middle; cursor:help; }
  .colnote { font-size:.82rem; color:var(--muted); margin:1.1rem 0 0; max-width:70ch;
             border-left:2px solid var(--rule-strong); padding-left:.8rem; }
  .colnote strong { color:var(--ink); }
  .muted { color:var(--muted); }
  ol.chain { counter-reset:step; list-style:none; padding:0; max-width:70ch; }
  ol.chain li { position:relative; padding:.55rem 0 .55rem 2.6rem;
                border-bottom:1px solid var(--rule); }
  ol.chain li::before { counter-increment:step; content:counter(step);
    position:absolute; left:0; top:.55rem; width:1.7rem; height:1.7rem;
    display:grid; place-items:center; font-family:ui-monospace,monospace;
    font-size:.75rem; font-weight:700; color:var(--accent);
    border:1px solid var(--rule-strong); border-radius:50%; }
  ol.chain b { font-family:ui-monospace,SFMono-Regular,Menlo,monospace;
               font-variant-numeric:tabular-nums; }
  ul { padding-left:1.15rem; max-width:70ch; } li { margin:.45rem 0; }
  code { font-family:ui-monospace,SFMono-Regular,Menlo,monospace;
         background:color-mix(in srgb,var(--ink) 7%,transparent);
         padding:.12em .38em; border-radius:3px; font-size:.85em; }
</style>
<div class="wrap">
<p class="eyebrow">Pack or Stay &middot; Stage 3 of 10</p>
<h1>Worked Scenarios</h1>
<p class="sub">The complete calculation, end to end. <strong>This is the checkpoint that
matters most</strong> &mdash; not because the code is risky, but because it is where you decide
whether the model matches your intuition. If a number feels wrong here, the model changes before
any interface is built on top of it.</p>

<h2><span class="idx">01</span>Scenarios</h2>
${cards}

<h2><span class="idx">02</span>Why the order of operations matters</h2>
<p class="note">Each step feeds the next. Computing federal tax before state tax &mdash; the
obvious way to write it &mdash; would silently ignore the deduction and overstate federal
liability in every high-tax state. Shown for ${esc(metro(SCENARIOS[0].from).shortName)} at
${money(demoCity.grossSalary)}:</p>
<ol class="chain">
  <li><strong>FICA</strong> from salary alone &rarr; <b>${money(demoCity.tax.fica)}</b></li>
  <li><strong>Housing</strong> produces property tax <b>${money(demoCity.housing.propertyTax)}</b>
      and first-year mortgage interest <b>${money(demoCity.housing.mortgageInterest)}</b></li>
  <li><strong>State income tax</strong> &rarr; <b>${money(demoCity.tax.state)}</b></li>
  <li><strong>Local income tax</strong> &rarr; <b>${money(demoCity.tax.local)}</b>
      <span class="muted">&mdash; Yonkers levies a surcharge <em>on</em> the state liability, so it must come after</span></li>
  <li><strong>Federal income tax</strong> uses steps 2&ndash;4 for the SALT deduction, which decides
      whether itemising beats the standard deduction
      (${demoCity.tax.itemized ? 'itemised' : 'took the standard deduction'},
      <b>${money(demoCity.tax.deductionTaken)}</b>) &rarr; <b>${money(demoCity.tax.federal)}</b></li>
  <li><strong>Living costs</strong>, the national basket re-priced for this metro &rarr; <b>${money(demoCity.living.total)}</b></li>
  <li><strong>Sales tax</strong> on the taxable share of that basket &rarr; <b>${money(demoCity.salesTax)}</b></li>
  <li><strong>In your pocket</strong> &rarr; <b>${money(demoCity.leftover)}</b></li>
</ol>

<h2><span class="idx">03</span>Two modelling choices worth checking</h2>
<ul>
  <li><strong>The spending basket is pinned to your current income, not each city's salary.</strong>
      BLS publishes spending in income bands. Picking the band separately per city let the band
      boundary leak into the answer &mdash; a $150k&rarr;$125k move crossed a boundary and showed a
      phantom <em>$16,900</em> saving on food and healthcare that was purely an artefact of where
      the survey draws its lines. Your lifestyle now travels with you and is simply re-priced.</li>
  <li><strong>The basket is scaled to your household size.</strong> Households in the
      $150k&ndash;$200k band average 3.1 people, so a single filer was being charged for a family
      of three. Scaling uses the square-root equivalence scale (OECD standard): needs grow with
      household size, but sub-linearly &mdash; two people don't need two fridges.</li>
</ul>

<h2><span class="idx">04</span>Known limitations</h2>
<ul>
  <li><strong>Home and renters insurance are not yet included</strong>, because no per-state
      dataset is loaded. This understates ownership costs everywhere, and badly in Florida and
      Louisiana. Top remaining data gap.</li>
  <li><strong>Local income tax outside New York City uses state averages.</strong> Philadelphia,
      Columbus, Detroit, Louisville, Kansas City and Portland all levy more than their state
      average, so those metros are understated.</li>
  <li><strong>Social Security is capped once per household</strong> rather than per worker, which
      understates it for dual-earner couples above the wage base.</li>
  <li><strong>Alabama, Missouri and Oregon</strong> let you deduct federal tax from state taxable
      income. Flagged in the data, not yet modelled &mdash; it needs iterative solving.</li>
  <li><strong>State head-of-household filers</strong> use each state's single schedule, because
      most states publish only single and joint.</li>
  <li><strong>Sales tax local rates are state averages.</strong> Chicago's actual 10.25% is above
      the Illinois average used here.</li>
  <li><strong>Moving costs are excluded entirely</strong> &mdash; this is a steady-state annual
      comparison. Deferred to v2 by design.</li>
</ul>
</div>`);
