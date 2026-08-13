'use client';

import Link from 'next/link';

import {
  breakEvenNarrative,
  breakEvenReference,
  formatPercent,
  formatUSD,
  metro,
  percentIsMeaningful,
  shortfalls,
  whyClause,
  whyNarrative,
  type CategoryDelta,
  type ComparisonResult,
} from '@/engine';
import { ReportProblem } from '@/components/report-problem';
import { useCountUp } from '@/lib/use-count-up';

/** Rows whose value is fixed by federal law and cannot vary between cities. */
const FEDERAL_ROWS = new Set(['federalTax', 'fica']);

/**
 * The answer, shown as the subtraction it actually is.
 *
 * Leading with the difference alone meant the reader met "$21,077" and
 * "45.8% more spare cash" before anything had told them what was being
 * measured — and "spare cash" is not a phrase anyone can price. Showing both
 * bottom lines first makes the term define itself: two numbers, and the gap
 * between them. Everything that explains or decomposes it is one click away
 * rather than competing with it.
 */
function Headline({ result, animate }: { result: ComparisonResult; animate: boolean }) {
  const better = result.delta >= 0;
  const rolled = useCountUp(result.delta, animate);
  const colour = better ? 'var(--good)' : 'var(--bad)';
  const from = metro(result.origin.metroId).shortName;
  const to = metro(result.destination.metroId).shortName;

  const cityRow = 'flex items-baseline justify-between gap-3 py-1';

  return (
    <div>
      {/*
        The reveal is the thing people screenshot and share, and it never said
        which way round the move was. The panel heading is generic and the city
        names only appeared inside the reasoning, so the headline figure stood
        alone with no subject. PROJECT.md §8 specified this line first.
      */}
      <p className="mb-1 text-[0.78rem] font-medium" style={{ color: 'var(--ink-soft)' }}>
        {from} <span style={{ color: 'var(--muted)' }}>&rarr;</span> {to}
      </p>
      <h3
        className="mb-1.5 text-[0.72rem] font-semibold uppercase tracking-[0.12em]"
        style={{ color: 'var(--muted)' }}
      >
        In your pocket, a year
      </h3>

      <div className={cityRow}>
        <span className="text-sm" style={{ color: 'var(--ink-soft)' }}>
          {from}
        </span>
        <span className="tnum text-lg font-semibold" style={{ color: 'var(--ink)' }}>
          {formatUSD(result.origin.leftover)}
        </span>
      </div>
      <div className={cityRow} style={{ borderBottom: '1px solid var(--rule-strong)' }}>
        <span className="text-sm" style={{ color: 'var(--ink-soft)' }}>
          {to}
        </span>
        <span className="tnum text-lg font-semibold" style={{ color: 'var(--ink)' }}>
          {formatUSD(result.destination.leftover)}
        </span>
      </div>

      <div className="mt-2 flex items-baseline justify-between gap-3">
        <span className="text-sm font-medium" style={{ color: 'var(--ink-soft)' }}>
          {better ? 'More in your pocket' : 'Less in your pocket'}
        </span>
        <span
          className="tnum text-3xl font-bold leading-none tracking-tight xl:text-4xl"
          style={{ color: colour }}
        >
          {formatUSD(Math.abs(rolled))}
        </span>
      </div>
      <p className="mt-1 text-right text-[0.8rem]" style={{ color: 'var(--muted)' }}>
        a year &middot; <span className="tnum">{formatUSD(Math.abs(result.deltaMonthly))}</span> a
        month
      </p>
    </div>
  );
}

/**
 * A collapsed section. Native <details> rather than a hand-rolled toggle: it
 * is keyboard operable, announces its own expanded state, and survives with
 * JavaScript disabled, none of which comes free from a div and a click handler.
 */
function Disclosure({
  summary,
  children,
  defaultOpen = false,
}: {
  summary: React.ReactNode;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  return (
    <details open={defaultOpen} className="group border-t pt-2" style={{ borderColor: 'var(--rule)' }}>
      <summary
        className="cursor-pointer list-none text-[0.8rem] font-medium marker:content-none"
        style={{ color: 'var(--accent)' }}
      >
        <span aria-hidden="true" className="inline-block w-3.5">
          <span className="group-open:hidden">+</span>
          <span className="hidden group-open:inline">&minus;</span>
        </span>
        {summary}
      </summary>
      <div className="pt-2">{children}</div>
    </details>
  );
}

/** The percentage and what the figure above actually counts. */
function WhatThisMeans({ result }: { result: ComparisonResult }) {
  const better = result.delta >= 0;
  const from = metro(result.origin.metroId).shortName;
  const to = metro(result.destination.metroId).shortName;

  return (
    <div className="flex flex-col gap-1.5">
      {percentIsMeaningful(result) && (
        <p className="text-[0.8rem] leading-snug" style={{ color: 'var(--ink-soft)' }}>
          That is{' '}
          <strong className="tnum" style={{ color: better ? 'var(--good)' : 'var(--bad)' }}>
            {formatPercent(Math.abs(result.deltaPct))}
          </strong>{' '}
          {better ? 'more' : 'less'} than what you have left over in {from} today &mdash; a
          percentage of the {formatUSD(result.origin.leftover)}, not of your salary.
        </p>
      )}
      <p className="text-[0.8rem] leading-snug" style={{ color: 'var(--muted)' }}>
        <strong style={{ color: 'var(--ink-soft)' }}>In your pocket</strong> is what is left of a
        year&rsquo;s pay after income tax, Social Security and Medicare, rent or mortgage, property
        tax, cars, food, utilities, healthcare and sales tax. It is not take-home pay &mdash;
        everything you spend has already come out of it. {to} and {from} are worked out the same
        way and then compared.{' '}
        <Link
          href="/methodology"
          className="underline underline-offset-2"
          style={{ color: 'var(--accent)' }}
        >
          How it works
        </Link>
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

function BreakdownRow({
  row,
  max,
  animate,
  index,
}: {
  row: CategoryDelta;
  max: number;
  animate: boolean;
  index: number;
}) {
  const better = row.delta >= 0;
  const width = max > 0 ? (Math.abs(row.delta) / max) * 100 : 0;
  const colour = better ? 'var(--good)' : 'var(--bad)';

  return (
    <li
      className="py-1.5"
      style={{
        borderBottom: '1px solid var(--rule)',
        animation: animate ? `fade-rise 380ms ease-out ${index * 45}ms both` : undefined,
      }}
    >
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[0.8rem]" style={{ color: 'var(--ink-soft)' }}>
          {row.label}
        </span>
        <span className="tnum text-[0.8rem] font-semibold" style={{ color: colour }}>
          {formatUSD(row.delta, { signed: true })}
        </span>
      </div>
      <span
        className="mt-1 block h-[3px] w-full overflow-hidden rounded-full"
        style={{ background: 'var(--surface-sunken)' }}
      >
        <span
          className="block h-full rounded-full"
          style={{ width: `${width}%`, background: colour, transition: 'width 500ms ease-out' }}
        />
      </span>
    </li>
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
    { key: 'housing', label: 'Rent or mortgage', a: -result.origin.housing.shelter, b: -mid.housing.shelter, c: -result.destination.housing.shelter },
    { key: 'propertyTax', label: 'Property tax', a: -result.origin.housing.propertyTax, b: -mid.housing.propertyTax, c: -result.destination.housing.propertyTax },
    { key: 'transport', label: 'Cars & transport', a: -result.origin.living.transport, b: -mid.living.transport, c: -result.destination.living.transport },
    { key: 'food', label: 'Food', a: -result.origin.living.food, b: -mid.living.food, c: -result.destination.living.food },
    { key: 'utilities', label: 'Utilities', a: -result.origin.living.utilities, b: -mid.living.utilities, c: -result.destination.living.utilities },
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
  const to = metro(result.destination.metroId).shortName;
  const max = Math.max(...result.breakdown.map((b) => Math.abs(b.delta)), 1);
  const biggest = result.breakdown[0];

  return (
    <div className="flex flex-col gap-3 px-4 py-3.5 lg:min-h-0 lg:flex-1 lg:overflow-y-auto">
      <style>{`@keyframes fade-rise { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }`}</style>

      {/*
        Scoped to the figures alone. Wrapping the whole panel meant a screen
        reader re-read the breakdown, the share bar and the detail table on
        every keystroke in a salary field.
      */}
      <div aria-live="polite">
        <Headline result={result} animate={animate} />
      </div>

      {/* A warning, not a detail — never collapsed. */}
      <Shortfall result={result} />

      <div className="flex flex-col gap-2">
        <Disclosure summary="What this means">
          <WhatThisMeans result={result} />
        </Disclosure>

        <Disclosure summary="Why it works out this way">
          <Why result={result} />
        </Disclosure>

        <Disclosure
          summary={
            biggest
              ? `Where it comes from — ${biggest.label.toLowerCase()} is the biggest single effect`
              : 'Where it comes from'
          }
        >
          <ul className="list-none p-0">
            {result.breakdown.map((row, i) => (
              <BreakdownRow key={row.key} row={row} max={max} animate={animate} index={i} />
            ))}
          </ul>
          <p className="mt-1.5 text-[0.76rem] leading-snug" style={{ color: 'var(--muted)' }}>
            Biggest effects first. Green means better off in {to}. Anything identical in both
            cities is left out.
          </p>
        </Disclosure>

        <Disclosure summary="The full numbers, line by line">
          <DetailTable result={result} />
        </Disclosure>
      </div>

      <div
        className="mt-auto flex flex-col gap-2 border-t pt-2.5"
        style={{ borderColor: 'var(--rule)' }}
      >
        {share}
        <ReportProblem
          subject={`${metro(result.origin.metroId).shortName} to ${to}`}
          datasetVersion={result.datasetVersion}
        />
      </div>
    </div>
  );
}
