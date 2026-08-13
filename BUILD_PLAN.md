# Pack or Stay — Build Plan

Companion to `PROJECT.md`. Ten stages, each ending in something the project owner can **look at**
and approve before the next begins. Nothing is built ahead of approval.

**Review model:** the owner does not code and never runs anything locally.

- **Stages 0–3** have no user interface. Results are published as standalone web pages, opened
  directly from the conversation. No deployment required.
- **Stages 4–9** have a real interface. GitHub and Vercel are connected at the start of Stage 4,
  and from then on every change gets its own preview URL.

Deployment is deliberately deferred to Stage 4 — there's no value in a deploy pipeline before
there's an interface worth deploying.

---

## Stage 0 — Project scaffold

**Build:** Next.js + TypeScript + Tailwind project structure, created locally. Engine folder laid
out with its framework-free boundary established. Test runner wired up. No GitHub, no Vercel.

**You'll see:** a short summary of what exists and why. Nothing visual — this stage is plumbing.

**Risk:** none.

---

## Stage 1 — The tax engine

**Build:** federal brackets, FICA, standard vs. itemized with the SALT cap, Child Tax Credit,
plus all 50 states + DC, plus local income taxes (NYC, Yonkers, PA/OH/MD localities). Full unit
test suite against IRS worked examples.

**You'll see:** a web page of worked examples — *"Single, $150,000, Illinois → federal $X, state
$Y, FICA $Z"* — covering a spread of incomes, filing statuses and states. You can check any row
against any online tax calculator to confirm we match.

**Why here:** this is the highest-risk correctness work in the project. If the tax math is wrong,
everything built on top of it is wrong. Doing it early, in isolation, with tests, is the cheapest
place to get it right.

**Expect one of the longer stages.** Fifty states of bracket structures, deductions, exemptions
and credits is a lot of careful data entry.

---

## Stage 2 — Data pipeline and the metro dataset

**Build:** fetch scripts for Census ACS, BEA, BLS and HUD; validation and sanity checks; the
first dated dataset (`data/2026.1/`) covering all ~387 metros plus rural fallbacks.

**You'll see:** a data browser page — pick any city, see every number the site holds for it and
which federal table it came from. Spot-check the places you know well.

**Why here:** the engine needs real data to be testable end to end, and you need a chance to look
at the raw numbers before they're buried behind an interface.

**Expect the most tedious stage.** Four agencies, four file formats, geography codes that don't
quite line up between sources.

---

## Stage 3 — The complete calculation engine

**Build:** housing (rent and own), cars, living costs, sales tax, the `leftover` calculation, the
city-effect/salary-effect decomposition, and the break-even salary solver.

**You'll see:** your own scenarios computed end to end — Chicago→Austin, NYC→Austin, and any
others you want to throw at it — with every intermediate number visible so you can follow the
logic, not just the answer.

**This is the most important checkpoint in the project.** Not because the code is risky, but
because it's where you find out whether the *model* matches your intuition. If the numbers feel
wrong here, we fix the model before a single pixel of interface is designed around it.

**Also the right moment to settle the domain.** After a dozen real results you'll know what the
thing actually is.

---

## Stage 4 — Deployment, then the input form

**Build:**
1. Public GitHub repo `packorstay`, Vercel connected, first deploy — done at the top of this stage.
2. City pickers with search, salary fields, filing status, children, per-city housing with
   metro-derived defaults, per-city car counts. Desktop-first at 1440px, light/dark with toggle.

**You'll see:** your first real preview URL, with a form you can actually fill in. No results yet
— this stage is about whether the inputs feel right.

**Note:** if deployment turns out to need troubleshooting, this is where it surfaces. Slightly
later than ideal, which is the accepted cost of deferring it.

---

## Stage 5 — Results and the reveal

**Build:** headline figure, percentage, monthly equivalent, sorted category breakdown, the "why"
context line, break-even salary. Reveal animation respecting `prefers-reduced-motion`. Live
re-calculation as inputs are edited.

**You'll see:** the actual working product, for the first time.

---

## Stage 6 — Share links

**Build:** URL encoding and decoding, dataset version pinning, copy-link button and confirmation
state.

**You'll see:** generate a link, text it to yourself, open it on your phone — and confirm the
numbers are identical.

---

## Stage 7 — Share card and rich link previews

**Build:** the downloadable PNG share card, and the stateless function that renders link previews
for iMessage, Slack, WhatsApp and email.

**You'll see:** paste a link into a message to yourself and watch the result appear as a preview
card before you even send it.

---

## Stage 8 — Methodology, data browser, accessibility, mobile, performance

**Build:** the `/methodology` page documenting every source and assumption, and the `/data` page —
a searchable browser over every figure in the dataset, adapted from the Stage 2 review page
(PROJECT.md D26). Full keyboard and screen-reader pass. Phone layout. Performance measured — the
dataset split was investigated and rejected on the numbers (see PROJECT.md
section 10).

**You'll see:** the finished site, checked properly on your phone.

---

## Stage 9 — Refresh automation

**Build:** the quarterly GitHub Action that re-runs the data scripts and opens a pull request if
anything changed.

**You'll see:** a test run producing a real pull request, with a Vercel preview of the updated
site attached, so you know exactly what a future data update will look like.

---

## After the stages

- **Domain.** Register, add in Vercel, update one config value. Roughly ten minutes.
- **v2 backlog** (`PROJECT.md` §13): one-time moving costs with payback period; ranked multi-city
  comparison; optional live housing data feed.

---

## Setup checklist

| When | What | Who |
|---|---|---|
| Now | Nothing — Stage 0 needs no accounts or credentials | — |
| Stage 4 | Create public GitHub repo `packorstay` | Claude, via `gh` |
| Stage 4 | Authorise the Vercel connector (one click) | Owner |
| Stage 4 | `npm i -g vercel` so build logs are readable directly | Owner |
| After Stage 3 | Choose and register a domain | Owner |
