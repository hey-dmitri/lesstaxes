# Pack or Stay

**[packorstay.com](https://packorstay.com) — will moving actually leave you with more money?**

Will you actually have more money in your pocket if you move to another city?

Pick two US metro areas, enter your salary, filing status and housing situation, and get a single
honest number — net of income tax, property tax, state disability, housing, cars and cost of living.
The answer can be negative, and often is.

Free, no accounts, no tracking, no database. Almost every figure comes from public federal
data — Census, BEA, BLS, IRS and SSA. State income tax and sales tax rates are compiled by
the Tax Foundation from state statutes, and a handful of city income tax rates come from the
levying city. Every figure is labelled with what kind of number it is — median, average,
index, statutory rate or state average — on the [data page](https://packorstay.com/data).

---

## Status

**Live** at [packorstay.com](https://packorstay.com). Current dataset: **2026.26**.

| Component | State |
|---|---|
| Bracket arithmetic, FICA, federal income tax, CTC, EITC | ✅ |
| State income tax — all 50 states + DC | ✅ |
| Every taxing state read off its own 2026 publication | 40 of 42 — OH and OR have published nothing |
| Local income tax — 13 named cities, state averages elsewhere | ✅ |
| 387 metros + 51 rural fallbacks, price parities | ✅ |
| Rent and home price scaled to household and income, effective property tax | ✅ |
| Housing, cars and tax sliced by state for the 43 split metros | ✅ |
| Vehicles per adult, per-vehicle cost | ✅ |
| Household spending profiles, 9 income bands, interpolated by income | ✅ |
| Sales tax rates + grocery treatment | reference only — already inside the spending basket |
| Housing (rent, mortgage, property tax), cars, living costs | ✅ |
| Leftover, city/salary decomposition, break-even solver | ✅ |
| Input form — pickers, housing, cars, theme | ✅ |
| Results: headline, breakdown, break-even, reveal | ✅ |
| Share links — URL-encoded, dataset version pinned | ✅ |
| Share card PNG + rich link previews | ✅ |
| `/methodology` and public `/data` browser | ✅ |
| Accessibility, mobile layout, performance measured | ✅ |
| Quarterly refresh workflow — opens a PR, never auto-merges | ✅ |
| Contact route for wrong figures — email and GitHub, prefilled | ✅ |
| Share links pinned to their dataset version | ✅ |
| Home prices scaled to income, as rents are | ✅ |
| One-word verdict — pack, stay, or too close to call | ✅ |
| State choice for the 43 metros that cross a state line | ✅ |
| Social Security capped per worker, not per household | ✅ |
| Name and domain — **Pack or Stay**, live at `packorstay.com` | ✅ |

**901 tests**, including 24 golden values reproduced exactly from the IRS rate tables.
Total data cost: **$0**. No paid feeds, no runtime API calls.

### Known gaps, in priority order

1. **Owner upkeep does not scale with the house.** Repairs, maintenance and home
   insurance are charged now — the BLS owned-dwelling line, divided by the
   homeowner share to make it per-owner — but they are adjusted by the local
   *services* price index, not by the price of the home. A $1.6M house costs
   more to keep than a $500k one and this does not fully see it, which leans
   towards flattering expensive metros. Florida and Louisiana premiums run at a
   multiple of the national average and are likewise invisible.

   This replaces the old entry that called missing insurance the largest gap.
   That was the wrong shape: insurance was never a separate missing dataset, it
   is one ingredient of the owned-dwelling line that was being discarded whole
   along with the repairs beside it. OPEN-5 was hunting per-state premium data
   that does not exist for free, while the figure containing it sat unused in a
   source already committed to this repo.
2. **State Earned Income Credits cover 23 states, not all ~30.** Where two
   independent sources agreed on the match it is modelled, refundability
   included. Left out: California, Minnesota and Washington, which use their own
   formulas rather than a share of the federal credit; Delaware, where the
   taxpayer chooses between two credits; Massachusetts, Vermont, Virginia and DC,
   where sources disagree or the credit is mid-change; Oregon, whose higher rate
   depends on a child's age this site never asks for. New York City's own credit
   is not modelled.
3. **Sales tax differences between states are invisible.** There is no sales
   tax line at all any more: BLS expenditures already include the tax paid at
   the till, so charging it again was a double count. But what the basket
   carries is a NATIONAL blend, so Oregon (no sales tax) and Tennessee (the
   highest) now look identical on this line. Modelling the difference means
   stripping the embedded average out per category, which the survey does not
   publish. Worth a few hundred a year. The rates stay shipped and visible in
   the data browser, labelled reference-only, for when it can be done.
4. **Every state that taxes wages has now been read off its own 2026
   publication — 40 of 42, and the two left are waiting on the states.**

   Two separate checks, kept separate because they answer different questions.

   *Head of household: 42 of 42.* Nothing checked this before, and 24 states
   were wrong — always against a single parent, by $75 to $2,559 a year. Six
   different shapes turned up and there is no pattern to guess from, which is
   why each one had to be read. Vermont was the last and was closed by noticing
   something about our own data rather than by Vermont publishing anything: the
   brackets shipped here are 2025 figures, so Vermont's 2025 head-of-household
   schedule is exactly in step with them.

   *Rates and allowances: 40 of 42, and 22 were wrong.* This is the stronger
   claim — every bracket and every allowance compared against the state's own
   2026 rate schedule, withholding guide or statute. **Ohio and Oregon are the
   two outstanding, and neither is unexamined: neither state has published
   anything for 2026 at all.**

   Each state now carries the date it was checked and the document it was
   checked against, and the data browser shows both.

5. **Seven states changed the law after our bracket table was published, and
   the table is published once a year.** That is the failure this whole audit
   existed to find. February's table cannot know about a law signed in May.

   | State | What moved | Direction |
   |---|---|---|
   | South Carolina | rewrote the entire income tax | overcharging |
   | Arkansas | top rate 3.9% → 3.7%, retroactive | overcharging |
   | Georgia | rate, deduction and dependent, all at once | overcharging |
   | West Virginia | every rate cut 5%, retroactive | overcharging |
   | Arizona | conformed to the bigger federal deduction | overcharging |
   | Utah | 4.50% → 4.45%, retroactive | overcharging |
   | Maine | never conformed; its own figure is far higher | overcharging |

   The build now records when the table was published and refuses to stay
   quiet about it: it warns until every state has been read off its own
   publication, and names the ones that have not been.

6. **Errors ran BOTH ways, and the ones that flattered are the ones that
   mattered.** Ten states were charging too little, because we handed out
   allowances the state takes away as income rises. Wisconsin's standard
   deduction reaches zero by $136,000 and we gave it in full — a Wisconsin
   couple on $150,000 was being shown a bill $1,268 too low. Connecticut's
   personal exemption is gone by $44,000 and we were still deducting $24,000.

   A verdict that is too rosy is the one that actually moves somebody across
   the country, so those are now modelled: allowances that taper, allowances
   that fall in steps, allowances that stop at a floor, and credits that vanish
   at a cliff.

7. **What is still not modelled is written on the state, not buried here.**
   Ten states carry a note saying which rule is missing and which way it runs —
   New Jersey's $15,000 property tax deduction, New York's itemising and its
   recapture, Oregon's federal tax subtraction, Connecticut's add-back and
   recapture, Alabama's payroll-tax deduction, Colorado's high-income add-back,
   and more. Those notes appear on the methodology page.

   The largest single gap is **state itemising**: only California is modelled,
   and a dozen states let a homeowner deduct mortgage interest and property tax
   on the state return. Where that is missing we charge too much.

8. **California's figures are tax year 2025.** California indexes in the autumn
   and has not published 2026. Rather than invent a number, the 2025 figures
   ship and this says so.
9. **Local income tax outside the 13 named cities** is still each state's
   average, which is fair where rates are uniform and wrong where they are not.
   Indiana is the known bad case: we apply 0.35% statewide when real county
   rates run from 0.50% to 3.00%, which understates Indiana tax by over a
   thousand dollars a year.

### Rebuilding the dataset

```bash
node scripts/build-state-tax-rules.mjs     # 51 tax jurisdictions
node scripts/build-metros.mjs              # 438 locations + price parities
node scripts/build-housing-transport.mjs   # rent, homes, property tax, vehicles
node scripts/build-spending.mjs            # BLS spending baselines
node scripts/build-sales-tax.mjs           # sales tax + grocery rules
node scripts/build-local-income-tax.mjs    # NYC, Yonkers, state averages
```

Or all at once:

```bash
node scripts/refresh-sources.mjs           # re-download upstream sources
node scripts/build-all.mjs                 # rebuild every dataset
node scripts/build-all.mjs --refresh       # ...and re-fetch the Census API too
```

Every script writes to the release named in `engine/datasets.ts`. To cut a new
one — which is what a data refresh must always do, since shipped releases are
immutable and share links resolve against them:

```bash
node scripts/cut-dataset-version.mjs       # 2026.2 -> 2026.3, registers it
node scripts/build-all.mjs --refresh       # rebuild into the new release
```

A GitHub Action runs both quarterly and opens a pull request when a figure
actually changes. It never pushes to `main` — a human reviews the diff and a
Vercel preview first.

All raw source responses are committed under each release's `sources/` directory, so every script
rebuilds offline with no API key. `CENSUS_API_KEY` is only needed to fetch *fresh* ACS data;
see `.env.example`.

See `BUILD_PLAN.md` for the stages and `PROJECT.md` for the full specification.

## Layout

| Path | Contents |
|---|---|
| `engine/` | The calculation core. **Framework-free** — see `engine/README.md` |
| `data/` | Immutable dated datasets. **Never hand-edited** — see `data/README.md` |
| `scripts/` | The data pipeline that generates `data/` — see `scripts/README.md` |
| `lib/` | UI-side helpers (share-link encoding, formatting adapters) |
| `app/` | Next.js App Router pages |
| `PROJECT.md` | Full product specification, decisions and rationale |
| `BUILD_PLAN.md` | Ten build stages and what is reviewable at each |

## Commands

```bash
npm run dev        # local dev server
npm run test       # engine unit tests
npm run test:watch # tests in watch mode
npm run typecheck  # TypeScript, no emit
npm run lint       # ESLint, including the engine boundary rule
npm run check      # typecheck + lint + test
npm run build      # production build
```

## Data

Every number comes from a free, public source: BEA Regional Price Parities, Census ACS, BLS
Consumer Expenditure Survey, IRS, SSA, the Tax Foundation, and individual city revenue
departments. HUD Fair Market Rents were specified originally and rejected — HUD publishes on
its own areas, which do not map cleanly onto the metros used here. Nothing is paid for, and
there are no runtime API calls: datasets are committed to this repo and bundled at build time.

The Tax Foundation compilations are CC BY-NC 4.0; everything else is public domain. The
[data page](https://packorstay.com/data) lists the source, the licence, and what kind of number
each figure is.

This project is permanently non-commercial: no ads, no paywall, no affiliate links.

**Not financial, tax or legal advice.** Estimates only.
