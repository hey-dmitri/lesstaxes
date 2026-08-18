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

**Live** at [packorstay.com](https://packorstay.com). Current dataset: **2026.29**.

| Component | State |
|---|---|
| Bracket arithmetic, FICA, federal income tax, CTC, EITC | ✅ |
| State income tax — all 50 states + DC | ✅ |
| Every taxing state has a recorded source — rates, allowances, head of household | 42 of 42, all the state's own publication |
| ...of which against a 2026 document | 29; the other 13 against the state's most recent, because it has published no 2026 figures |
| ...of which quote the words they were read from | New Mexico's six, after one of its citations turned out to be an empty page |
| State itemised deductions | 14 states, plus NJ's property tax relief, WI's mortgage-interest credit and IL's property tax credit |
| Local income tax — 13 named cities, state averages elsewhere | ✅ |
| 387 metros + 51 rural fallbacks, price parities | ✅ |
| Salary prefilled from local pay — median full-time earnings, per place | ✅ |
| Mortgage rate prefilled from Freddie Mac's weekly survey, quarterly average | ✅ |
| Rent and home price scaled to household and income, effective property tax | ✅ |
| Housing, cars and tax sliced by state for the 43 split metros | ✅ |
| Vehicles per adult, per-vehicle cost | ✅ |
| Household spending profiles, 9 income bands, interpolated by income | ✅ |
| Sales tax rates + grocery treatment | reference only — already inside the spending basket |
| Housing (rent, mortgage, property tax), cars, living costs | ✅ |
| Leftover, city/salary decomposition, break-even solver | ✅ |
| Setup screen — pickers, housing, cars, theme; answer screen with the inputs editable in place | ✅ |
| Results: verdict, headline figure, two-table breakdown, break-even | ✅ |
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

The suite includes 24 golden values reproduced exactly from the published IRS rate tables, and every state figure is checked against the state's own publication.
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
2. **State Earned Income Credits cover 23 states, not all ~30.** (This count and
   every other in this list is checked against the generated data by a test —
   they drifted badly once and are not allowed to again.) Where two
   independent sources agreed on the match it is modelled, refundability
   included. Left out: California, Minnesota and Washington, which use their own
   formulas rather than a share of the federal credit; Delaware, where the
   taxpayer chooses between two credits; Massachusetts, Vermont, Virginia and DC,
   where sources disagree or the credit is mid-change; Oregon, whose higher rate
   depends on a child's age this site never asks for. New York City's own credit
   is not modelled.
3. **State child credits cover one state of sixteen.** Fifteen states and DC
   give a credit for having children, and none of them was calculated until
   August 2026 — nor named anywhere, which was the worse half: the methodology
   page promised that every state rule we know about and do not model is
   written on that state, and a whole category was missing from the promise.
   New Mexico's is now calculated, refundable, $637 a child at the lowest
   incomes down to $26 above $350,000; Arizona's is carried as a dependent
   credit; the other fourteen each carry a note naming the credit and saying
   that the tax shown for a family is higher than the truth.

   New Mexico came out of an audit, not out of this build. The state's 25%
   earned income match was modelled and its separate child credit was not, so a
   single parent on $50,000 in Albuquerque with one child was shown $499.54 of
   state tax against $171.54. Two other New Mexico rules were wrong in opposite
   directions and cancelled part of it: the low- and middle-income exemption
   was missing, and the $4,000 dependent deduction — which the state gives for
   "all but one" dependent, and only on a joint or head-of-household return —
   was being handed out for every child to every filer.
4. **Sales tax differences between states are invisible.** There is no sales
   tax line at all any more: BLS expenditures already include the tax paid at
   the till, so charging it again was a double count. But what the basket
   carries is a NATIONAL blend, so Oregon (no sales tax) and Louisiana (the
   highest, at 10.11%) now look identical on this line. Modelling the difference means
   stripping the embedded average out per category, which the survey does not
   publish. Worth a few hundred a year. The rates stay shipped and visible in
   the data browser, labelled reference-only, for when it can be done.
5. **Every state that taxes wages has been read off its own publication —
   42 of 42, on both counts.**

   Two separate checks, because they answer different questions.

   *Head of household.* Nothing checked this before, and 24 states were wrong —
   always against a single parent, by $75 to $2,559 a year. Six different
   shapes turned up and there is no pattern to guess from, which is why each
   one had to be read. Vermont was the last, and it was closed by noticing
   something about our own data rather than by Vermont publishing anything:
   the brackets shipped here are 2025 figures, so Vermont's 2025
   head-of-household schedule is exactly in step with them.

   *Rates and allowances.* The stronger claim — every bracket and every
   allowance compared against the state's own rate schedule, withholding guide
   or statute. 24 states were wrong. Ohio and Oregon were the last two and
   both turned out to have published after all, just not where anyone looks:
   Ohio's 2026 schedule is in the statute while its own rates page still stops
   at 2025.

   Each state carries the date it was checked and the document it was checked
   against, and the data browser shows both.

   *A citation is not evidence.* New Mexico shipped a release cited to its own
   department's "Personal Income Tax Rates" page, which renders a heading, a
   menu and a footer and not one figure — and it replaced a forms aggregator
   that at least carried the booklet. Nothing caught it, because every check
   was really a check on the host name. A source may now carry `quote`: words
   copied out of the document, whose figures a test matches against the figures
   actually shipped. An empty page cannot supply one. New Mexico's six
   citations carry theirs; the rest of the states are still cited by address
   alone, and the build prints how many of each.

6. **Seven states changed the law after our bracket table was published, and
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

7. **Errors ran BOTH ways, and the ones that flattered are the ones that
   mattered.** Ten states were charging too little, because we handed out
   allowances the state takes away as income rises. Wisconsin's standard
   deduction reaches zero by $136,000 and we gave it in full — a Wisconsin
   couple on $150,000 was being shown a bill $1,268 too low. Connecticut's
   personal exemption is gone by $44,000 and we were still deducting $24,000.

   A verdict that is too rosy is the one that actually moves somebody across
   the country, so those are now modelled: allowances that taper, allowances
   that fall in steps, allowances that stop at a floor, and credits that vanish
   at a cliff.

8. **What is still not modelled is written on the state, not buried here.**
   Twenty-five states carry a note naming the rule that is missing and which way
   it runs — New York's recapture from high earners, Missouri's and Alabama's
   federal-tax deductions, Connecticut's property tax credit, Colorado's
   interaction with itemising, and the rest. Those notes are rendered on the
   methodology page straight from the data, so they cannot drift out of it.

   **State itemising is no longer the largest gap.** Fourteen states now let a
   homeowner claim mortgage interest and property tax on the state return and
   all fourteen are calculated, plus three more that do it differently: New
   Jersey relieves property tax without itemising at all — the only relief here
   a renter can claim, at 18% of rent — Wisconsin gives a credit for mortgage
   interest while ignoring property tax entirely, and Illinois credits 5% of
   property tax until income passes $250,000, when it stops dead.

9. **Thirteen states are on last year's figures, because they have not published
   this year's.** States index on their own timetable and many wait for the
   return forms, which for 2026 means late 2026 or early 2027. The calculator
   has to answer today, so where 2026 does not exist we ship the state's last
   published figures and name the state.

   Alabama, California, Connecticut, Delaware, Idaho, Mississippi, New Mexico,
   Oklahoma, Oregon, Rhode Island, South Carolina, Utah and Vermont, each with a
   sentence saying which figures are affected and why. New Mexico is on the list
   for one figure rather than for the state: its brackets are fixed in statute
   for 2025 and forward, but it indexes its child credit every year and the 2026
   amounts are not out.

   Connecticut and Delaware joined the list after their cited documents were
   opened rather than trusted. Both source URLs sat in a `/2025/` folder, which
   proves nothing on its own — Nebraska's genuinely-2026 schedule also lives in
   a 2025 folder under a 2025 revision stamp. But Connecticut's document is
   headed "2025 Tax Calculation Schedule" and does not contain the string 2026
   anywhere, and Delaware's is headed "RESIDENT INSTRUCTIONS 2025". Delaware's
   also turned out to carry no rate table at all, so its brackets are the one
   set of figures on this site still resting on the compilation rather than on
   the state's own paper, and the state says so. Prices rise, so last year's bands are slightly
   narrow and last year's allowances slightly small — meaning these show a
   little MORE tax than is really owed. The error runs against us, not against
   the reader, and it is stated on the methodology page rather than left to be
   discovered.
10. **Local income tax outside the 13 named cities** is still each state's
   average, which is fair where rates are uniform and wrong where they are not.
   Indiana is no longer among them: every Indiana metro now carries its own
   counties' rates weighted by population, and the Indiana sides of Chicago,
   Louisville and Cincinnati — which were paying nothing at all — are charged.
   Cleveland, Pittsburgh, Louisville, Kansas City, St. Louis, Baltimore and
   Portland all carry their own published rates. What remains on a state
   average is the smaller cities, where the average is much closer to right.

### Rebuilding the dataset

```bash
node scripts/build-state-tax-rules.mjs     # 51 tax jurisdictions
node scripts/build-metros.mjs              # 438 locations, price parities, local pay
node scripts/build-housing-transport.mjs   # rent, homes, property tax, vehicles
node scripts/build-spending.mjs            # BLS spending baselines
node scripts/build-sales-tax.mjs           # sales tax + grocery rules
node scripts/build-local-income-tax.mjs    # 13 cities, Indiana counties, state averages
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
| `lib/` | UI-side helpers (share-link encoding, formatting adapters, the shared form state) |
| `components/` | The two screens — `setup.tsx` and `answer.tsx` — and the fields they share |
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
Consumer Expenditure Survey, Freddie Mac's mortgage rate survey (via FRED), IRS, SSA, the Tax
Foundation, and individual city revenue departments. HUD Fair Market Rents were specified originally and rejected — HUD publishes on
its own areas, which do not map cleanly onto the metros used here. Nothing is paid for, and
there are no runtime API calls: datasets are committed to this repo and bundled at build time.

The Tax Foundation compilations are CC BY-NC 4.0; everything else is public domain. The
[data page](https://packorstay.com/data) lists the source, the licence, and what kind of number
each figure is.

This project is permanently non-commercial: no ads, no paywall, no affiliate links.

**Not financial, tax or legal advice.** Estimates only.
