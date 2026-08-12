# `engine/` — the calculation core

**Rule: this folder has no framework dependencies, and must never gain any.**

Nothing in here may import from `next`, `react`, `react-dom`, Tailwind, or anything in `app/`.
It is plain TypeScript that runs identically in a browser, in Node, in a test, and inside the
link-preview image function.

This is enforced by ESLint (`no-restricted-imports` scoped to `engine/**` in
`eslint.config.mjs`), so a violation fails the build rather than being caught in review.

## Why

The engine is the valuable, hard-to-rebuild part of this project — fifty states of tax rules and
a carefully reasoned cost model. Frameworks turn over every few years; tax law and the shape of
this calculation do not. Keeping the boundary strict means a future UI rewrite ports the engine
across untouched, and means the engine can be tested exhaustively without rendering anything.

See `PROJECT.md` section 16.1.

## Conventions

- **Every monetary value is annual, in whole US dollars**, unless the property name says
  otherwise (`monthlyRent`). Mixing annual and monthly is the most likely way to produce a number
  that is wrong by exactly 12x and still looks plausible.
- **Rates are fractions, not percentages.** 6.8% is `0.068`.
- **Round only at display boundaries.** Intermediate math stays in unrounded floats so rounding
  error cannot accumulate across a long chain of operations.
- **Positive deltas mean better off in the destination.** Applies everywhere a delta appears.

## Layout

| Path | Contents | Stage |
|---|---|---|
| `types.ts` | Domain model — inputs and results | 0 ✅ |
| `money.ts` | Formatting and unit-conversion helpers | 0 ✅ |
| `tax/` | Federal, FICA, state, and local income tax | 1 |
| `housing/` | Rent, mortgage amortisation, property tax, insurance | 3 |
| `living/` | Spending profiles, price parities, cars, sales tax | 3 |
| `compare.ts` | `leftover()`, the decomposition, the break-even solver | 3 |
| `index.ts` | Public API surface | 3 |

Tests live beside the code they cover, as `*.test.ts`.
