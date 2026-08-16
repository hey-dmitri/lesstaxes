'use client';

import Link from 'next/link';

import { useState } from 'react';

import {
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
import { ReportProblem } from '@/components/report-problem';
import { useCountUp } from '@/lib/use-count-up';

/** Rows whose value is fixed by federal law and cannot vary between cities. */
const FEDERAL_ROWS = new Set(['federalTax', 'fica']);

/**
 * The answer, naming the city it points at.
 *
 * This showed both words with the winner lit — "Pack or Stay", one green, one
 * grey — on the theory that seeing the question beside its answer would help.
 * It did the opposite: the reader met the site's name again where they were
 * expecting a result, and had to work out which of the two was being said.
 *
 * Then it showed one word, and that had a quieter version of the same problem:
 * "Pack" asks which city you were considering, at the moment you are looking
 * for the answer. It now says "Pack and move to Bangor" — the wording comes
 * from the engine, so this panel, the share card and the link preview cannot
 * describe the same move three different ways.
 */
function VerdictLine({ result }: { result: ComparisonResult }) {
  const v = verdict(result);
  const tooClose = v.kind === 'too-close';

  return (
    <div className="flex flex-col gap-1.5">
      <span
        className="font-display text-[2.1rem] font-bold leading-[1.05] tracking-[-0.035em] xl:text-[2.4rem]"
        style={{ color: tooClose ? 'var(--ink-soft)' : 'var(--accent)' }}
      >
        {v.headline}
      </span>
      <p className="text-[0.86rem] leading-snug" style={{ color: 'var(--ink-soft)' }}>
        {v.qualifier}
      </p>
    </div>
  );
}

/**
 * The evidence behind the verdict.
 *
 * THE BIG NUMBER IS A DIFFERENCE, NOT A BALANCE, and it was labelled as one
 * for months: "What's left over, Bangor vs Albany" over "+$3,224" reads as the
 * money you would have left in Bangor, which is wrong by an order of
 * magnitude. Each city panel already prints its own leftover figure. This is
 * the gap between them, and it now says which way the gap points before it
 * shows the figure.
 */
function Headline({ result, animate }: { result: ComparisonResult; animate: boolean }) {
  const better = result.delta >= 0;
  const rolled = useCountUp(result.delta, animate);
  const colour = better ? 'var(--good)' : 'var(--bad)';
  const from = cityName(result.origin.metroId, result.datasetVersion);
  const to = cityName(result.destination.metroId, result.datasetVersion);
  const breakEven = breakEvenNarrative(result);
  const salaryChanged = result.destination.grossSalary !== result.origin.grossSalary;
  const payGap = result.destination.grossSalary - result.origin.grossSalary;

  return (
    <div className="flex flex-col gap-3.5">
      <div
        className="flex flex-col gap-3"
        style={{ animation: animate ? 'pop 700ms ease-out both' : undefined }}
      >
        <VerdictLine result={result} />

        {/* The evidence for the verdict above: how much, and which way. */}
        <div
          className="flex flex-col gap-0.5 border-t pt-3"
          style={{ borderColor: 'var(--rule)' }}
        >
          <span
            className="font-display text-[0.7rem] font-medium uppercase tracking-[0.2em]"
            style={{ color: 'var(--muted)' }}
          >
            {better ? `You'd be better off in ${to}` : `You'd be worse off in ${to}`}
          </span>
          <span
            className="tnum text-[3.2rem] font-bold leading-[1.04] tracking-[-0.04em] xl:text-[3.6rem]"
            style={{ color: colour }}
          >
            {formatUSD(Math.abs(rolled))}
          </span>
          <span className="text-[1.05rem] font-medium" style={{ color: 'var(--ink)' }}>
            a year{' '}
            <span style={{ color: 'var(--muted)' }}>
              &middot; <span className="tnum">{formatUSD(Math.abs(result.deltaMonthly))}</span> a
              month
              {salaryChanged && (
                <>
                  , on <span className="tnum">{formatUSD(Math.abs(payGap))}</span>{' '}
                  {payGap < 0 ? 'less' : 'more'} pay
                </>
              )}
            </span>
          </span>
          {!better && (
            <span className="text-[0.84rem]" style={{ color: 'var(--ink-soft)' }}>
              That is what the move costs you a year. Staying in {from} keeps it.
            </span>
          )}
        </div>
      </div>

      {breakEven && (
        <div
          className="flex flex-col gap-0.5 rounded-xl border px-3.5 py-2.5"
          style={{ borderColor: 'var(--rule-strong)', background: 'var(--surface-raised)' }}
        >
          <span className="eyebrow" style={{ color: 'var(--muted)' }}>
            {breakEven.kind === 'wins-at-any-salary'
              ? `No salary needed in ${to}`
              : `Salary needed in ${to} to break even`}
          </span>
          <span className="tnum text-[1.35rem] font-semibold" style={{ color: 'var(--ink)' }}>
            {breakEven.kind === 'wins-at-any-salary' ? 'None' : formatUSD(breakEven.salary)}
          </span>
          <span className="text-[0.8rem]" style={{ color: 'var(--ink-soft)' }}>
            <BreakEvenLine breakEven={breakEven} to={to} />
          </span>
        </div>
      )}
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
  const gap = <strong className="tnum" style={{ color: breakEven.kind === 'has-headroom' ? 'var(--good)' : 'var(--bad)' }}>{formatUSD(Math.abs(breakEven.gap))}</strong>;
  return breakEven.kind === 'has-headroom' ? (
    <>The offer clears it by {gap}.</>
  ) : (
    <>You&rsquo;d need {gap} more than {breakEvenReference(breakEven)}.</>
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
        <strong style={{ color: 'var(--ink-soft)' }}>The table reads one way round:</strong> every
        line is {to} compared with {from}. &ldquo;Less&rdquo; means you would pay less of that
        thing there, &ldquo;more&rdquo; means you would pay more, and green means the change leaves
        you better off. The lines add up to the difference at the top.
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

/**
 * Every line of the difference: the pay, each tax, and living costs.
 *
 * THREE THINGS THIS USED TO DO AND NO LONGER DOES.
 *
 * It sorted by size, so the tax lines arrived in a different order for every
 * comparison and a reader could not tell whether a tax was missing or simply
 * equal in both cities. Every tax now has a fixed row and prints $0 when the
 * two cities agree, which is itself an answer: somebody looked.
 *
 * It hid the living detail inside one "Food, phone, healthcare, other" row.
 * That row is the largest thing on the page for most comparisons and it named
 * four categories out of eight. It is now a total that opens.
 *
 * And it repeated the headline as a total at the bottom, under a third name
 * for the same number. The figure above is that figure.
 */
function Gap({ result }: { result: ComparisonResult }) {
  const [showLiving, setShowLiving] = useState(false);
  const from = cityName(result.origin.metroId, result.datasetVersion);
  const to = cityName(result.destination.metroId, result.datasetVersion);
  // Federal tax differing between two cities looks like a bug unless the page
  // says why, and the page says everywhere else that federal rules are the same.
  const federalNote = federalMovedReason(result);

  const row = 'grid grid-cols-[1fr_5.5rem_6rem] items-baseline gap-3';

  /*
   * The rows come from the engine, not from this file. Built here they would
   * be a hand-written list of categories sitting beside a computed total —
   * which is how the state disability contribution and owner upkeep both ended
   * up charged in the answer and missing from the explanation. A test pins
   * that these three parts add up to the headline.
   */
  const rows = differenceRows(result);
  /*
   * A LIVING ROW APPEARS WHERE THE HOUSEHOLD IS CHARGED SOMETHING, in either
   * city — not where the two cities differ.
   *
   * The two rules land differently and both are wanted. A tax that is
   * identical in both cities keeps its row and prints $0, because "is local
   * income tax the same in both?" is a question this list should answer. A
   * renter's property tax is not the same question: it is zero everywhere,
   * always, and a row for it is a category the household was never charged.
   *
   * Sales tax falls out here too — every current release folds it into the
   * spending figures, so both sides are zero. Old shared links carry a real
   * number and get the row back.
   */
  const livingRows = rows.living.filter((r) => r.origin !== 0 || r.destination !== 0);
  const taxTotal = rows.taxes.reduce((sum, r) => sum + r.delta, 0);
  const livingTotal = livingRows.reduce((sum, r) => sum + r.delta, 0);
  const salary = rows.salary.delta;

  /**
   * One cell: "$4,055 less", "$1,200 more", or "the same".
   *
   * "+$4,055" in green against the word TAXES was read as "you will pay more
   * tax" by the first person who saw it. It meant the opposite — you keep
   * $4,055 more because the tax is lower — and no colour fixes a sentence that
   * says the wrong thing. The word now carries the direction and the colour
   * agrees with it.
   */
  const cell = (
    value: number,
    kind: 'cost' | 'pay',
    { bold = false, small = false }: { bold?: boolean; small?: boolean } = {},
  ) => {
    const change = changeInWords(value, kind);
    return (
      <span
        className={`text-right ${small ? 'text-[0.8rem]' : 'text-[0.85rem]'} ${bold ? 'font-semibold' : ''}`}
        style={{
          color: change.unchanged
            ? 'var(--muted)'
            : change.better
              ? 'var(--good)'
              : 'var(--bad)',
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
  };

  /**
   * The month column is quieter and carries no word.
   *
   * Both columns are the same fact at two scales, so saying "less" twice on
   * every line reads as a stutter. The year column is the emphasised one and
   * the one the word belongs to; the month figure sits beside it as a
   * conversion, in grey, and takes its direction from its neighbour.
   */
  const monthly = (value: number) => (
    <span className="tnum text-right text-[0.8rem]" style={{ color: 'var(--muted)' }}>
      {Math.abs(value) < 12 ? '—' : formatUSD(Math.abs(value) / 12)}
    </span>
  );

  const detailRow = (r: DifferenceRow) => (
    <div key={r.key} className={`${row} py-[3px]`}>
      <span className="pl-3 text-[0.82rem]" style={{ color: 'var(--ink-soft)' }}>
        {r.label}
      </span>
      {monthly(r.delta)}
      {cell(r.delta, 'cost', { small: true })}
    </div>
  );

  return (
    <div className="flex flex-col gap-1">
      {/*
        THE HEADING NAMES THE DIRECTION. Without it every row is a number with
        no stated point of view, and a reader supplies their own — which is how
        "+$4,055" beside the word TAXES came to mean "more tax" to the first
        person who read it.
      */}
      <div className={`${row} border-b pb-1`} style={{ borderColor: 'var(--rule-strong)' }}>
        <span className="eyebrow">In {to}, compared with {from}</span>
        <span className="eyebrow text-right">A month</span>
        <span className="eyebrow text-right">A year</span>
      </div>

      {/* Pay first, because every tax below it is a share of this line. */}
      <div className={`${row} pt-2`}>
        <span className="text-[0.82rem] font-semibold" style={{ color: 'var(--ink)' }}>
          Salary
        </span>
        {monthly(salary)}
        {cell(salary, 'pay', { bold: true })}
      </div>

      <div className={`${row} pt-2`}>
        <span className="text-[0.82rem] font-semibold" style={{ color: 'var(--ink)' }}>
          Taxes on your pay
        </span>
        {monthly(taxTotal)}
        {cell(taxTotal, 'cost', { bold: true })}
      </div>
      {rows.taxes.map(detailRow)}
      {federalNote && (
        <p className="mt-1 pl-3 text-[0.74rem] leading-snug" style={{ color: 'var(--muted)' }}>
          {federalNote}
        </p>
      )}

      <div className={`${row} pt-2`}>
        <button
          type="button"
          onClick={() => setShowLiving((open) => !open)}
          aria-expanded={showLiving}
          className="flex items-baseline gap-1.5 text-left text-[0.82rem] font-semibold"
          style={{ color: 'var(--ink)' }}
        >
          <span aria-hidden="true" style={{ color: 'var(--accent)' }}>
            {showLiving ? '−' : '+'}
          </span>
          Living expenses
          <span className="text-[0.74rem] font-normal" style={{ color: 'var(--accent)' }}>
            {showLiving ? 'hide' : "what's in this"}
          </span>
        </button>
        {monthly(livingTotal)}
        {cell(livingTotal, 'cost', { bold: true })}
      </div>
      {showLiving && livingRows.map(detailRow)}
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
      className="rounded border px-3 py-2"
      style={{ borderColor: 'var(--rule-strong)', background: 'var(--surface-sunken)' }}
    >
      <p className="text-[0.78rem] leading-snug" style={{ color: 'var(--ink-soft)' }}>
        <strong>
          {short.length === 2
            ? 'Both cities come out short.'
            : `${metro(short[0].metroId).shortName} comes out short.`}
        </strong>{' '}
        At this salary and household size, typical local costs come to more than a year&rsquo;s pay
        &mdash; by {named.join(' and ')}. The comparison above is still like for like, but there is
        no spare cash left to take a percentage of.
      </p>
      <p className="mt-1 text-[0.78rem] leading-snug" style={{ color: 'var(--muted)' }}>
        This uses the local median rent and what US households at your income actually spend. If
        your rent, cars or salary are different, change them &mdash; every field is editable.
      </p>
    </div>
  );
}

function Why({ result }: { result: ComparisonResult }) {
  const to = metro(result.destination.metroId).shortName;
  const why = whyNarrative(result);
  const breakEven = breakEvenNarrative(result);

  return (
    <div className="flex flex-col gap-1">
      <p className="text-[0.8rem] leading-snug" style={{ color: 'var(--ink-soft)' }}>
        {to} is{' '}
        <strong style={{ color: why.cityCheaper ? 'var(--good)' : 'var(--bad)' }}>
          <span className="tnum">{formatUSD(why.cityAmount)}</span>{' '}
          {why.cityCheaper ? 'cheaper' : 'pricier'}
        </strong>{' '}
        a year to live in
        {/*
          The clause comes from the engine so that this panel, the share card
          and the link preview cannot drift apart. It distinguishes effects that
          OPPOSE each other from ones that COMPOUND — saying a pay cut into a
          pricier city "does not outweigh" the expense told the reader the two
          partly cancelled, when in fact they add up.
        */}
        {whyClause(why)}
      </p>
      {breakEven && (
        <p className="text-[0.8rem] leading-snug" style={{ color: 'var(--ink-soft)' }}>
          {breakEven.kind === 'wins-at-any-salary' && (
            <>
              There is <strong style={{ color: 'var(--good)' }}>no salary you&rsquo;d need</strong>{' '}
              in {to} &mdash; it comes out ahead even on no income at all.
            </>
          )}
          {breakEven.kind === 'level' && (
            <>
              You&rsquo;d break even in {to} at{' '}
              <strong style={{ color: 'var(--ink)' }}>
                about {breakEvenReference(breakEven)}
              </strong>
              .
            </>
          )}
          {breakEven.kind === 'needs-more' && (
            <>
              You&rsquo;d need{' '}
              <strong className="tnum" style={{ color: 'var(--ink)' }}>
                {formatUSD(breakEven.salary)}
              </strong>{' '}
              in {to} to break even &mdash;{' '}
              <strong className="tnum" style={{ color: 'var(--bad)' }}>
                {formatUSD(Math.abs(breakEven.gap))}
              </strong>{' '}
              more than {breakEvenReference(breakEven)}.
            </>
          )}
          {breakEven.kind === 'has-headroom' && (
            <>
              You&rsquo;d break even in {to} at{' '}
              <strong className="tnum" style={{ color: 'var(--ink)' }}>
                {formatUSD(breakEven.salary)}
              </strong>{' '}
              &mdash;{' '}
              <strong className="tnum" style={{ color: 'var(--good)' }}>
                {formatUSD(Math.abs(breakEven.gap))}
              </strong>{' '}
              less than {breakEvenReference(breakEven)}, so there is room to spare.
            </>
          )}
        </p>
      )}
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
    <div className="flex flex-col gap-4 px-5 py-4 lg:flex-1">
      {/* Scoped to the figures; wrapping the panel re-read everything on every keystroke. */}
      <div aria-live="polite">
        <Headline result={result} animate={animate} />
      </div>

      <Shortfall result={result} />

      <Gap result={result} />

      <div className="flex flex-col gap-1.5">
        <Disclosure summary="What these numbers mean">
          <WhatThisMeans result={result} />
        </Disclosure>
        <Disclosure summary="Why it works out this way">
          <Why result={result} />
        </Disclosure>
        <Disclosure summary="The full numbers, line by line">
          <DetailTable result={result} />
        </Disclosure>
      </div>

      <div className="mt-auto flex flex-col gap-2 border-t pt-3" style={{ borderColor: 'var(--rule)' }}>
        {share}
        <ReportProblem
          subject={`${metro(result.origin.metroId).shortName} to ${metro(result.destination.metroId).shortName}`}
          datasetVersion={result.datasetVersion}
        />
      </div>
    </div>
  );
}
