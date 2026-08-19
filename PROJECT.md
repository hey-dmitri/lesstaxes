# Pack or Stay — Project Vision

> **Status:** **Live** at [packorstay.com](https://packorstay.com). All ten stages shipped.
> Current dataset `2026.26`. What remains open is listed in the README's "Known gaps".
> **Audience:** This document is written so a fresh AI session or new contributor can pick the
> project up cold, with no prior conversation, and understand exactly what is being built and why.
> **Last updated:** 2026-08-15

---

## 1. What this is

A free, static, no-account web app that answers one question with real numbers:

> **"If I move from city A to city B, will I have more money in my pocket, or less?"**

The user picks two US metro areas, enters their salary (and optionally the salary they'd earn
after moving), states their filing status and number of children, and confirms or adjusts their
housing situation. The site returns a single headline figure — the change in annual money left
over after *everything* — broken down by category, with a shareable link and a downloadable
share card.

It is a hobby project. It will never be sold, never carry ads, and must cost **$0/year to run**.

---

## 2. The core insight the product exists to deliver

Naive versions of this question ("Texas has no income tax, so I'll save money!") are frequently
wrong. The product's value is in catching the cases where intuition fails:

- A **pay cut** can outweigh a cheaper city entirely.
- **Cars** can swamp everything: NYC (0 cars) → Austin (2 cars) is a ~$15,000/yr swing that no
  cost-of-living index captures, because indexes measure *prices*, not *quantities*.
- The **SALT deduction cap** rose from $10k to $40k (2025–2029), which shrinks the apparent gain
  of leaving a high-tax state — a change most calculators have not absorbed.
- Most households **do not itemize**, so the "tax benefits of owning a home" are often worth
  exactly $0.
- **Property tax** in low-income-tax states (TX, NH) frequently claws back the income tax saving.
- **Groceries are sales-tax-exempt in 36 of the 46 states that levy one** (reduced in six,
  fully taxed in four), so the sales-tax difference is much smaller
  than people assume — typically a few hundred dollars a year, not thousands.

The site should tell the truth about all of these, including when the truth is boring.

---

## 3. The headline metric

Everything hinges on one definition. **"Money in your pocket"** means what is left after taxes
*and* living costs — not take-home pay.

```
leftover(city) =   gross salary in that city
                 − federal income tax
                 − state income tax
                 − local income tax          (NYC, Yonkers, PA/OH/MD localities)
                 − FICA (Social Security + Medicare)
                 − housing  (rent, or mortgage + property tax + insurance)
                 − living costs (food, utilities, healthcare, transport, other)
                 − state disability and paid family leave, where levied

ANSWER  =  leftover(destination) − leftover(origin)
PERCENT =  ANSWER / leftover(origin)
```

**The answer can and must be able to go negative.** "You'd have $17,000 less" is as valid an
output as "you'd save $14,600", and is often the more useful one.

### 3.1 Decomposition shown as context

The headline conflates two different effects. The site separates them in a secondary line:

```
city_effect   = leftover(destination @ origin_salary) − leftover(origin @ origin_salary)
salary_effect = ANSWER − city_effect
```

Rendered as, e.g.:

> *Austin costs $8,000 less to live in — but the $25,000 pay cut outweighs it.*

### 3.2 Break-even salary

Solve for the destination gross salary where `ANSWER = 0`. Because the tax function is
piecewise-linear and monotonic, binary search converges in ~40 iterations, which is
instantaneous. Displayed as:

> *You'd need **$133,000** in Austin to match Chicago.*

This is the single most actionable output on the page and should be treated as a first-class
result, not a footnote. It turns the tool into something usable in a salary negotiation.

---

## 4. Decisions locked (with rationale)

| # | Decision | Choice | Why |
|---|---|---|---|
| D1 | Geographic granularity | **City / metro area** (~387 CBSAs) | State level cannot represent NYC city income tax or the fact that Austin ≠ rural Texas. Cost-of-living data is published per metro anyway. |
| D2 | Data sourcing | **Free public/government data, bundled with the app** | $0/yr, no licence risk, no API keys, no backend, instant results. |
| D3 | Household detail | **Filing status + number of children + household salary** | Filing status alone is a ~$9,000/yr swing at $150k — larger than the state-tax difference being measured. Non-negotiable input. |
| D4 | Housing input | **Prefilled, fully editable** | Useful answer with zero typing; accurate for those who know their real numbers. Rent prefills are sized to the household and scaled to income (see D27); home prices are not yet — OPEN-4. |
| D5 | Tenure | **Independent rent/own per city** | "Rent in Chicago, buy in Austin" is the most common real relocation and where the math is most interesting. |
| D6 | Non-housing spending | **Auto-modeled from BLS CES × BEA RPP** | Zero input, full category breakdown, every figure traceable to a federal table. |
| D7 | Share links | **All state encoded in the URL, dataset version pinned** | No database, no cost, links never expire, no salary ever leaves the browser. |
| D8 | Screenshot | **Purpose-built share card PNG → Downloads** | A designed image reads better in a text message than a cropped screen grab. |
| D9 | Headline metric | **Change in leftover money (after taxes AND living costs)** | Only metric that cannot mislead when salary changes. |
| D10 | Percentage denominator | **% of current leftover money** | Matches lived experience of spare cash. |
| D11 | Time unit | **Both — annual leading, monthly beneath** | Annual matches salary talk; monthly matches budgeting. |
| D12 | Context line | **Yes — show pure city-cost comparison + break-even salary** | Explains *why*, and gives an actionable target. |
| D13 | Page flow | **Setup screen → answer screen, with the inputs editable in place on the answer** | Revised 2026-08-18 with the Turn 5 redesign. Was *form → reveal → live-editable results* on one page, which made the form and the answer share a width and gave the answer the narrower half. They are two pages now: `/` frames the question and takes the inputs, `/r/<payload>` is the answer at full width and is the address that gets shared. The what-ifs did not move — "Change anything" opens every field on the answer screen, the figures update as you type, and the address follows, so trying $135,000 never means going back. |
| D14 | Animation | **Presentational reveal only — no artificial delay** | Result is computed in <1ms. Nothing is withheld. `prefers-reduced-motion` respected. |
| D15 | Theme | **Follow system, with light/auto/dark toggle, remembered** | No flash of wrong theme on load. |
| D16 | Device priority | **Desktop-first (1440px), adapted down** | Research mode happens at a computer. Mobile must still be genuinely good — share links open on phones. |
| D17 | Cars | **Household-aware default per metro, editable per city** | Biggest hidden lever in the whole calculation. |
| D18 | Coverage | **All ~387 metros + "rest of <state>" fallback + DC** | Nobody hits a dead end; data is published at exactly this resolution. |
| D19 | One-time moving costs | **Deferred to v2** | Purely additive later; doesn't touch the engine or link format. |
| D20 | Pre-tax deductions (401k) | **Not collected** | Cancels out between cities. Pennsylvania special-cased in code. |
| D21 | Methodology | **Dedicated `/methodology` page; results stay clean** | Credibility without UI clutter. Joined by `/data` — see D26. |
| D22 | Destinations per comparison | **One at a time** | Matches the real decision; clean share card. Ranked multi-city deferred to v2. |
| D23 | Analytics | **None whatsoever** | No scripts, no cookies, no banner, nothing to leak. |
| D24 | Name | **Pack or Stay** — `packorstay.com`, public GitHub repo `packorstay` | Chosen 2026-08-13, superseding **LessTaxes** (chosen 2026-08-11) for the reason the original entry had already flagged: a tax-first name foregrounds the very thing §2 exists to argue is *not* the whole story, since housing, cars and cost of living often outweigh the tax difference. "Pack or Stay" is built around the decision rather than the calculation, and still reads correctly when the answer is *stay* — which it often is. Tagline: **"Will moving actually leave you with more money?"** Button copy: **"See the answer"** — originally "Do the move math", then "Run the numbers" from 2026-08-14 because the first made the reader parse a coined noun before they could press it, then the current wording from 2026-08-18 when the interface became two screens and the button became the door between them. Runners-up, all verified unregistered on 2026-08-13: `isitreallycheaper.com`, `shouldipack.com`, `cheaperthough.com`, `keptmore.com`, `richer.city`. The original entry claimed the name "lives in a single config value and is trivial to change"; that was aspirational — it was hardcoded in a dozen places. Made true during this rename: see `lib/site.ts`. |
| D26 | Public `/data` page | **Yes — a searchable dataset browser, a first-class page beside `/methodology`** | Added 2026-08-11 after reviewing the Stage 2 prototype. `/methodology` explains *how the calculation works*; `/data` shows *every number it uses* and where each came from. Together they are the site's credibility argument, and the thing paid competitors cannot easily match. |
| D27 | Rent prefill basis | **Local median for the household's bedroom count (ACS B25031), scaled by a national income curve (ACS B25074)** | Added 2026-08-12. The plain metro median (B25064) quoted a single person and a family of four the same rent, and quoted a $150k earner 11% of pay in Chicago. PROJECT.md §7 named HUD Fair Market Rents for the size fix; ACS B25031 was used instead — same CBSA geography, same vintage, same API, where HUD publishes on HMFA areas that do not map cleanly. The income curve is national, not per-metro: burden varies far less between cities than rent does, so a per-metro anchor would compress the very difference this site measures. |
| D25 | Mortgage principal | **Counted as an outflow, with no annotation** | Cash-flow view: leftover equals the cash actually available. Keeps the headline honest and the UI simple. Accepted trade-off: owning looks slightly worse than it is economically, and the site does not explain why. |

---

## 5. User inputs — complete field list

### 5.1 Required

| Field | Type | Default | Notes |
|---|---|---|---|
| Origin metro | select | — | ~387 CBSAs + 50 "rest of state" + DC |
| Destination metro | select | — | Same list; same-state moves allowed |
| Current gross salary | currency | — | Household total, W-2 wage income |
| Destination gross salary | currency | **same as current** | Editable; "same job, different city" needs no typing |
| Filing status | select | Single | Single / Married jointly / Married separately / Head of household |
| Number of children | integer | 0 | Drives Child Tax Credit and state child credits |

### 5.2 Housing — per city, independently

| Field | Shown when | Default |
|---|---|---|
| Tenure (Rent / Own) | always | Rent |
| Monthly rent | tenure = Rent | Metro median gross rent |
| Home price | tenure = Own | Metro median home value |
| Down payment % | tenure = Own | 20% |
| Mortgage rate % | tenure = Own | Current national 30-yr fixed average |
| Property tax rate % | tenure = Own | County effective rate |

All defaults are visibly marked as metro-derived and are editable.

### 5.3 Transport — per city

| Field | Default |
|---|---|
| Number of cars | `round(metro_vehicles_per_adult × adults)` where `adults = 2` if married, else `1` |

Children do not add cars — the form collects a count but not ages, so teen drivers are unknowable
and will not be guessed at.

---

## 6. Calculation engine specification

Run the following for **each** city independently, then difference the results.

> All constants below (bracket thresholds, standard deduction, SS wage base, SALT cap, CTC amount)
> are **indicative** and MUST be pinned to exact published values from the source tables at build
> time. Do not hardcode remembered figures.

### Step 1 — Gross
`gross` = user input for that city.

### Step 2 — FICA
```
# per EARNER, not per household — the wage base is a per-person cap
social_security = Σ over earners of ( min(wages_of_earner, SS_WAGE_BASE) × 6.20% )
medicare        = gross × 1.45%
                + max(0, gross − ADDL_MEDICARE_THRESHOLD[filing]) × 0.90%
fica            = social_security + medicare
```

**Corrected after launch.** This was written as `min(gross, SS_WAGE_BASE)`,
which caps a two-earner couple as though they were one person. On $300,000
split evenly it charged $11,439 instead of $18,600 — $7,161 of Social Security
that two people genuinely owe. Medicare has no cap and the additional Medicare
threshold is genuinely per household, so only the first line changes.
Federal and identical in both cities — but does *not* fully cancel when salary differs between
cities, so it must be computed per city rather than skipped.

### Step 3 — Housing
```
if tenure == RENT:
    housing_cash      = monthly_rent × 12 + utilities_inside_gross_rent
    property_tax      = 0
    mortgage_interest = 0

if tenure == OWN:
    loan              = home_price × (1 − down_payment_pct)
    monthly_payment   = amortize(loan, rate, 360 months)      # principal + interest
    property_tax      = home_price × county_effective_rate
    upkeep            = owned_dwelling_line ÷ homeowner_share   # repairs + insurance
    mortgage_interest = first_year_interest(loan, rate)       # for itemization test
    housing_cash      = monthly_payment × 12 + property_tax + upkeep + utilities
```

#### 6.1 Insurance note
Homeowners insurance must be **state-level, not national**. Florida and Louisiana are multiples
of the national average and using a single national figure would materially distort any move
involving those states.

### Step 4 — State and local income tax
```
state_taxable = gross − state_standard_deduction[state][filing]
                     − state_personal_exemptions[state] × household_size
state_tax     = apply_brackets(state_taxable, state, filing)
                − state_child_credits[state](children)
local_tax     = apply_local_brackets(gross, locality, filing)   # NYC, Yonkers, PA/OH/MD
```
Nine states have no wage income tax (AK, FL, NV, NH, SD, TN, TX, WA, WY) — these resolve to 0
naturally through the bracket table, not via special-casing.

### Step 5 — Federal income tax
```
salt_paid   = min(state_tax + local_tax + property_tax, SALT_CAP)
itemized    = salt_paid + mortgage_interest
deduction   = max(FEDERAL_STANDARD_DEDUCTION[filing], itemized)
fed_taxable = gross − deduction
fed_tax     = apply_brackets(fed_taxable, federal, filing)
              − child_tax_credit(children)
```
**Order matters:** state and property tax must be computed *before* federal, because they feed
the itemization test. This is the step naive calculators get wrong.

### Step 6 — Living costs
```
profile   = BLS_CES_profile(income_band(gross), household_size)
             → { food, utilities, healthcare, other }

for each category k:
    cost[k] = profile[k] × BEA_RPP[metro][k]

cars      = user-adjustable, defaulting per §5.3
transport = cars × annual_car_cost(metro)      # payment, insurance, fuel, maintenance
          + transit_cost(metro)

living    = Σ cost[k] + transport
```
Transport is deliberately **excluded** from the price-parity-scaled categories and computed from
car counts instead — this is what allows the model to capture a change in the *number* of vehicles
rather than just their price. See §2.

### Step 7 — Sales tax — **REMOVED, and the rates kept as reference**

This step was built and then deleted. BLS defines an expenditure as the
transaction cost INCLUDING sales and excise tax, so the spending basket in step
6 already contains it and charging a rate on top counted the same tax twice —
$917 a year in Chicago, $1,187 in Nashville.

What it used to do, kept for the day the difference between states can be
modelled properly:
```
taxable_spend = Σ over categories of ( cost[k] × taxable_share[k][state] )
sales_tax     = taxable_spend × combined_state_and_local_rate(metro)
```
`taxable_share` is a per-state matrix. Groceries are exempt in 36 of the 46
states with a sales tax; most services are exempt nearly everywhere; rent and
mortgage are never taxed. The rates still ship in
`data/<version>/sales-tax.json`, labelled reference-only.

### Step 8 — Leftover
```
leftover = gross − fed_tax − state_tax − local_tax − fica − state_payroll
                 − housing_cash − living
```

### Step 9 — Difference and present
```
ANSWER  = leftover(destination) − leftover(origin)
PERCENT = ANSWER / leftover(origin)
```
Plus the §3.1 decomposition and the §3.2 break-even salary.

---

## 7. Data sources

All free. All bundled into the app at build time. No runtime API calls. No keys.

| Data | Source | Licence | Vintage |
|---|---|---|---|
| Metro price parities (housing, goods, services) | **BEA Regional Price Parities** | Public domain | ~1–2 yr lag |
| Federal brackets, standard deduction, FICA, CTC | **IRS** | Public domain | Annual |
| State income tax brackets, deductions, credits | **State Departments of Revenue** (statute) | Government edict — no copyright | Annual |
| Local income tax (NYC, Yonkers, PA/OH/MD) | **State/local revenue depts** | Government edict | Annual |
| Median rent, median home value | **Census ACS** (B25064, B25077, DP04) | Public domain | ~1 yr lag |
| Property tax paid by county | **Census ACS B25103** | Public domain | ~1 yr lag |
| Rent by bedroom count | Census ACS table B25031 | Public domain | Annual |
| Household spending by income band | **BLS Consumer Expenditure Survey** | Public domain | Annual |
| Regional price levels / inflation | **BLS CPI (regional)** | Public domain | Monthly |
| Home price index | **FHFA HPI** | Public domain | Quarterly |
| Vehicles per household, household size | **Census ACS B25044, B25010** | Public domain | ~1 yr lag |
| Metro definitions, county↔metro mapping | **Census CBSA delineation / Gazetteer** | Public domain | Periodic |
| Sales tax rates (state + local) | **State DORs**; cross-check **Tax Foundation** | Statute; TF is CC BY-NC | Annual |

**Licence note:** Tax Foundation content is CC BY-**NC**. Fine here because the project is
permanently non-commercial (D2, §1). If that ever changes, Tax Foundation data must be removed
and replaced with the primary state statutes it summarises.

**Deliberately avoided:** C2ER/COLI (licensed, thousands/yr), Numbeo (paid + noisy), Zillow and
Redfin research data (free to download but terms are unclear on redistribution inside a product —
Census ACS + HUD cover the same ground with true public-domain data).

---

## 8. Output specification

```
┌──────────────────────────────────────────────────────────┐
│  Chicago, IL   →   Austin, TX                            │
│                                                          │
│         $17,000 less in your pocket                      │
│         −30.6% of your spare cash                        │
│         −$1,417 / month                                  │
│                                                          │
│  ── why ─────────────────────────────────────────────────│
│  Austin costs $8,000 LESS to live in — but the $25,000   │
│  pay cut outweighs it.                                   │
│  You'd need $133,000 in Austin to break even.            │
│                                                          │
│  ── breakdown (sorted by impact) ────────────────────────│
│  Salary                                    −$25,000      │
│  State income tax                           +$7,400      │
│  Housing                                    −$6,200      │
│  Cars (1 → 2)                               −$1,900      │
│  Property tax                               −$3,100      │
│  Food, utilities, healthcare                +$1,300      │
│  Sales tax                                    +$500      │
│                                                          │
│  [ Share link ]  [ Save image ]        ☀ ◑ ☾            │
└──────────────────────────────────────────────────────────┘
```

Rules:
- **When the two salaries differ, show a third column: the destination at the ORIGIN salary.**
  Added 2026-08-11 after the project owner read the two-column Stage 3 table as
  "federal tax varies by state". It does not — federal tax and FICA are identical in every state
  at a given salary, and were moving only because the salaries differed. If the person who
  specified the product misread it, every user will. The middle column makes the city effect and
  the salary effect legible line by line, and rows governed purely by federal rules carry a
  "same in both" marker.
  (The one real exception: federal tax *can* differ between states via the SALT deduction, but
  only for filers who itemise. The marker is applied only when the middle column confirms no
  movement.)
- Positive = better off in destination. Negative = worse off. Consistent colour coding, and
  never rely on colour alone (accessibility).
- Every input remains editable in place; results recompute instantly on change.

**Superseded by the Turn 5 redesign, 2026-08-18.** The sketch above is the Stage 3 shape and three
of its rules no longer hold. Recorded here rather than redrawn, because the answer screen is now
too wide to draw in a box:

- **There is no sales tax row.** It moved into the spending figures in 2026.7 — the basket already
  contains the tax paid at the till, so a separate line double-counted it. Old share links replay
  their own release and get the row back.
- **The rows are not sorted by impact.** Sorting them meant the tax lines arrived in a different
  order for every comparison, and a reader could not tell a missing tax from one that happens to be
  equal in both cities. Every tax has a fixed row and prints "the same" when the two cities agree,
  which is itself an answer: somebody looked.
- **The breakdown is two tables side by side, not one list.** Left: the salary and every tax on it.
  Right: everything the household spends. Each is headed with the direction it is measured in and
  its own total; the line underneath adds the two together, which is the headline figure. Each row
  carries a glyph, a monthly figure and a yearly one, and the yearly one says LESS or MORE in words
  as well as in colour — see the 2026-08-16 commit for why the sign alone was read backwards.
- Beside the headline figure sit two cards: the **salary needed to break even** and the **biggest
  single reason**, both written by `engine/narrative.ts` so this screen, the share card and the link
  preview cannot describe the same move three different ways.

---

## 8a. Site structure

| Route | Purpose |
|---|---|
| `/` | The setup screen — the question, the household, and the two cities with their salaries. Sized to fit one screen without scrolling; everything else is asked on the answer |
| `/r/<payload>` | The answer, at full width, with every input editable behind "Change anything". Also where a shared link opens |
| `/methodology` | How the calculation works: the formula, the order of operations, every assumption and known limitation |
| `/data` | Searchable browser over every figure in the dataset — all 438 locations, their price parities, housing, vehicles and tax treatment, with the source and vintage of each |

**The wait between the two screens, addressed 2026-08-19.** The answer screen is rendered on demand
— its address carries the inputs, so there is nothing to prerender — and that round trip measured
about 0.8s warm and about 3s on the first request after the server had been idle. Nothing was
failing; the button simply did nothing visible for long enough that a stranger would press it
again. Three things, in the order they take effect: the setup screen **prefetches** the answer 500ms
after the two cities settle, so the page is usually already in hand before anybody clicks; the
button enters a **pending state** through `useTransition`, for a click that lands before the
prefetch finishes; and `app/r/[payload]/loading.tsx` paints a **skeleton in the shape of the
answer** the instant navigation starts. None of them is a progress bar: the wait is a network round
trip of unknown length and nothing on screen claims to know how far along it is.

**The root cause is not fixed.** `engine/datasets.ts` statically imports all 29 shipped dataset
releases, which is roughly 12MB of JSON parsed on every cold start of any function that touches the
engine — and the same 12MB in the browser bundle. A link only ever needs the one release it is
pinned to. Loading them lazily would make `datasetBundle()` async and ripple through every accessor
in the engine, so it is recorded here rather than done in passing.

**Abbreviated figures, added 2026-08-19.** Anything that is a summary is written short — "$10.9K",
"$1.2M" — and anything that is a row of a table is written in full. The split is not cosmetic: the
rows have to add up to the subtotal above them, and a reader checking that sum against rounded rows
finds it out by hundreds. Summaries are quoted once and compared by eye, where six digits and two
commas say a precision nobody uses and, at headline size, run the width of the column. The
threshold is **a thousand**, not ten thousand, for consistency rather than brevity: at ten thousand
two figures laid out for comparison could come out written differently — Raleigh's leftover was
$13.8K beside Lafayette's $7,008, in matching cards — and two notations for the same quantity read
as two different kinds of thing. `formatUSDShort` in `engine/money.ts`; the share card follows the
same rule so the picture and the page agree.

**The verdict leads, added 2026-08-19.** The Turn 5 design puts the money at 88px and the verdict in
a 12px eyebrow above it, which is the wrong way round — the eyebrow is the answer and the figure is
the evidence for it. Worse, a bare "$10,860" in coral says nothing about what it measures: a reader
has to decide for themselves whether that is what they gain, lose, earn or spend. So the verdict is
the headline, and the figure sits inside a sentence that names both cities and says which way it
runs: *"Moving to Lafayette would leave you **$6.8K a year worse off** than staying in Raleigh."*

**Which screen asks for what, revised 2026-08-18.** The setup screen asks only what this site
cannot derive for you: the household, the two places, and the two salaries. Rent, cars, the home
price and the three mortgage terms are all prefilled from real local figures, so nobody has to
touch them to get a true answer — and every one of them was a box asking to be checked on the
screen where the reader has the least reason to care and the least idea what a good answer looks
like. They live on the answer screen now, behind "Change anything", where the figure moves as they
are changed and "should I put my real rent in?" has a visible point. The one exception is the state
question for the 43 metros that cross a state line, which stays on setup: it is part of choosing
the place, and Newark and Manhattan are one metro here and two completely different tax bills.

`/methodology` answers *"how did you get this number?"*. `/data` answers *"where did your numbers
come from, and what do you think my city costs?"*. They are deliberately separate: one is prose,
one is a tool.

The Stage 2 review page is the working prototype of `/data` and should be adapted rather than
rebuilt — search box, sortable columns, price parities as percentages of national average,
provenance table, limitations list.

---

## 9. Sharing specification

### 9.1 Link format

All state lives in the URL. Nothing is stored server-side.

```
packorstay.com/r/<base64url payload>
```

Payload contains:

| Field | Notes |
|---|---|
| `v` | **Dataset version** (e.g. `2026.1`) — critical, see §9.2 |
| `o`, `d` | Origin / destination CBSA codes |
| `gs`, `gd` | Origin / destination gross salary |
| `f` | Filing status enum |
| `k` | Children count |
| `to`, `td` | Tenure per city |
| *overrides* | Rent, home price, down %, rate, property tax %, car count — **only included if the user changed them from the default** |

Encoding: tagged varints → deflate → base64url. Because unchanged defaults are omitted, the
common case produces a URL of roughly **40–90 characters** — short enough to paste into an email
or text without wrapping.

### 9.2 Dataset versioning — why it matters

The link carries the dataset version, and the app retains historical dataset versions. This
guarantees the requirement that **the recipient sees byte-identical numbers to the sender**, even
if the underlying government data is refreshed months later. Without this, links silently rot.

Old dataset versions must never be deleted.

### 9.3 Share card

Clicking "Save image" composes a purpose-built PNG (not a screen grab) and downloads it:

```
┌───────────────────────────┐
│  Chicago, IL → Austin, TX  │
│                            │
│     $17,000 less           │
│     in your pocket / yr    │
│        −30.6%              │
│                            │
│  Salary        −$25,000    │
│  Income tax     +$7,400    │
│  Housing        −$6,200    │
│  Property tax   −$3,100    │
│                            │
│  Pack or Stay     v2026.1  │
└───────────────────────────┘
```

Rendered in the user's current theme. Filename should be descriptive, e.g.
`chicago-to-austin-packorstay.png`.

---

## 10. Non-functional requirements

| Requirement | Target |
|---|---|
| Time to interactive | Fast enough that the form is usable effectively immediately |
| Calculation time | <1ms — pure arithmetic on bundled data |
| Backend | **None.** Fully static. |
| Database | **None.** |
| Runtime API calls | **None.** |
| Hosting cost | **$0/yr** |
| Accounts / login | None |
| Cookies | None (theme preference stored in `localStorage`, not a cookie) |
| Analytics / tracking | None |
| Offline | Should work after first load |
| Accessibility | Keyboard navigable, screen-reader labelled, WCAG AA contrast in both themes, never colour-alone for meaning |
| Motion | All animation gated behind `prefers-reduced-motion` |
| Payload | **Measured at Stage 8: 238 KB gzipped on first load, of which the datasets are only 49 KB (20%) and the React/Next runtime is 189 KB (80%).** The planned per-metro split was therefore NOT done: it would save at most ~40 KB while forcing the engine from synchronous to asynchronous, which is a bad trade. JSON compresses far better than the assumption behind that plan item allowed for. County records — 15 KB gzipped and never read by the engine — are split into a separate file and correctly excluded from the client. |

---

## 11. Assumptions (agreed)

1. Salary = W-2 wage income. Bonuses may be folded in by the user. No RSU, self-employment,
   rental or investment income handling.
2. Destination salary defaults to current salary.
3. Tax model covers: federal brackets, standard vs. itemized (larger wins), SALT cap, FICA, CTC,
   EITC; state brackets, deductions, exemptions and their income phase-outs, state itemized
   deductions in the 14 states that allow them, state earned income credits in 23 states, state
   disability and paid-leave contributions, and local income tax. **Not** modeled: AMT and
   high-income surtaxes beyond the published schedules, and most state credits — including the
   child credits that 15 states and DC now give, of which only New Mexico's is calculated.

   This line said "state … child credits" were modeled and "itemized state deductions" were not,
   and both halves were backwards: no state child credit was calculated anywhere in the engine,
   while state itemising had been shipped for fourteen states. Every state rule known to be
   missing is now written on that state in `modellingGaps`, which the methodology page renders
   directly, so this paragraph can never again be the only place a limitation is recorded.
4. Tax year = most recent fully published rules.
5. Lifestyle transfers — the same basket of goods is re-priced in the new city. The site does not
   assume the user changes how they live (cars excepted, per §6 Step 6).
6. Health insurance assumed employer-sponsored and roughly portable; sits inside the general
   healthcare category.
7. Home and renters insurance folded into housing, at **state** granularity (§6.1).
8. Mortgages assumed 30-year fixed. The rate the field opens on is Freddie Mac's Primary Mortgage
   Market Survey (MORTGAGE30US via FRED), averaged over the most recent complete calendar quarter
   and refreshed with the rest of the dataset. It was a hard-coded 6.8% until August 2026 — the one
   figure on the site with no source behind it, in front of the mortgage payment, the interest
   deduction and the federal bill that deduction changes. It is national: rates barely differ
   between metros, and what one borrower is offered turns on their credit and their lender.
9. United States only. USD only. English only.
10. No accounts, no login, no saved history — the share link *is* the save mechanism.
11. No capital-gains tax on home sale (belongs with deferred moving-costs feature).
12. Federal rules treated as identical in both cities, because they are. The site's job is
    isolating what actually differs.

---

## 12. Explicit non-goals

- Not financial, tax, or legal advice. Estimates only.
- Not a tax filing tool.
- Not international.
- Not a job board, listing site, or realtor referral.
- No user accounts, no email capture, no newsletter.
- Never monetised — no ads, no paywall, no affiliate links.

---

## 13. Deferred backlog (v2+)

| Item | Notes | Reversibility |
|---|---|---|
| One-time moving costs + payback period | Movers, closing costs, realtor fees, deposits → "you break even in 13 months" | Purely additive. New optional fields, same engine, old links still valid. |
| Ranked multi-city "where would I do best?" | Same engine run in a loop over all metros | Additive. No schema or link change. |
| Live housing data feed | Swap the bundled rent/price module for an API behind the same interface | Cheap by design — keep the data layer behind a narrow interface from day one |
| Optional short-link service | Front-end for the self-contained URL | Additive; long links keep working forever |

---

## 14. Open decisions

### ~~OPEN-1 — Treatment of mortgage principal~~ — **RESOLVED, see D25**

### ~~OPEN-2 — Technical stack~~ — **RESOLVED, see §16**

### ~~OPEN-3 — Dataset version pinning~~ — **RESOLVED 2026-08-13**

`engine/datasets.ts` is now a registry of every shipped release, and every
accessor takes an optional version. `compare()` resolves the link's version once
and prices both cities from it. Old releases keep their **behaviour**, not just
their numbers: 2026.1 has no rent-by-bedroom table and no income curve, so its
links still price rent income-blind exactly as that release shipped.

Two related defects were found and fixed at the same time:

- `engine/tax/rules.ts` was reading `data/2026.1` while `engine/dataset.ts` read
  `data/2026.2`, each claiming in its header to be the only door into `data/`.
- Five build scripts and the quarterly refresh were pinned to `2026.1`, so the
  automation had been rebuilding a dataset the site no longer read. All scripts
  now resolve one version from `scripts/lib/version.mjs`.
- The quarterly workflow rewrote the current release **in place**, which would
  have silently undone this pinning every quarter. It now runs
  `scripts/cut-dataset-version.mjs` first, so a refresh always lands in a new
  dated directory and the previous one stays readable forever.

### OPEN-6 — Sales tax differences between states are invisible

Added 2026-08-13 as "uses state-average local rates". REFRAMED 2026-08-15,
because the premise changed underneath it.

There is no sales tax line at all now. BLS defines an expenditure as the
transaction cost INCLUDING sales and excise tax, so the spending basket already
contains it and the separate line was charging it twice — $917 a year in
Chicago, $1,187 in Nashville. See the "Stop charging sales tax twice" commit.

What remains open is the reverse of the original complaint. The basket carries
whatever sales tax its surveyed households paid, which is a NATIONAL blend, so
Oregon at zero and Tennessee at the top of the table are now identical on this
line. Modelling the difference means stripping the embedded average out of the
basket per category and applying the local rate instead, and CE does not publish
the embedded amount. Until it can be done properly, an unmodelled difference of
a few hundred dollars beats a doubled charge.

The city-level rate hunt described in the original entry is still the thing that
would improve it, and the rates remain shipped and visible in the data browser,
labelled reference-only.

### OPEN-5 — Owner upkeep and insurance do not scale with the house

**Largely CLOSED 2026-08-15, and the original framing was wrong.**

This was filed as "home insurance has no usable free source", and the search
below was real but was looking for the wrong thing. Insurance was never a
separate missing dataset. BLS publishes owned-dwelling spending as three parts —
mortgage interest, property taxes, and *"Maintenance, Repairs, Insurance, Other
Expenses"* — and the engine was discarding the whole shelter block and rebuilding
only the first two. Insurance was one ingredient of a line item that was missing
whole, along with every roof, boiler and plumber beside it.

The line is now charged to owners: `ownerUpkeep.perOwner` in spending.json,
published figure divided by the published homeowner share, because the average
includes renters who pay none of it. About $4,000/yr at $100k of income and
$7,268 above $200k. Renters are charged nothing.

WHAT REMAINS OPEN. It is adjusted by the BEA *other services* parity, not by the
price of the house. Local repair labour is what that index measures, and it was
the honest choice — the housing parity is far higher in expensive metros and
would have flattered the correction, but it measures RENTS, driven by land
scarcity, and a roof repair in San Jose does not cost four times an Austin one
because the land does. The residual error leans towards making expensive metros
look cheaper than they are. Florida and Louisiana premiums, at a multiple of the
national average, are likewise invisible — so the source hunt below still has
value, now for a much smaller correction than it was filed for.

THE LESSON WORTH KEEPING. Four separate audits found four money errors in this
engine in one day, and three of them were the same mistake: a published
aggregate excluded wholesale, then rebuilt by hand from fewer parts than it
contained. Sales tax inside the spending basket, utilities inside gross rent,
and upkeep inside owned dwellings. When this engine drops a published total and
reconstructs it, the reconstruction must be checked against the definition of
what was dropped — not against what seems obviously to belong.

The original search, kept because it is still the state of play for premiums:

What was checked and rejected:

- **ACS has no insurance table.** Premiums are not a Census subject.
- **Treasury's Federal Insurance Office** published a homeowners data call, but
  no machine-readable file is served at a stable URL.
- **NAIC's annual Homeowners Insurance Report** exists and is authoritative, but
  is published as a PDF, and NAIC is a private standards body — the
  public-domain assumption behind every other source here does not apply, and
  its terms would need checking before use.

Deliberately NOT done: hardcoding remembered premium figures. §6 forbids exactly
that ("Do not hardcode remembered figures"), and it is the one category of error
the tests cannot catch. A wrong number that looks authoritative is worse than a
documented absence.

Options, in order of preference: parse the NAIC PDF once by hand into a
committed CSV with the vintage recorded, treating it like the other MANUAL
sources in `scripts/refresh-sources.mjs`; or wait for FIO to publish a stable
data file.

### ~~OPEN-4 — Ownership defaults are income-blind~~ — **RESOLVED 2026-08-13, dataset 2026.3**

Home price now scales with income from ACS B25121, and property tax follows it.

The fix changed the rent model too. Both were scaling a LOCAL median by a
NATIONAL multiplier, which double-counts wherever the local median already
belongs to high earners: a $150,000 buyer in San Francisco came out at $1.5m,
a third above the local median, while earning below the local median owner.

Both curves are now anchored to the local median owner or renter income
(ACS B25119), so the multiplier is exactly 1.0 for the household the median
describes. Only the *elasticity* stays national — how sharply housing spend
rises with income is behavioural, not local. The local price is untouched, so
differences between cities survive at full strength.

The independent check improved too: B25122 shows over half of $100k+ Chicago
renters paying above $2,000/month. The national-multiplier model said $1,708;
the locally anchored one says $2,122.

---

## 16. Technical stack

| Layer | Choice | Notes |
|---|---|---|
| Language | **TypeScript** | Type safety matters for a tax engine — catches annual/monthly unit errors at build time |
| Framework | **Next.js (App Router)** | Vercel-native; zero-config deploy; native OG image generation; largest ecosystem |
| Styling | **Tailwind CSS** | Custom design, utility-first |
| Components | **shadcn/ui** (selected primitives only) | Combobox, radio group, toggle, tooltip — copy-in, no runtime dependency. Gets keyboard/screen-reader behaviour right for free |
| Hosting | **Vercel** (Hobby tier) | $0/mo. Auto-deploy from GitHub. Preview URL per change. **Set up at Stage 4, not before** — see §16.3 |
| Source control | **GitHub** | Public repo, `packorstay`. Created at Stage 4 |
| Domain | **`packorstay.com`** — registered 2026-08-13, pointed at Vercel | Deliberately deferred until after Stage 3. See D24 |
| Backend | **None**, except one stateless OG image function | No database, no stored state, no runtime data fetching |
| Testing | **Unit tests on the calculation engine** | Golden-value tests against IRS worked examples. Non-negotiable — a wrong bracket must fail the build, not mislead a user |
| Data pipeline | **Scripts → dated JSON committed to the repo** | See §16.2 |
| Data refresh | **Quarterly GitHub Action → opens a PR** | Never auto-merges. Owner reviews a Vercel preview before it goes live |

### 16.1 Architectural commitment — the engine is framework-free

The calculation engine (`/engine`) is **plain TypeScript with zero framework dependencies**. It
imports nothing from Next.js, React, or Tailwind. It is imported by the UI, by the tests, and by
the OG image function.

This is deliberate: the engine is the valuable, hard-to-rebuild part of this project, and it must
outlive any UI decision. If the framework were ever changed, the engine ports across untouched.

### 16.2 Data pipeline

Fetching and building were planned as separate steps and never separated. Each
builder reads raw responses committed under the release's own `sources/`
directory, which is what lets any of them rebuild offline with no API key;
`refresh-sources.mjs` is the only thing that talks to the network.

```
data/<version>/sources/   ──►  scripts/build-metros.mjs           ──►  metros.json
      (committed)                                                      metros-counties.json
           ▲                    scripts/build-housing-transport.mjs ──►  housing.json
           │                                                            transport.json
           │                    scripts/build-spending.mjs         ──►  spending.json
  refresh-sources.mjs           scripts/build-state-tax-rules.mjs  ──►  federal.json
  (the only network call)                                              states.json
                                scripts/build-local-income-tax.mjs ──►  local-income-tax.json
                                scripts/build-sales-tax.mjs        ──►  sales-tax.json
                                                                        (reference only)
                                          │
                                validate + sanity-check
                                          │  every builder throws rather
                                          │  than emit a bad number
                                          ▼
                                  committed to GitHub
                                          │
                                          ▼
                                   bundled into build
```

**Rules:**
- Dataset files are **committed to the repo**, never fetched at build time. A government API
  outage must not be able to break a deployment, and two builds of the same commit must produce
  identical numbers.
- Dataset directories are **immutable once shipped**. Old versions are never deleted or edited —
  this is what guarantees §9.2 (shared links never change).
- A new data release creates a **new** dated directory (`2026.2/`), leaving `2026.1/` intact.
- Scripts must include sanity checks (range assertions, row counts, null checks) that fail loudly
  rather than emitting a corrupt dataset.

### 16.3 Review workflow

The project owner does not write code and will never run anything locally. Every stage must end
in something they can **open and look at**.

**Stages 0–3 (engine and data, no UI yet)** — results are published as standalone web pages the
owner can open directly from the conversation. Worked tax examples, dataset browsers, and
end-to-end scenario calculations are all reviewable this way without any deployment existing.

**Stages 4–9 (real interface)** — GitHub and Vercel are connected at the start of Stage 4, from
which point the loop is:

1. Work is pushed to a branch on GitHub
2. Vercel automatically builds a **preview URL** for that branch
3. Owner opens the preview URL on desktop or phone and evaluates the real thing
4. Feedback → iterate → merge to `main` → live

Deployment is deliberately deferred to Stage 4 at the owner's direction: there is no value in a
deploy pipeline until there is an interface worth deploying.

---

## 15. Glossary of gotchas the engine must get right

| Gotcha | Consequence if missed |
|---|---|
| NYC and Yonkers levy **local** income tax on top of NY state | Overstates savings from leaving NYC by thousands |
| SALT cap is **$40k** (2025–2029), not $10k | Overstates savings from leaving high-tax states |
| Most households take the **standard deduction** | Fabricates non-existent "tax benefits of owning" |
| State/property tax must be computed **before** federal | Itemization test is wrong; federal tax is wrong |
| **Groceries exempt** from sales tax in 36 of the 46 states that levy one | Overstated the sales tax difference substantially, back when one was charged |
| Local sales tax dominates (Chicago 10.25% vs Austin 8.25% on identical 6.25% state bases) | State-level rates alone find no difference at all |
| **Car count**, not car price, drives transport cost | Misses ~$15k/yr on the canonical NYC→Austin move |
| Cars scale with **adults in household**, not just metro | Doubles a single person's transport cost |
| Texas/NH property tax is high precisely *because* income tax is low | Overstates the no-income-tax advantage |
| FL/LA homeowners insurance is a multiple of the national average | Badly distorts any move involving those states |
| Pennsylvania taxes 401(k) contributions | Only state where the omitted-401k assumption breaks |
| Social Security tax caps at the wage base | Overstates FICA for high earners |
| Marriage penalty exists in some state bracket structures | Wrong state tax for married filers |
