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

**Live** at [packorstay.com](https://packorstay.com). Current dataset: **2026.23**.

| Component | State |
|---|---|
| Bracket arithmetic, FICA, federal income tax, CTC, EITC | ✅ |
| State income tax — all 50 states + DC | ✅ |
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

**875 tests**, including 24 golden values reproduced exactly from the IRS rate tables.
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
4. **41 of 42 taxing states have been checked against their own publication
   for head of household.** Nothing checked this before, and 24 of the 41 were
   wrong — always against a single parent, by $75 to $2,559 a year. Six
   different shapes turned up: the state's own rate schedule, the joint
   schedule, the joint schedule with its own deduction, a shared schedule with
   its own deduction, the single schedule with the joint exemption, and the
   single schedule with its own deduction. There is no pattern to guess from,
   which is why each one had to be read.

   **This count used to say "of 30 graduated states", and that was the wrong
   denominator.** The question started as "which rate schedule does a head of
   household use", so the twelve flat-rate states were never asked — with one
   rate there is no schedule to get wrong. But the ALLOWANCE differs in flat
   states too, and five of the twelve turned out to differ: Louisiana gives a
   head of household the entire joint standard deduction, North Carolina 1.5x
   the single one, and Arizona, Colorado and Iowa carry the federal figure
   because the federal deduction sits inside the income they start from. A
   coverage report that silently excludes a category reads as "all clear" for
   states it never looked at, so it now counts every taxing state.

   **Utah's entire allowance was being dropped on the floor.** Utah has no
   standard deduction and no personal exemption; the whole thing is a credit
   worth 6% of the federal deduction, shrinking by 1.3 cents per dollar of
   income above a threshold. The source table prints it in the standard
   deduction column as "$966 credit" — Utah is the only state that does, every
   other credit sits in the exemption columns — so it parsed as a $0 deduction
   and was never picked up as a credit either. A Utah family on $40,000 was
   being charged $1,610 of tax they do not owe.

   Fixing it meant teaching the engine credits that shrink with income, because
   half a fix is worse than none here: granting the $966 flat would understate
   Utah tax for most people who use this site, and dropping it overcharges
   everyone below the threshold. Utah's phase-out thresholds are the 2025 ones,
   the only published figures, which starts the reduction slightly early and so
   errs against the reader.

   Vermont is the one still open, and it is blocked rather than unexamined. Its
   schedule was transcribed from the statute and rejected by the build guard:
   the statutory table is a base Vermont indexes every year, and the base sits
   about 28% below the 2026 brackets shipped here, so a head of household came
   out paying more than a single filer. Deriving 2026 from it is not available
   either — no single inflation factor reproduces both the 2026 single and joint
   brackets already shipped, so any derived schedule would be invented. Vermont
   has published a document called "2026 VT Rate Schedules" and it is
   withholding charts with two columns, single and married, and no head of
   household in it at all. Until the 2026 return forms arrive, Vermont stays on
   the single schedule, which is the narrowest and therefore charges the most.

   Anything unchecked carries `headOfHouseholdBasis: 'assumed-single'`, which is
   deliberately not spelled `'single'`: it records that nobody has looked, and
   the build prints the list every time it runs. Tax Foundation, the source for
   brackets, publishes single and joint columns only, so this can only come from
   each state's own revenue department.

   One narrower gap remains inside a checked state: Arkansas publishes separate
   low-income tax tables by filing status, with a higher threshold for a head of
   household. That is a rule this engine does not model at all. It bites only
   well below the salaries this calculator is used for, and it errs against the
   reader.
5. **Local income tax outside the 13 named cities** is still each state's
   average, which is fair where rates are uniform and wrong where they are not.
6. **The bracket table is a February 2026 snapshot, and states legislate after
   February.** Committing the snapshot is what makes this dataset reproducible,
   but reproducible is not current, and three states had moved underneath it:

   - **Georgia** cut its rate from 5.19% to 4.99%, raised the standard
     deduction from $12,000/$24,000 to $15,000/$30,000 and the dependent
     deduction from $4,000 to $5,000 — one law, signed 11 May 2026, applying to
     2026. Worth $285 a year to a single filer and $635 to a couple with two
     children.
   - **Arizona** conformed to the post-OBBBA federal standard deduction,
     retroactively, in June 2026. The snapshot had it at the pre-TCJA $8,350.
   - **Maine** never conformed at all. Its own statute sets a $12,000 base from
     2026, and Maine Revenue Services publishes the indexed result: $15,700
     rather than $8,350. A Maine couple was being overcharged about $880 a year.

   All three ran the same way — against the reader. They are corrected by hand
   in `STATE_OVERRIDES`, with the state's own publication as the source, and
   the build now warns when an override matches the source again so the
   hand-typed figures get deleted rather than quietly outliving their purpose.
   The real fix is refreshing the snapshot, which is a quarterly job.

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
