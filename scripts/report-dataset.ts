/**
 * Generates the Stage 2 review page: a searchable browser over every number
 * in the dataset, so the project owner can spot-check cities they know.
 *
 *   npx tsx scripts/report-dataset.ts > .stage2-report.html
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { DATASET_VERSION } from '../engine/dataset';
import { datasetBundle } from '../engine/datasets';

/*
 * THE VERSION IS RESOLVED, NOT TYPED.
 *
 * These eight were pinned imports from `data/2026.2/` while the heading at the
 * bottom of this file printed DATASET_VERSION — so the page built for
 * spot-checking numbers before they ship stamped today's version on figures
 * twenty-four releases old. In 2026.2 no state itemised, no state had a
 * low-income credit, there were thirteen local jurisdictions rather than
 * thirty-nine, and South Carolina's top rate was 6.00% against today's 5.21%.
 * Every one of those is something this page exists to let somebody catch.
 *
 * Reading through `datasetBundle` means the review page cannot disagree with
 * the calculator about what the calculator is using, because it is asking the
 * same function the calculator asks.
 */
const bundle = datasetBundle(DATASET_VERSION);
const { metros, housing, transport, spending, salesTax, localTax, states } = bundle;

// Counties are the one file not in the bundle — nothing in the engine needs
// them at runtime, so they are read straight off the release being reported.
const metroCounties = JSON.parse(
  readFileSync(resolve(import.meta.dirname, '..', 'data', DATASET_VERSION, 'metros-counties.json'), 'utf8'),
);

type Row = {
  id: string;
  name: string;
  short: string;
  state: string;
  type: string;
  counties: number;
  rent: number | null;
  home: number | null;
  ptax: number | null;
  veh: number | null;
  all: number;
  hous: number;
  goods: number;
  util: number;
  svc: number;
  stateTax: boolean;
  salesRate: number | null;
  grocery: string;
  local: string | null;
};

interface MetroRec {
  id: string; name: string; shortName: string; type: string; primaryState: string;
  priceParity: { allItems: number; housing: number; goods: number; utilities: number; otherServices: number };
}
interface HousingRec { medianRentMonthly: number | null; medianHomePrice: number | null; effectivePropertyTaxRate: number | null }
interface TransportRec { vehiclesPerAdult: number | null }
interface StateRec { hasWageIncomeTax: boolean }
interface SalesRec { combinedRate: number; grocery: { treatment: string } }
interface LocalEntry { jurisdictionId: string }
interface Jurisdiction { name: string }
interface Profile {
  bracket: string; averageHouseholdSize: number; livingTotal: number;
  categories: { food: number; otherGoods: number; utilities: number; healthcare: number; otherServices: number };
  transport: { vehiclesPerHousehold: number; annualCostPerVehicle: number };
}

const H = housing.byMetro as unknown as Record<string, HousingRec>;
const T = transport.byMetro as unknown as Record<string, TransportRec>;
const S = states.states as unknown as Record<string, StateRec>;
const SX = salesTax.states as unknown as Record<string, SalesRec>;
const LJ = localTax.jurisdictions as unknown as Record<string, Jurisdiction>;
const LM = localTax.byMetro as unknown as Record<string, LocalEntry[]>;
const METROS = metros.metros as unknown as Record<string, MetroRec>;
const COUNTIES = metroCounties.byMetro as unknown as Record<string, unknown[]>;
const PROFILES = spending.profiles as unknown as Profile[];

const rows: Row[] = Object.values(METROS).map((m) => {
  const h = H[m.id] ?? ({} as Partial<HousingRec>);
  const t = T[m.id] ?? ({} as Partial<TransportRec>);
  const st = S[m.primaryState];
  const sx = SX[m.primaryState];
  const locals = LM[m.id];

  return {
    id: m.id,
    name: m.name,
    short: m.shortName,
    state: m.primaryState,
    type: m.type,
    counties: (COUNTIES[m.id] ?? []).length,
    rent: h.medianRentMonthly ?? null,
    home: h.medianHomePrice ?? null,
    ptax: h.effectivePropertyTaxRate ?? null,
    veh: t.vehiclesPerAdult ?? null,
    all: m.priceParity.allItems,
    hous: m.priceParity.housing,
    goods: m.priceParity.goods,
    util: m.priceParity.utilities,
    svc: m.priceParity.otherServices,
    stateTax: Boolean(st?.hasWageIncomeTax),
    salesRate: sx?.combinedRate ?? null,
    grocery: sx?.grocery?.treatment ?? 'n/a',
    local: locals ? locals.map((l) => LJ[l.jurisdictionId].name).join(' / ') : null,
  };
});

rows.sort((a, b) => a.short.localeCompare(b.short));

const metroCount = rows.filter((r) => r.type === 'metro').length;
const restCount = rows.filter((r) => r.type === 'restOfState').length;
const localCount = Object.keys(LM).length;

const esc = (v: string) => v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const profileRows = PROFILES
  .map(
    (p) => `<tr>
  <td>${esc(p.bracket)}</td>
  <td class="num">${p.averageHouseholdSize}</td>
  <td class="num">$${p.categories.food.toLocaleString()}</td>
  <td class="num">$${p.categories.otherGoods.toLocaleString()}</td>
  <td class="num">$${p.categories.utilities.toLocaleString()}</td>
  <td class="num">$${p.categories.healthcare.toLocaleString()}</td>
  <td class="num">$${p.categories.otherServices.toLocaleString()}</td>
  <td class="num strong">$${p.livingTotal.toLocaleString()}</td>
  <td class="num">${p.transport.vehiclesPerHousehold}</td>
  <td class="num">$${p.transport.annualCostPerVehicle.toLocaleString()}</td>
</tr>`,
  )
  .join('\n');

const sources = [
  ['Metro definitions', 'Census CBSA delineation, 2023', 'public domain'],
  ['Price parities', 'BEA Regional Price Parities, 2024', 'public domain'],
  ['Rent, home values, property tax', 'Census ACS 2024 5-year (B25064, B25077, B25103)', 'public domain'],
  ['Vehicles per household', 'Census ACS 2024 5-year (B25044, B09021)', 'public domain'],
  ['Household spending', 'BLS Consumer Expenditure Survey, Table 1203, 2024', 'public domain'],
  ['Federal tax rules', 'IRS Rev. Proc. 2025-32; 26 U.S.C. §164', 'public domain'],
  ['State tax rules', 'Tax Foundation 2026, from state statutes', 'CC BY-NC'],
  ['Sales tax rates', 'Tax Foundation 2026', 'CC BY-NC'],
  ['Local income tax', 'NYC/Yonkers; Tax Foundation state averages', 'mixed'],
]
  .map(([a, b, c]) => `<tr><td>${esc(a)}</td><td>${esc(b)}</td><td class="muted">${esc(c)}</td></tr>`)
  .join('\n');

console.log(`<title>Pack or Stay — Stage 2: Dataset Browser</title>
<style>
  :root {
    --ground:#f7f8fa; --surface:#ffffff; --ink:#171a21; --muted:#656d7e;
    --rule:#e1e5ec; --rule-strong:#c9d0dc; --accent:#2c4c8c;
    --good:#0f7a4d; --bad:#b4241c; --warm:#8a5a00;
  }
  @media (prefers-color-scheme: dark) {
    :root:not([data-theme="light"]) {
      --ground:#101319; --surface:#171b23; --ink:#e6e9ef; --muted:#8e97a8;
      --rule:#262c38; --rule-strong:#39414f; --accent:#7fa3e8;
      --good:#4ade80; --bad:#f87171; --warm:#e0a94a;
    }
  }
  :root[data-theme="dark"] {
    --ground:#101319; --surface:#171b23; --ink:#e6e9ef; --muted:#8e97a8;
    --rule:#262c38; --rule-strong:#39414f; --accent:#7fa3e8;
    --good:#4ade80; --bad:#f87171; --warm:#e0a94a;
  }
  *, *::before, *::after { box-sizing:border-box; }
  body {
    margin:0; padding:3rem 1.25rem 6rem; background:var(--ground); color:var(--ink);
    font:16px/1.65 ui-sans-serif,-apple-system,"Segoe UI",system-ui,sans-serif;
    -webkit-font-smoothing:antialiased;
  }
  .wrap { max-width:1100px; margin:0 auto; }
  .eyebrow { font-size:.7rem; letter-spacing:.14em; text-transform:uppercase;
             color:var(--muted); font-weight:600; margin:0 0 .6rem; }
  h1 { font-family:ui-serif,Georgia,"Iowan Old Style",serif; font-size:2.1rem;
       font-weight:600; letter-spacing:-.015em; line-height:1.15; margin:0 0 .5rem; }
  .sub { color:var(--muted); margin:0 0 2.25rem; font-size:.95rem; }
  h2 { font-family:ui-serif,Georgia,"Iowan Old Style",serif; font-size:1.25rem;
       font-weight:600; margin:3rem 0 .35rem; padding-top:1.5rem;
       border-top:1px solid var(--rule-strong); }
  h2 .idx { font-family:ui-monospace,SFMono-Regular,Menlo,monospace; font-size:.8rem;
            color:var(--accent); margin-right:.6rem; font-weight:700; }
  .note { color:var(--muted); font-size:.87rem; margin:.6rem 0 0; max-width:68ch; }

  .tally-row { display:flex; gap:2.5rem; flex-wrap:wrap; background:var(--surface);
               border:1px solid var(--rule-strong); border-top:3px double var(--rule-strong);
               padding:1.15rem 1.35rem; }
  .tally b { display:block; font-family:ui-monospace,SFMono-Regular,Menlo,monospace;
             font-variant-numeric:tabular-nums; font-size:1.6rem; line-height:1.1;
             letter-spacing:-.02em; }
  .tally span { font-size:.78rem; color:var(--muted); text-transform:uppercase;
                letter-spacing:.07em; }

  .search { width:100%; padding:.7rem .9rem; margin:1.25rem 0 0; font-size:1rem;
            background:var(--surface); color:var(--ink);
            border:1px solid var(--rule-strong); border-radius:4px; }
  .search:focus { outline:2px solid var(--accent); outline-offset:1px; }
  .count { font-size:.8rem; color:var(--muted); margin:.5rem 0 0; }

  .scroll { overflow-x:auto; margin:1rem 0 0; border:1px solid var(--rule);
            background:var(--surface); max-height:34rem; overflow-y:auto; }
  table { border-collapse:collapse; width:100%; font-size:.82rem; }
  th, td { padding:.45rem .7rem; text-align:right; white-space:nowrap;
           border-bottom:1px solid var(--rule); }
  th:first-child, td:first-child { text-align:left; }
  thead th { position:sticky; top:0; background:var(--surface); z-index:1;
             color:var(--muted); font-weight:600; font-size:.66rem;
             text-transform:uppercase; letter-spacing:.08em;
             border-bottom:1px solid var(--rule-strong); }
  tbody tr:hover td { background:color-mix(in srgb, var(--accent) 5%, transparent); }
  .num { font-family:ui-monospace,SFMono-Regular,Menlo,monospace;
         font-variant-numeric:tabular-nums; }
  .strong { font-weight:700; }
  .muted { color:var(--muted); }
  .yes { color:var(--good); } .no { color:var(--muted); }
  .flag { color:var(--warm); font-weight:600; }
  code { font-family:ui-monospace,SFMono-Regular,Menlo,monospace;
         background:color-mix(in srgb, var(--ink) 7%, transparent);
         padding:.12em .38em; border-radius:3px; font-size:.85em; }
  ul { padding-left:1.15rem; max-width:70ch; } li { margin:.5rem 0; }
</style>
<div class="wrap">
<p class="eyebrow">Pack or Stay &middot; Stage 2 of 10</p>
<h1>Dataset Browser</h1>
<p class="sub">Every number the calculator will use &middot; dataset <code>${bundle.version}</code></p>

<div class="tally-row">
  <div class="tally"><b>${metroCount}</b><span>metros</span></div>
  <div class="tally"><b>${restCount}</b><span>rural fallbacks</span></div>
  <div class="tally"><b>51</b><span>tax jurisdictions</span></div>
  <div class="tally"><b>9</b><span>income brackets</span></div>
  <div class="tally"><b>${localCount}</b><span>metros w/ local tax</span></div>
  <div class="tally"><b>$0</b><span>data cost</span></div>
</div>

<h2><span class="idx">01</span>Every location</h2>
<p class="note"><strong>Spot-check the places you know.</strong> Type a city, a state code, or
part of a name. Price parities are shown as a percentage of the national average, so 112 means
12% above the US average.</p>
<input class="search" id="q" type="search" placeholder="Search 438 locations — try Chicago, Austin, TX, or Rest of" autocomplete="off">
<p class="count" id="count"></p>
<div class="scroll"><table>
<thead><tr>
  <th>Location</th><th>ST</th><th>Rent/mo</th><th>Home price</th><th>Prop tax</th>
  <th>Cars/adult</th><th>All items</th><th>Housing</th><th>Goods</th><th>Util</th>
  <th>Svc</th><th>Inc tax</th><th>Sales</th><th>Groceries</th><th>Local tax</th>
</tr></thead>
<tbody id="tb"></tbody>
</table></div>

<h2><span class="idx">02</span>National spending baseline</h2>
<p class="note">From BLS. These are the national figures that each metro&rsquo;s price parities are
applied to. <strong>Shelter, transport and pension contributions are excluded</strong> from the
living total &mdash; the engine models housing from your actual rent or mortgage, transport from
car counts, and treats pension saving as money retained rather than spent.</p>
<div class="scroll"><table>
<thead><tr>
  <th>Income bracket</th><th>People</th><th>Food</th><th>Other goods</th><th>Utilities</th>
  <th>Healthcare</th><th>Other svc</th><th>Living total</th><th>Vehicles</th><th>$/vehicle</th>
</tr></thead>
<tbody>${profileRows}</tbody>
</table></div>

<h2><span class="idx">03</span>Where every number comes from</h2>
<div class="scroll"><table>
<thead><tr><th>Data</th><th>Source</th><th>Licence</th></tr></thead>
<tbody>${sources}</tbody>
</table></div>
<p class="note">Total ongoing data cost: <strong>$0</strong>. No paid feeds, no runtime API calls.
Raw responses are committed to the repository, so the dataset rebuilds offline and can never
change underneath a shared link.</p>

<h2><span class="idx">04</span>Known limitations</h2>
<ul>
  <li><strong>Local income tax outside New York City</strong> uses state averages rather than
      city-specific rates. Philadelphia, Columbus, Detroit, Louisville, Kansas City and Portland
      all levy more than their state average, so those metros are understated. This is the
      highest-value refinement left in the dataset.</li>
  <li><strong>Buffalo, Rochester, Syracuse and Albany correctly carry no local income tax</strong>
      &mdash; New York&rsquo;s 1.60% state average is generated entirely by New York City and
      Yonkers, and applying it statewide would invent a tax that does not exist.</li>
  <li><strong>New York City and Yonkers are optional</strong>, because the New York metro spans
      22 counties and only five-borough residents pay the city tax. The interface will ask.</li>
  <li><strong>Rural fallbacks use statewide price parities.</strong> BEA publishes no rural-only
      index, so &ldquo;Rest of Texas&rdquo; blends Texas metros back in and may overstate rural costs.</li>
  <li><strong>Sales tax local rates are state averages.</strong> Chicago&rsquo;s actual 10.25% is
      above the Illinois average used here.</li>
  <li><strong>Micropolitan areas and US territories are excluded.</strong> BEA publishes no price
      parities for them; territories also have separate tax systems entirely.</li>
  <li><strong>Data vintages lag.</strong> Price parities are 2024, ACS is the 2024 5-year release,
      spending is 2024. Tax rules are 2026.</li>
</ul>
</div>
<script>
const DATA = ${JSON.stringify(rows)};
const tb = document.getElementById('tb');
const q = document.getElementById('q');
const countEl = document.getElementById('count');
const pc = v => v === null ? '<span class="muted">&mdash;</span>' : (v*100).toFixed(1);
const money = v => v === null ? '<span class="muted">&mdash;</span>' : '$' + v.toLocaleString();
const rate = v => v === null ? '<span class="muted">&mdash;</span>' : (v*100).toFixed(2) + '%';

function render(list) {
  countEl.textContent = list.length + ' of ' + DATA.length + ' locations';
  tb.innerHTML = list.map(r => \`<tr>
    <td>\${r.short}\${r.type === 'restOfState' ? ' <span class="muted">(rural)</span>' : ''}</td>
    <td class="muted">\${r.state}</td>
    <td class="num">\${money(r.rent)}</td>
    <td class="num">\${money(r.home)}</td>
    <td class="num">\${rate(r.ptax)}</td>
    <td class="num">\${r.veh === null ? '&mdash;' : r.veh.toFixed(2)}</td>
    <td class="num">\${pc(r.all)}</td>
    <td class="num">\${pc(r.hous)}</td>
    <td class="num">\${pc(r.goods)}</td>
    <td class="num">\${pc(r.util)}</td>
    <td class="num">\${pc(r.svc)}</td>
    <td class="\${r.stateTax ? 'yes' : 'no'}">\${r.stateTax ? 'yes' : 'none'}</td>
    <td class="num">\${rate(r.salesRate)}</td>
    <td class="\${r.grocery === 'exempt' ? 'muted' : 'flag'}">\${r.grocery}</td>
    <td class="muted">\${r.local ?? '&mdash;'}</td>
  </tr>\`).join('');
}

function filter() {
  const t = q.value.trim().toLowerCase();
  if (!t) return render(DATA);
  render(DATA.filter(r =>
    r.short.toLowerCase().includes(t) ||
    r.name.toLowerCase().includes(t) ||
    r.state.toLowerCase() === t ||
    r.id === t));
}
q.addEventListener('input', filter);
render(DATA);
</script>`);
