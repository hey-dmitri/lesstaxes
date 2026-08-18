'use client';

import Link from 'next/link';

import {
  biggestReason,
  breakEvenNarrative,
  changeInWords,
  cityName,
  differenceRows,
  federalMovedReason,
  breakEvenReference,
  formatPercent,
  formatUSD,
  housingLabel,
  metro,
  percentIsMeaningful,
  shortfalls,
  utilitiesAreSplitOut,
  verdict,
  whyClause,
  whyNarrative,
  type ComparisonResult,
  type DifferenceRow,
} from '@/engine';
import { InfoDot } from '@/components/fields';
import { ReportProblem } from '@/components/report-problem';
import { useCountUp } from '@/lib/use-count-up';

/** Rows whose value is fixed by federal law and cannot vary between cities. */
const FEDERAL_ROWS = new Set(['federalTax', 'fica']);

/**
 * A mark for each line of the breakdown.
 *
 * The Turn 5 design puts a small glyph in a chip at the start of every row, and
 * it earns its width: the two tables are read down rather than across, and a
 * shape the eye can catch is faster than re-reading fourteen labels to find the
 * rent. Plain typographic characters, not an icon set — the site fetches
 * nothing from anywhere, and a font that lacks one of these falls back to
 * something else legible rather than to a blank box.
 */
const GLYPHS: Record<string, string> = {
  federalTax: '★',
  stateTax: '§',
  localTax: '¶',
  fica: '◎',
  statePayroll: '⊘',
  housing: '⌂',
  propertyTax: '▣',
  maintenance: '⌗',
  transport: '⬭',
  food: '◍',
  phone: '↯',
  healthcare: '+',
  other: '•',
  salesTax: '%',
};

function glyphFor(row: DifferenceRow): string {
  // The salary row is the only one whose mark says which way it moved, because
  // it is the only line the reader chose rather than the country choosing it.
  if (row.key === 'salary') return row.delta >= 0 ? '↑' : '↓';
  return GLYPHS[row.key] ?? '•';
}

/**
 * The answer: how much, which way, and why.
 *
 * Artboard 5b. The figure is the loudest thing on the page and everything
 * around it exists to stop it being read as something it is not — the eyebrow
 * says which city it points at, the line under it converts it to a month and
 * names the pay change it survived, and the sentence beside it says what did
 * the work.
 */
function Verdict({ result, animate }: { result: ComparisonResult; animate: boolean }) {
  const v = verdict(result);
  const better = result.delta >= 0;
  const tooClose = v.kind === 'too-close';
  const rolled = useCountUp(result.delta, animate);
  const colour = tooClose ? 'var(--ink-soft)' : better ? 'var(--good)' : 'var(--bad)';

  const from = cityName(result.origin.metroId, result.datasetVersion);
  const to = cityName(result.destination.metroId, result.datasetVersion);
  const why = whyNarrative(result);
  const breakEven = breakEvenNarrative(result);
  const reason = biggestReason(result);
  const salaryChanged = result.destination.grossSalary !== result.origin.grossSalary;
  const payGap = result.destination.grossSalary - result.origin.grossSalary;

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <div
        className="flex flex-col gap-1"
        style={{ animation: animate ? 'pop 700ms ease-out both' : undefined }}
      >
        {/*
          The verdict in words, quietly, above the figure. It used to be the
          loud line with the money underneath it, and that put the site's own
          catchphrase where the reader was looking for a number. The wording
          still comes from the engine, so this panel, the share card and the
          link preview cannot describe the same move three different ways.
        */}
        <span
          className="font-display text-[0.7rem] font-medium uppercase tracking-[0.2em]"
          style={{ color: 'var(--muted)' }}
        >
          The verdict &middot; {v.headline}
        </span>
        <span
          className="tnum text-[3.4rem] font-bold leading-[1.02] tracking-[-0.045em] xl:text-[4.4rem]"
          style={{ color: colour }}
        >
          {formatUSD(Math.abs(rolled))}
        </span>
        <span className="text-[1.15rem] font-medium" style={{ color: 'var(--ink)' }}>
          a year{' '}
          <span style={{ color: 'var(--muted)' }}>
            &middot; <span className="tnum">{formatUSD(Math.abs(result.deltaMonthly))}</span> a month
            {salaryChanged && (
              <>
                , on <span className="tnum">{formatUSD(Math.abs(payGap))}</span>{' '}
                {payGap < 0 ? 'less' : 'more'} pay
              </>
            )}
          </span>
        </span>
        <p className="max-w-[52ch] text-[1rem] leading-snug" style={{ color: 'var(--ink-soft)' }}>
          {to} is{' '}
          <strong style={{ color: why.cityCheaper ? 'var(--good)' : 'var(--bad)' }}>
            <span className="tnum">{formatUSD(why.cityAmount)}</span>{' '}
            {why.cityCheaper ? 'cheaper' : 'pricier'}
          </strong>{' '}
          a year to live in
          {/*
            The clause comes from the engine so that this panel, the share card
            and the link preview cannot drift apart. It distinguishes effects
            that OPPOSE each other from ones that COMPOUND — saying a pay cut
            into a pricier city "does not outweigh" the expense told the reader
            the two partly cancelled, when in fact they add up.
          */}
          {whyClause(why)}
          {!better && !tooClose && ` Staying in ${from} keeps the difference.`}
        </p>
        {/* Never advice. The engine writes this line for the same reason. */}
        <p className="text-[0.8rem]" style={{ color: 'var(--muted)' }}>
          {v.qualifier}
        </p>
      </div>

      <div className="flex flex-col gap-2.5">
        {breakEven && (
          <StatCard
            label={
              breakEven.kind === 'wins-at-any-salary'
                ? `No salary needed in ${to}`
                : `Salary needed in ${to} to break even`
            }
            figure={breakEven.kind === 'wins-at-any-salary' ? 'None' : formatUSD(breakEven.salary)}
            highlight={breakEven.kind === 'has-headroom'}
          >
            <BreakEvenLine breakEven={breakEven} to={to} />
          </StatCard>
        )}
        {/*
          The single line doing most of the work, named. It has existed in the
          engine since the redesign began and nothing on the page showed it —
          so the reader got a total and a fourteen-row table, with no answer to
          "what actually did this?" short of reading all fourteen.
        */}
        {reason && (
          <StatCard
            label="Biggest single reason"
            figure={formatUSD(reason.delta, { signed: true })}
            figureColour={reason.delta >= 0 ? 'var(--good)' : 'var(--bad)'}
          >
            {reason.sentence}
          </StatCard>
        )}
      </div>
    </div>
  );
}

/** One of the two small cards beside the headline figure. */
function StatCard({
  label,
  figure,
  figureColour,
  highlight,
  children,
}: {
  label: string;
  figure: string;
  figureColour?: string;
  highlight?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className="flex flex-col gap-0.5 rounded-xl border px-4 py-3"
      style={{
        borderColor: highlight ? 'var(--picked-rule)' : 'var(--rule-strong)',
        background: highlight ? 'var(--picked)' : 'var(--surface-raised)',
      }}
    >
      <span className="eyebrow" style={{ color: 'var(--muted)' }}>
        {label}
      </span>
      <span className="tnum text-[1.35rem] font-semibold" style={{ color: figureColour ?? 'var(--ink)' }}>
        {figure}
      </span>
      <span className="text-[0.82rem] leading-snug" style={{ color: 'var(--ink-soft)' }}>
        {children}
      </span>
    </div>
  );
}

/** The break-even sentence, reused between the card and the disclosure. */
function BreakEvenLine({
  breakEven,
  to,
}: {
  breakEven: NonNullable<ReturnType<typeof breakEvenNarrative>>;
  to: string;
}) {
  if (breakEven.kind === 'wins-at-any-salary') {
    return <>{to} comes out ahead even on no income at all.</>;
  }
  if (breakEven.kind === 'level') {
    return <>About {breakEvenReference(breakEven)}.</>;
  }
  const gap = (
    <strong
      className="tnum"
      style={{ color: breakEven.kind === 'has-headroom' ? 'var(--good)' : 'var(--bad)' }}
    >
      {formatUSD(Math.abs(breakEven.gap))}
    </strong>
  );
  return breakEven.kind === 'has-headroom' ? (
    <>The offer clears it by {gap}.</>
  ) : (
    <>
      You&rsquo;d need {gap} more than {breakEvenReference(breakEven)}.
    </>
  );
}

/**
 * The two cities as one subtraction each: pay in, costs out, what survives.
 *
 * These three figures used to sit at the bottom of the two form columns on the
 * setup screen, where they were an answer printed above the button that asks
 * for one. On the answer screen they are what the headline difference is the
 * difference OF, which is the only place they explain anything.
 */
function CitySummaries({ result }: { result: ComparisonResult }) {
  /*
   * The green card is the verdict's card, not the larger number's. Tying it to
   * the sign of the difference lit Austin up under a headline reading "too
   * close to call" — the page saying one thing in words and the opposite in
   * colour, over a gap it had just called too small to trust.
   */
  const v = verdict(result);
  const cities = [
    { city: result.origin, highlight: v.kind === 'stay' },
    { city: result.destination, highlight: v.kind === 'pack' },
  ];

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {cities.map(({ city, highlight }) => {
        const living = city.housing.total + city.living.total + city.salesTax;
        return (
          <div
            key={city.metroId}
            className="flex flex-col gap-2 rounded-xl border px-5 py-4"
            style={{
              borderColor: highlight ? 'var(--picked-rule)' : 'var(--rule-strong)',
              background: highlight ? 'var(--picked)' : 'var(--surface-raised)',
            }}
          >
            <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
              <span
                aria-hidden="true"
                className="inline-block h-2 w-2 shrink-0 rounded-[2px]"
                style={{ background: highlight ? 'var(--accent)' : 'var(--muted-strong)' }}
              />
              <h3
                className="font-display text-[1.1rem] font-bold tracking-[-0.02em]"
                style={{ color: 'var(--ink)' }}
              >
                {cityName(city.metroId, result.datasetVersion)}
              </h3>
              <span className="tnum text-[0.82rem]" style={{ color: 'var(--muted)' }}>
                {formatUSD(city.grossSalary)}
              </span>
            </div>

            <div className="flex items-baseline justify-between gap-3">
              <span className="text-[0.88rem]" style={{ color: 'var(--muted-strong)' }}>
                Take-home after tax
              </span>
              <span className="tnum text-[1.15rem] font-semibold" style={{ color: 'var(--ink)' }}>
                {formatUSD(city.takeHome)}
              </span>
            </div>
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-[0.88rem]" style={{ color: 'var(--muted-strong)' }}>
                Typical living costs
              </span>
              <span className="tnum text-[1rem] font-semibold" style={{ color: 'var(--bad)' }}>
                &minus;{formatUSD(living)}
              </span>
            </div>
            <div
              className="flex items-baseline justify-between gap-3 border-t pt-2.5"
              style={{ borderColor: highlight ? 'var(--picked-rule)' : 'var(--rule)' }}
            >
              <span className="text-[0.92rem] font-semibold" style={{ color: 'var(--ink)' }}>
                What&rsquo;s left over, a year
              </span>
              <span
                className="tnum text-[1.6rem] font-bold leading-none"
                style={{ color: city.leftover < 0 ? 'var(--bad)' : highlight ? 'var(--accent)' : 'var(--ink)' }}
              >
                {formatUSD(city.leftover)}
              </span>
            </div>
            {/*
              This said "Living costs" over a single lump figure, which reads as
              a statement about the reader: here is what you spend. Only the
              housing half is theirs — they typed it. The rest is a national
              spending basket re-priced for this metro and scaled to a household
              of this size and income.
            */}
            <span className="text-[0.75rem] leading-snug" style={{ color: 'var(--faint)' }}>
              Your housing, plus what a household your size usually spends here. Not your own
              budget.
            </span>
          </div>
        );
      })}
    </div>
  );
}

/** The percentage, and what the figures above actually count. */
function WhatThisMeans({ result }: { result: ComparisonResult }) {
  const better = result.delta >= 0;
  const from = metro(result.origin.metroId).shortName.replace(/,.*$/, '');
  const to = metro(result.destination.metroId).shortName.replace(/,.*$/, '');

  return (
    <div className="flex flex-col gap-1.5 text-[0.84rem] leading-snug">
      <p style={{ color: 'var(--muted-strong)' }}>
        <strong style={{ color: 'var(--ink-soft)' }}>Both tables read one way round:</strong> every
        line is {to} compared with {from}. &ldquo;Less&rdquo; means you would pay less of that thing
        there, &ldquo;more&rdquo; means you would pay more, and green means the change leaves you
        better off. The two tables together add up to the difference at the top.
      </p>
      {percentIsMeaningful(result) && (
        <p style={{ color: 'var(--ink-soft)' }}>
          That is{' '}
          <strong className="tnum" style={{ color: better ? 'var(--good)' : 'var(--bad)' }}>
            {formatPercent(Math.abs(result.deltaPct))}
          </strong>{' '}
          {better ? 'more' : 'less'} than what you have left over in {from} today &mdash; a
          percentage of the {formatUSD(result.origin.leftover)}, not of your salary.
        </p>
      )}
      <p style={{ color: 'var(--muted-strong)' }}>
        <strong style={{ color: 'var(--ink-soft)' }}>Take-home</strong> is a year&rsquo;s pay less
        federal income tax, Social Security and Medicare, any state and local income tax, and the
        state disability or paid-leave contribution where there is one.{' '}
        <strong style={{ color: 'var(--ink-soft)' }}>What&rsquo;s left over</strong> is what
        survives after rent or mortgage, property tax, upkeep and insurance for an owner, cars,
        food, utilities and healthcare. There is no sales tax line: the spending figures already
        include the tax paid at the till. {to} and {from} are worked out the same way and then
        compared.{' '}
        <Link href="/methodology" className="underline underline-offset-2" style={{ color: 'var(--accent)' }}>
          How it works
        </Link>
      </p>
    </div>
  );
}

/**
 * A collapsed section. Native <details> — keyboard operable, announces its own
 * expanded state, works without JavaScript.
 */
function Disclosure({
  summary,
  children,
}: {
  summary: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <details className="group border-t pt-2.5" style={{ borderColor: 'var(--rule)' }}>
      <summary
        className="cursor-pointer list-none text-[0.82rem] font-medium marker:content-none"
        style={{ color: 'var(--accent)' }}
      >
        <span aria-hidden="true" className="inline-block w-4">
          <span className="group-open:hidden">+</span>
          <span className="hidden group-open:inline">&minus;</span>
        </span>
        {summary}
      </summary>
      <div className="pt-2.5">{children}</div>
    </details>
  );
}

const ROW = 'grid grid-cols-[1.4rem_minmax(0,1fr)_4rem_6.5rem] items-baseline gap-2.5';

/**
 * One cell: "$4,055 less", "$1,200 more", or "the same".
 *
 * "+$4,055" in green against the word TAXES was read as "you will pay more
 * tax" by the first person who saw it. It meant the opposite — you keep $4,055
 * more because the tax is lower — and no colour fixes a sentence that says the
 * wrong thing. The word carries the direction and the colour agrees with it.
 *
 * The Turn 5 design prints a bare signed figure here. It splits the rows into
 * two tables, each headed with the direction, which is a real improvement and
 * is kept — but a heading four rows up is not the same as the word on the line,
 * and the word is what stopped somebody reading this backwards.
 */
function cell(
  value: number,
  kind: 'cost' | 'pay',
  { bold = false }: { bold?: boolean } = {},
) {
  const change = changeInWords(value, kind);
  return (
    <span
      className={`text-right text-[0.85rem] ${bold ? 'font-semibold' : ''}`}
      style={{
        color: change.unchanged ? 'var(--muted)' : change.better ? 'var(--good)' : 'var(--bad)',
      }}
    >
      {change.unchanged ? (
        'the same'
      ) : (
        <>
          <span className="tnum">{formatUSD(change.amount)}</span>{' '}
          <span className="text-[0.92em] font-normal">{change.word}</span>
        </>
      )}
    </span>
  );
}

/**
 * The month column is quieter and carries no word.
 *
 * Both columns are the same fact at two scales, so saying "less" twice on every
 * line reads as a stutter. The year column is the emphasised one and the one
 * the word belongs to; the month figure sits beside it as a conversion, in
 * grey, and takes its direction from its neighbour.
 */
function monthly(value: number) {
  return (
    <span className="tnum text-right text-[0.78rem]" style={{ color: 'var(--muted)' }}>
      {Math.abs(value) < 12 ? '—' : formatUSD(Math.abs(value) / 12)}
    </span>
  );
}

/** One of the two breakdown tables. */
function Table({
  heading,
  total,
  rows,
  totalKind,
}: {
  heading: React.ReactNode;
  total: number;
  rows: Array<{ row: DifferenceRow; note?: React.ReactNode }>;
  /*
   * Only the total in the header uses this; each row works out its own from
   * its key. The pay table's total is 'mixed' because it adds a salary change
   * to a tax change, and neither "less" nor "more" is true of the pair.
   */
  totalKind: 'cost' | 'pay' | 'mixed';
}) {
  const change = changeInWords(total, totalKind);
  return (
    <div className="flex flex-col">
      <div
        className="flex items-baseline justify-between gap-3 border-b pb-1.5"
        style={{ borderColor: 'var(--rule-strong)' }}
      >
        <span className="eyebrow">{heading}</span>
        <span
          className="tnum text-[0.82rem] font-semibold"
          style={{
            color: change.unchanged ? 'var(--muted)' : change.better ? 'var(--good)' : 'var(--bad)',
          }}
        >
          {formatUSD(total, { signed: true })}
        </span>
      </div>
      {rows.map(({ row, note }) => (
        <div
          key={row.key}
          className={`${ROW} border-b py-[5px]`}
          style={{ borderColor: 'var(--rule)' }}
        >
          <span
            aria-hidden="true"
            className="flex h-[1.4rem] w-[1.4rem] items-center justify-center self-center rounded-md text-[0.74rem]"
            style={{
              background: 'var(--surface-raised)',
              color: row.delta >= 0 ? 'var(--good)' : 'var(--bad)',
            }}
          >
            {glyphFor(row)}
          </span>
          <span
            className="flex items-baseline gap-1.5 text-[0.85rem]"
            style={{ color: 'var(--ink-soft)' }}
          >
            {row.label}
            {note}
          </span>
          {monthly(row.delta)}
          {cell(row.delta, row.key === 'salary' ? 'pay' : 'cost')}
        </div>
      ))}
    </div>
  );
}

/**
 * Every line of the difference, in two tables: the pay and its taxes on one
 * side, everything the household spends on the other.
 *
 * THREE THINGS THIS USED TO DO AND NO LONGER DOES.
 *
 * It sorted by size, so the tax lines arrived in a different order for every
 * comparison and a reader could not tell whether a tax was missing or simply
 * equal in both cities. Every tax now has a fixed row and prints $0 when the
 * two cities agree, which is itself an answer: somebody looked.
 *
 * It hid the living detail inside one "Food, phone, healthcare, other" row —
 * the largest thing on the page for most comparisons, naming four categories
 * out of eight. Then it hid the same detail behind a disclosure. The Turn 5
 * design gives living costs a column of their own, so all of it is simply
 * there.
 *
 * And it repeated the headline as a total at the bottom under a third name for
 * the same number. The line at the bottom now says what it is: the two tables
 * added together, which is the figure at the top of the page.
 */
function Breakdown({ result }: { result: ComparisonResult }) {
  const from = cityName(result.origin.metroId, result.datasetVersion);
  const to = cityName(result.destination.metroId, result.datasetVersion);
  // Federal tax differing between two cities looks like a bug unless the page
  // says why, and the page says everywhere else that federal rules are the same.
  const federalNote = federalMovedReason(result);

  /*
   * The rows come from the engine, not from this file. Built here they would be
   * a hand-written list of categories sitting beside a computed total — which
   * is how the state disability contribution and owner upkeep both ended up
   * charged in the answer and missing from the explanation. A test pins that
   * these parts add up to the headline.
   */
  const rows = differenceRows(result);
  /*
   * A LIVING ROW APPEARS WHERE THE HOUSEHOLD IS CHARGED SOMETHING, in either
   * city — not where the two cities differ.
   *
   * The two rules land differently and both are wanted. A tax that is identical
   * in both cities keeps its row and prints $0, because "is local income tax
   * the same in both?" is a question this list should answer. A renter's
   * property tax is not the same question: it is zero everywhere, always, and a
   * row for it is a category the household was never charged.
   */
  const livingRows = rows.living.filter((r) => r.origin !== 0 || r.destination !== 0);
  const payTotal = rows.salary.delta + rows.taxes.reduce((sum, r) => sum + r.delta, 0);
  const livingTotal = livingRows.reduce((sum, r) => sum + r.delta, 0);

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-x-8 gap-y-6 lg:grid-cols-2">
        <Table
          heading={
            <>
              In {to} &middot; your pay and the tax on it
            </>
          }
          total={payTotal}
          totalKind="mixed"
          rows={[
            { row: rows.salary },
            ...rows.taxes.map((row) => ({
              row,
              /*
                The note sits ON the line it explains and opens OVER the table.
                Loose underneath it read as a caption for the whole thing, when
                it is about one row — why federal tax moved at all, on a site
                that says everywhere else that federal rules are the same in
                every state.
              */
              note:
                row.key === 'federalTax' && federalNote ? (
                  <InfoDot label="Why does federal tax change between two cities?">
                    {federalNote}
                  </InfoDot>
                ) : undefined,
            })),
          ]}
        />
        <Table
          heading={<>In {to} &middot; what the household spends</>}
          total={livingTotal}
          totalKind="cost"
          rows={livingRows.map((row) => ({
            row,
            /*
              "Everything else" is the only label on the page that is a shrug,
              and it sits over a figure that runs to five figures a year. What
              is inside it comes from the engine, beside the sum, so the words
              and the arithmetic cannot drift.
            */
            note: row.note ? (
              <InfoDot label={`What is in ${row.label.toLowerCase()}?`}>{row.note}</InfoDot>
            ) : undefined,
          }))}
        />
      </div>

      <div
        className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 border-t pt-3"
        style={{ borderColor: 'var(--rule-strong)' }}
      >
        <span className="font-display text-[1.05rem] font-bold" style={{ color: 'var(--ink)' }}>
          In your pocket, the difference
        </span>
        <div className="flex items-baseline gap-5">
          <span className="tnum text-[0.9rem] font-semibold" style={{ color: 'var(--ink-soft)' }}>
            {formatUSD(Math.abs(result.deltaMonthly))} a month
          </span>
          <span
            className="tnum text-[1.35rem] font-bold"
            style={{ color: result.delta >= 0 ? 'var(--good)' : 'var(--bad)' }}
          >
            {formatUSD(result.delta, { signed: true })} a year
          </span>
        </div>
      </div>
      <p className="text-[0.76rem] leading-snug" style={{ color: 'var(--muted)' }}>
        Both tables are {to} against {from}, and every line is what the move does to your pocket.
        Add the two totals together and you get the figure at the top.
      </p>
    </div>
  );
}

/**
 * Shown when modelled costs run past the salary in either city.
 *
 * At the local median rent and average household spending this is not an edge
 * case — a family of four on a middling salary comes out short in most metros.
 * The comparison survives it, but the word "leftover" does not, and neither
 * does the percentage, so both are explained rather than quietly dropped.
 */
function Shortfall({ result }: { result: ComparisonResult }) {
  const short = shortfalls(result);
  if (short.length === 0) return null;

  const named = short.map((s) => `${formatUSD(s.shortBy)} in ${metro(s.metroId).shortName}`);

  return (
    <div
      className="rounded-lg border px-4 py-3"
      style={{ borderColor: 'var(--rule-strong)', background: 'var(--surface-sunken)' }}
    >
      <p className="text-[0.82rem] leading-snug" style={{ color: 'var(--ink-soft)' }}>
        <strong>
          {short.length === 2
            ? 'Both cities come out short.'
            : `${metro(short[0].metroId).shortName} comes out short.`}
        </strong>{' '}
        At this salary and household size, typical local costs come to more than a year&rsquo;s pay
        &mdash; by {named.join(' and ')}. The comparison above is still like for like, but there is
        no spare cash left to take a percentage of.
      </p>
      <p className="mt-1 text-[0.8rem] leading-snug" style={{ color: 'var(--muted)' }}>
        This uses the local median rent and what US households at your income actually spend. If
        your rent, cars or salary are different, change them &mdash; every field is editable behind
        &ldquo;Change anything&rdquo;.
      </p>
    </div>
  );
}

function DetailTable({ result }: { result: ComparisonResult }) {
  const from = metro(result.origin.metroId).shortName;
  const to = metro(result.destination.metroId).shortName;
  const salaryChanged = result.destination.grossSalary !== result.origin.grossSalary;
  const mid = result.destinationAtOriginSalary;

  const rows = [
    { key: 'salary', label: 'Gross salary', a: result.origin.grossSalary, b: mid.grossSalary, c: result.destination.grossSalary },
    { key: 'federalTax', label: 'Federal income tax', a: -result.origin.tax.federal, b: -mid.tax.federal, c: -result.destination.tax.federal },
    { key: 'stateTax', label: 'State income tax', a: -result.origin.tax.state, b: -mid.tax.state, c: -result.destination.tax.state },
    { key: 'localTax', label: 'Local income tax', a: -result.origin.tax.local, b: -mid.tax.local, c: -result.destination.tax.local },
    { key: 'fica', label: 'Social Security & Medicare', a: -result.origin.tax.fica, b: -mid.tax.fica, c: -result.destination.tax.fica },
    /*
     * STATE DISABILITY AND PAID LEAVE, which this table left out while the
     * engine charged it. The rows summed to $1,560 more than the "in your
     * pocket" figure printed underneath them for a Californian on $120,000 —
     * a table headed "the full numbers, line by line" that did not add up to
     * the answer it was explaining.
     *
     * Eleven states charge it. The breakdown and the share card both carried
     * it already; only this table did not.
     */
    {
      key: 'statePayroll',
      label: 'State disability & paid leave',
      a: -result.origin.tax.statePayroll,
      b: -mid.tax.statePayroll,
      c: -result.destination.tax.statePayroll,
    },
    // Shelter plus the utility bill, matching the label and the breakdown. It
    // is inside the rent for a renter and charged separately for an owner, so
    // adding the field is right in both cases: it is zero for renters.
    {
      key: 'housing',
      label: housingLabel(result.origin.housing.tenure, result.destination.housing.tenure),
      a: -(result.origin.housing.shelter + result.origin.housing.utilities),
      b: -(mid.housing.shelter + mid.housing.utilities),
      c: -(result.destination.housing.shelter + result.destination.housing.utilities),
    },
    { key: 'propertyTax', label: 'Property tax', a: -result.origin.housing.propertyTax, b: -mid.housing.propertyTax, c: -result.destination.housing.propertyTax },
    // Owners only, and worth four figures a year, so it gets its own line
    // rather than disappearing inside the mortgage figure.
    {
      key: 'maintenance',
      label: 'Upkeep, repairs & insurance',
      a: -(result.origin.housing.maintenance + result.origin.housing.insurance),
      b: -(mid.housing.maintenance + mid.housing.insurance),
      c: -(result.destination.housing.maintenance + result.destination.housing.insurance),
    },
    { key: 'transport', label: 'Cars & transport', a: -result.origin.living.transport, b: -mid.living.transport, c: -result.destination.living.transport },
    { key: 'food', label: 'Food', a: -result.origin.living.food, b: -mid.living.food, c: -result.destination.living.food },
    /*
     * Phone, not "Utilities". Gas, electricity, water and heating now sit in
     * the housing line, where the rent figure was already paying for them.
     *
     * BUT NOT ON AN OLD LINK. Releases before 2026.9 have no split, so this
     * field is the whole category — $2,661 a year in Chicago against $1,014
     * after — and a fixed "Phone" label put the entire energy bill under the
     * wrong name, beside a housing row promising utilities it did not contain.
     * Share links replay their own release, so the number is right and only
     * the word was wrong.
     */
    {
      key: 'phone',
      label: utilitiesAreSplitOut(result.datasetVersion) ? 'Phone' : 'Utilities & phone',
      a: -result.origin.living.utilities,
      b: -mid.living.utilities,
      c: -result.destination.living.utilities,
    },
    { key: 'healthcare', label: 'Healthcare', a: -result.origin.living.healthcare, b: -mid.living.healthcare, c: -result.destination.living.healthcare },
    { key: 'other', label: 'Everything else', a: -result.origin.living.other, b: -mid.living.other, c: -result.destination.living.other },
    { key: 'salesTax', label: 'Sales tax', a: -result.origin.salesTax, b: -mid.salesTax, c: -result.destination.salesTax },
  ].filter((r) => r.a !== 0 || r.b !== 0 || r.c !== 0);

  const th = 'px-2 py-1.5 text-right text-[0.7rem] font-semibold uppercase tracking-[0.06em]';
  const td = 'px-2 py-1 text-right tnum text-[0.8rem]';

  return (
    <div className="overflow-x-auto rounded border" style={{ borderColor: 'var(--rule)' }}>
      <table className="w-full border-collapse">
        <thead>
          <tr style={{ borderBottom: '1px solid var(--rule-strong)' }}>
            <th className={`${th} text-left`} style={{ color: 'var(--muted)' }}>Line</th>
            <th className={th} style={{ color: 'var(--muted)' }}>{from}</th>
            {salaryChanged && (
              <th className={th} style={{ color: 'var(--muted)' }}>
                {to}
                <span className="block font-normal normal-case tracking-normal">at current pay</span>
              </th>
            )}
            <th className={th} style={{ color: 'var(--muted)' }}>{to}</th>
            <th className={th} style={{ color: 'var(--muted)' }}>Change</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const change = r.c - r.a;
            const cityMoved = Math.abs(r.b - r.a) >= 1;
            return (
              <tr key={r.key} style={{ borderBottom: '1px solid var(--rule)' }}>
                <td className="px-2 py-1 text-left text-[0.8rem]" style={{ color: 'var(--ink-soft)' }}>
                  {r.label}
                  {FEDERAL_ROWS.has(r.key) && !cityMoved && (
                    <span
                      className="ml-1.5 rounded border px-1 text-[0.68rem] uppercase tracking-wider"
                      style={{ borderColor: 'var(--rule-strong)', color: 'var(--muted)' }}
                      title="Federal rules are identical in every state. This moves only because the salary moves."
                    >
                      same
                    </span>
                  )}
                </td>
                <td className={td} style={{ color: 'var(--ink)' }}>{formatUSD(r.a)}</td>
                {salaryChanged && (
                  <td className={td} style={{ color: cityMoved ? 'var(--ink)' : 'var(--muted)' }}>
                    {formatUSD(r.b)}
                  </td>
                )}
                <td className={td} style={{ color: 'var(--ink)' }}>{formatUSD(r.c)}</td>
                <td className={td} style={{ color: change >= 0 ? 'var(--good)' : 'var(--bad)' }}>
                  {formatUSD(change, { signed: true })}
                </td>
              </tr>
            );
          })}
          <tr style={{ borderTop: '2px solid var(--rule-strong)' }}>
            <td className="px-2 py-1.5 text-left text-[0.8rem] font-bold" style={{ color: 'var(--ink)' }}>
              In your pocket
            </td>
            <td className={`${td} font-bold`} style={{ color: 'var(--ink)' }}>{formatUSD(result.origin.leftover)}</td>
            {salaryChanged && (
              <td className={`${td} font-bold`} style={{ color: 'var(--ink)' }}>{formatUSD(mid.leftover)}</td>
            )}
            <td className={`${td} font-bold`} style={{ color: 'var(--ink)' }}>{formatUSD(result.destination.leftover)}</td>
            <td className={`${td} font-bold`} style={{ color: result.delta >= 0 ? 'var(--good)' : 'var(--bad)' }}>
              {formatUSD(result.delta, { signed: true })}
            </td>
          </tr>
        </tbody>
      </table>
      {salaryChanged && (
        <p className="px-2 py-1.5 text-[0.76rem] leading-snug" style={{ color: 'var(--muted)' }}>
          The middle column is {to} <em>at your current salary</em> — so column one to two is what
          the city did, and two to three is what the pay change did.
        </p>
      )}
    </div>
  );
}

export function Results({
  result,
  animate,
  share,
}: {
  result: ComparisonResult;
  animate: boolean;
  share?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-6">
      {/* Scoped to the figures; wrapping the panel re-read everything on every keystroke. */}
      <div aria-live="polite">
        <Verdict result={result} animate={animate} />
      </div>

      <CitySummaries result={result} />

      <Shortfall result={result} />

      <Breakdown result={result} />

      <div className="flex flex-col gap-1.5">
        <Disclosure summary="What these numbers mean">
          <WhatThisMeans result={result} />
        </Disclosure>
        <Disclosure summary="The full numbers, line by line">
          <DetailTable result={result} />
        </Disclosure>
      </div>

      <div className="flex flex-col gap-2 border-t pt-3" style={{ borderColor: 'var(--rule)' }}>
        {share}
        <ReportProblem
          subject={`${metro(result.origin.metroId).shortName} to ${metro(result.destination.metroId).shortName}`}
          datasetVersion={result.datasetVersion}
        />
      </div>
    </div>
  );
}
