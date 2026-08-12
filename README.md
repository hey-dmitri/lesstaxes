# LessTaxes

Will you actually have more money in your pocket if you move to another city?

Pick two US metro areas, enter your salary, filing status and housing situation, and get a single
honest number — net of income tax, property tax, sales tax, housing, cars and cost of living.
The answer can be negative, and often is.

Free, no accounts, no tracking, no database. All figures come from public federal data.

---

## Status

**All ten stages built.** Feature-complete, not yet launched. Current dataset: **2026.2**.

| Component | State |
|---|---|
| Bracket arithmetic, FICA, federal income tax | ✅ |
| State income tax — all 50 states + DC | ✅ |
| Local income tax — engine and rate data | ✅ |
| 387 metros + 51 rural fallbacks, price parities | ✅ |
| Rent by unit size and income, home prices, effective property tax | ✅ |
| Vehicles per adult, per-vehicle cost | ✅ |
| Household spending profiles, 9 income brackets | ✅ |
| Sales tax rates + grocery treatment | ✅ |
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
| **Share links pinned to their dataset version** — see below | ⬜ |
| **Home prices scaled to income, as rents now are** | ⬜ |
| **Register a domain, point it at Vercel** | ⬜ |

**620 tests**, including 24 golden values reproduced exactly from the IRS rate tables.
Total data cost: **$0**. No paid feeds, no runtime API calls.

### Known gaps, in priority order

1. **Share links are not actually pinned to a dataset version.** The link format
   carries one and `compare()` echoes it back, but `engine/dataset.ts` imports a
   single dataset directly, so every link computes against whatever is currently
   compiled in. PROJECT.md §9.2 promises the opposite. Nothing is public yet so
   no real links are affected — but this must land **before a domain does**, or
   shared results will silently change under the people holding them.
   `data/2026.1/` is kept intact on disk ready for it.
2. **Buying is still income-blind.** Rent is now sized to the household and
   scaled to income; home price is still the metro median, and property tax is
   computed from it. The ownership path has the flaw the rental path just lost.
3. **Home and renters insurance are still missing entirely**, which understates
   ownership everywhere and badly in Florida and Louisiana.

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

A GitHub Action runs both quarterly and opens a pull request when a figure
actually changes. It never pushes to `main` — a human reviews the diff and a
Vercel preview first.

All raw source responses are committed under `data/2026.1/sources/`, so every script
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

Every number comes from a free, public source: BEA Regional Price Parities, Census ACS, HUD Fair
Market Rents, BLS Consumer Expenditure Survey, IRS, and state revenue departments. Nothing is
licensed, nothing is paid for, and there are no runtime API calls — datasets are committed to
this repo and bundled at build time.

This project is permanently non-commercial: no ads, no paywall, no affiliate links.

**Not financial, tax or legal advice.** Estimates only.
