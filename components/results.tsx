'use client';

import Link from 'next/link';

import {
  biggestReason,
  breakEvenNarrative,
  federalMovedReason,
  breakEvenReference,
  formatPercent,
  formatUSD,
  metro,
  percentIsMeaningful,
  shortfalls,
  verdict,
  whyClause,
  whyNarrative,
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
/**
 * The verdict.
 *
 * The two city columns already end in their own leftover figures, so this panel
 * no longer repeats them — it states the difference, then immediately answers
 * the two questions that follow it: what salary would make this a wash, and
 * what single line is doing most of the work.
 */
/**
 * The answer in a word, using the site's own two words.
 *
 * Both are always shown and the winning one is lit, so the reader sees the
 * question and its answer in the same glance rather than a lone word they have
 * to place. When the two cities are too close to separate, neither lights up —
 * that is a real answer as well, and dressing it as a narrow win would be
 * claiming a precision these figures do not have.
 */
function VerdictLine({ result }: { result: ComparisonResult }) {
  const v = verdict(result);
  const word = 'font-display text-[2.1rem] font-bold leading-none tracking-[-0.03em]';
  const lit = { color: 'var(--accent)' };
  const dim = { color: 'var(--muted)' };

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline gap-2.5">
        <span className={word} style={v.kind === 'pack' ? lit : dim}>
          Pack
        </span>
        <span className="text-[0.95rem]" style={{ color: 'var(--muted)' }}>
          or
        </span>
        <span className={word} style={v.kind === 'stay' ? lit : dim}>
          Stay
        </span>
        {v.kind === 'too-close' && (
          <span
            className="rounded-full px-2.5 py-0.5 text-[0.75rem] font-semibold"
            style={{ background: 'var(--surface-sunken)', color: 'var(--ink-soft)' }}
          >
            too close to call
          </span>
        )}
      </div>
      <p className="text-[0.86rem] leading-snug" style={{ color: 'var(--ink-soft)' }}>
        {v.qualifier}
      </p>
    </div>
  );
}

function Headline({ result, animate }: { result: ComparisonResult; animate: boolean }) {
  const better = result.delta >= 0;
  const rolled = useCountUp(result.delta, animate);
  const colour = better ? 'var(--good)' : 'var(--bad)';
  const from = metro(result.origin.metroId).shortName.replace(/,.*$/, '');
  const to = metro(result.destination.metroId).shortName.replace(/,.*$/, '');
  const breakEven = breakEvenNarrative(result);
  const biggest = biggestReason(result);
  const salaryChanged = result.destination.grossSalary !== result.origin.grossSalary;
  const payGap = result.destination.grossSalary - result.origin.grossSalary;

  return (
    <div className="flex flex-col gap-3.5">
      <div
        className="flex flex-col gap-3"
        style={{ animation: animate ? 'pop 700ms ease-out both' : undefined }}
      >
        <VerdictLine result={result} />

        {/* The evidence for the word above: how much, and over what. */}
        <div
          className="flex flex-col gap-0.5 border-t pt-3"
          style={{ borderColor: 'var(--rule)' }}
        >
          <span
            className="font-display text-[0.7rem] font-medium uppercase tracking-[0.2em]"
            style={{ color: 'var(--muted)' }}
          >
            What&rsquo;s left over, {to} vs {from}
          </span>
          <span
            className="tnum text-[3.2rem] font-bold leading-[1.04] tracking-[-0.04em] xl:text-[3.6rem]"
            style={{ color: colour }}
          >
            {formatUSD(rolled, { signed: true })}
          </span>
          <span className="text-[1.05rem] font-medium" style={{ color: 'var(--ink)' }}>
            a year {better ? 'more to spend or save' : 'less to spend or save'}{' '}
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
        </div>
      </div>

      <div className="flex flex-wrap gap-2.5">
        {breakEven && (
          <div
            className="flex min-w-56 flex-1 flex-col gap-0.5 rounded-xl border px-3.5 py-2.5"
            style={{ borderColor: 'var(--rule-strong)', background: 'var(--surface-raised)' }}
          >
            <span className="eyebrow" style={{ color: 'var(--muted)' }}>
              {breakEven.kind === 'wins-at-any-salary'
                ? `No salary needed in ${to}`
                : `Break-even in ${to}`}
            </span>
            <span className="tnum text-[1.35rem] font-semibold" style={{ color: 'var(--ink)' }}>
              {breakEven.kind === 'wins-at-any-salary' ? 'None' : formatUSD(breakEven.salary)}
            </span>
            <span className="text-[0.8rem]" style={{ color: 'var(--ink-soft)' }}>
              <BreakEvenLine breakEven={breakEven} to={to} />
            </span>
          </div>
        )}

        {biggest && (
          <div
            className="flex min-w-56 flex-1 flex-col gap-0.5 rounded-xl border px-3.5 py-2.5"
            style={{ borderColor: 'var(--rule-strong)', background: 'var(--surface-raised)' }}
          >
            <span className="eyebrow" style={{ color: 'var(--muted)' }}>
              Biggest single reason
            </span>
            <span
              className="tnum text-[1.35rem] font-semibold"
              style={{ color: biggest.delta >= 0 ? 'var(--good)' : 'var(--bad)' }}
            >
              {formatUSD(biggest.delta, { signed: true })}
            </span>
            <span className="text-[0.8rem]" style={{ color: 'var(--ink-soft)' }}>
              {biggest.sentence}
            </span>
          </div>
        )}
      </div>
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
        federal income tax, Social Security and Medicare, and any state and local income tax.{' '}
        <strong style={{ color: 'var(--ink-soft)' }}>What&rsquo;s left over</strong> is what
        survives after rent or mortgage, property tax, cars, food, utilities, healthcare and sales
        tax as well. {to} and {from} are worked out the same way and then compared.{' '}
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
 * "What makes up the gap", split into pay-and-tax against living costs.
 *
 * One list sorted by size forced the reader to hold two different kinds of news
 * in their head at once — a pay change and a cost change are not the same sort
 * of fact. Each half totals separately and the two totals reconcile to the
 * headline at the bottom.
 */
function Gap({ result }: { result: ComparisonResult }) {
  // Federal tax differing between two cities looks like a bug unless the page
  // says why, and the page says everywhere else that federal rules are the same.
  const federalNote = federalMovedReason(result);
  const groups = [
    { key: 'payAndTax' as const, label: 'Pay and tax' },
    { key: 'living' as const, label: 'Living costs' },
  ];
  const row = 'grid grid-cols-[1fr_5.5rem_6rem] items-baseline gap-3';
  const money = (v: number) => (
    <span
      className="tnum text-right text-[0.85rem] font-semibold"
      style={{ color: v >= 0 ? 'var(--good)' : 'var(--bad)' }}
    >
      {formatUSD(v, { signed: true })}
    </span>
  );

  return (
    <div className="flex flex-col gap-1">
      <div className={`${row} border-b pb-1`} style={{ borderColor: 'var(--rule-strong)' }}>
        <span className="eyebrow">What makes up the gap</span>
        <span className="eyebrow text-right">A month</span>
        <span className="eyebrow text-right">A year</span>
      </div>

      {groups.map(({ key, label }) => {
        const rows = result.breakdown.filter((b) => b.group === key);
        if (rows.length === 0) return null;
        const total = rows.reduce((sum, b) => sum + b.delta, 0);
        return (
          <div key={key} className="flex flex-col">
            <div className={`${row} pt-2`}>
              <span className="text-[0.82rem] font-semibold" style={{ color: 'var(--ink)' }}>
                {label}
              </span>
              <span />
              {money(total)}
            </div>
            {rows.map((b) => (
              <div key={b.key} className={`${row} py-[3px]`}>
                <span className="pl-3 text-[0.82rem]" style={{ color: 'var(--ink-soft)' }}>
                  {b.label}
                </span>
                <span className="tnum text-right text-[0.8rem]" style={{ color: 'var(--muted)' }}>
                  {formatUSD(b.delta / 12, { signed: true })}
                </span>
                <span
                  className="tnum text-right text-[0.8rem]"
                  style={{ color: b.delta >= 0 ? 'var(--good)' : 'var(--bad)' }}
                >
                  {formatUSD(b.delta, { signed: true })}
                </span>
              </div>
            ))}
            {key === 'payAndTax' && federalNote && (
              <p
                className="mt-1 pl-3 text-[0.74rem] leading-snug"
                style={{ color: 'var(--muted)' }}
              >
                {federalNote}
              </p>
            )}
          </div>
        );
      })}

      <div
        className={`${row} mt-1 border-t pt-2`}
        style={{ borderColor: 'var(--rule-strong)' }}
      >
        <span className="text-[0.85rem] font-bold" style={{ color: 'var(--ink)' }}>
          {result.delta >= 0 ? 'More left over' : 'Less left over'}
        </span>
        <span
          className="tnum text-right text-[0.85rem] font-bold"
          style={{ color: result.delta >= 0 ? 'var(--good)' : 'var(--bad)' }}
        >
          {formatUSD(result.deltaMonthly, { signed: true })}
        </span>
        <span
          className="tnum text-right text-[0.85rem] font-bold"
          style={{ color: result.delta >= 0 ? 'var(--good)' : 'var(--bad)' }}
        >
          {formatUSD(result.delta, { signed: true })}
        </span>
      </div>
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
