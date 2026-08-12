# `scripts/` — the data pipeline

Fetches raw data from federal sources, validates it, and writes a dated dataset into `../data/`.

Run manually, or quarterly by a GitHub Action that opens a pull request when anything changed
(Stage 9). **Never auto-merged** — a human reviews the diff and a Vercel preview before it goes
live.

## Planned scripts (Stage 2)

| Script | Source | Produces |
|---|---|---|
| `fetch-census.ts` | Census ACS + CBSA delineation | `metros.json`, `housing.json`, `transport.json` |
| `fetch-bea.ts` | BEA Regional Price Parities | `cost-index.json` |
| `fetch-bls.ts` | BLS Consumer Expenditure Survey | `spending.json` |
| `fetch-hud.ts` | HUD Fair Market Rents | `housing.json` (rent by bedroom) |
| `fetch-tax-rules.ts` | IRS + state revenue departments | `tax-rules.json`, `sales-tax.json` |
| `build-dataset.ts` | — | Orchestrates the above, writes `manifest.json` |

## Non-negotiable: validation

Every script must sanity-check its output and **fail loudly** rather than emit a corrupt dataset.
A silently wrong dataset is far worse than a failed build, because it produces confident,
plausible, wrong answers that someone might act on.

Minimum checks:

- Row counts within expected bounds (roughly 387 metros, 51 tax jurisdictions)
- No nulls in required fields
- Range assertions per field (e.g. property tax rate between 0% and 5%; price parity between
  0.7 and 1.4)
- Every metro referenced by one file exists in `metros.json`
- Diff against the previous dataset: flag any value that moved more than a set threshold, since
  a large jump usually means an upstream format change rather than real-world change

All sources are free and public domain or government-edict; see `PROJECT.md` section 7.
