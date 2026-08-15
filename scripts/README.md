# `scripts/` — the data pipeline

Fetches raw data from federal sources, validates it, and writes a dated dataset into `../data/`.

Run manually, or quarterly by a GitHub Action that opens a pull request when anything changed
(Stage 9). **Never auto-merged** — a human reviews the diff and a Vercel preview before it goes
live.

## The scripts

The six `fetch-*.ts` files this section used to plan were never written. Fetching
and building were not separated in the end: each builder reads the raw responses
committed under the release's own `sources/` directory, so every one of them
rebuilds offline with no API key.

| Script | Source | Produces |
|---|---|---|
| `build-metros.mjs` | Census CBSA delineation, BEA RPP | `metros.json`, `metros-counties.json` |
| `build-housing-transport.mjs` | Census ACS | `housing.json`, `transport.json` |
| `build-spending.mjs` | BLS CES, BLS CPI, Case-Shiller | `spending.json` |
| `build-state-tax-rules.mjs` | State revenue departments and statutes | `federal.json`, `states.json` |
| `build-local-income-tax.mjs` | City revenue departments, Indiana DOR | `local-income-tax.json` |
| `build-sales-tax.mjs` | Tax Foundation, state statutes | `sales-tax.json` (reference only) |
| `build-all.mjs` | — | Runs every builder above, in order |
| `refresh-sources.mjs` | — | Re-downloads the upstream responses into `sources/` |
| `cut-dataset-version.mjs` | — | Opens the next release and registers it |

Three more generate review pages rather than data: `report-dataset.ts`,
`report-scenarios.ts` and `report-tax-examples.ts`. They read through the
engine's own dataset resolver, so they cannot disagree with the calculator
about which release is live — `report-dataset.ts` did exactly that for
twenty-four releases, reading `2026.2` while printing today's version at the
top of the page.

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
