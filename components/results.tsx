'use client';

import { useState } from 'react';

import {
  formatPercent,
  formatUSD,
  metro,
  type CategoryDelta,
  type ComparisonResult,
} from '@/engine';
import { useCountUp } from '@/lib/use-count-up';

/** Rows whose value is fixed by federal law and cannot vary between cities. */
const FEDERAL_ROWS = new Set(['federalTax', 'fica']);

function Headline({ result, animate }: { result: ComparisonResult; animate: boolean }) {
  const better = result.delta >= 0;
  const rolled = useCountUp(result.delta, animate);
  const colour = better ? 'var(--good)' : 'var(--bad)';

  return (
    <div>
      <p
        className="text-[0.65rem] font-semibold uppercase tracking-[0.12em]"
        style={{ color: 'var(--muted)' }}
      >
        {better ? 'More in your pocket' : 'Less in your pocket'}
      </p>
      <p
        className="tnum mt-0.5 text-4xl font-bold leading-none tracking-tight xl:text-5xl"
        style={{ color: colour }}
      >
        {formatUSD(Math.abs(rolled))}
      </p>
      <p className="mt-1.5 text-sm" style={{ color: 'var(--ink-soft)' }}>
        a year {better ? 'better off' : 'worse off'} &middot;{' '}
        <span className="tnum">{formatUSD(Math.abs(result.deltaMonthly))}</span> a month &middot;{' '}
        <span className="tnum" style={{ color: colour }}>
          {formatPercent(Math.abs(result.deltaPct))}
        </span>{' '}
        {better ? 'more' : 'less'} spare cash
      </p>
    </div>
  );
}

function Why({ result }: { result: ComparisonResult }) {
  const to = metro(result.destination.metroId).shortName;
  const salaryChanged = result.destination.grossSalary !== result.origin.grossSalary;
  const cityCheaper = result.cityEffect >= 0;

  return (
    <div className="border-l-2 pl-3" style={{ borderColor: 'var(--rule-strong)' }}>
      <p className="text-[0.8rem] leading-snug" style={{ color: 'var(--ink-soft)' }}>
        {to} is{' '}
        <strong style={{ color: cityCheaper ? 'var(--good)' : 'var(--bad)' }}>
          <span className="tnum">{formatUSD(Math.abs(result.cityEffect))}</span>{' '}
          {cityCheaper ? 'cheaper' : 'pricier'}
        </strong>{' '}
        a year to live in
        {salaryChanged ? (
          <>
            , but the pay change is worth{' '}
            <strong style={{ color: result.salaryEffect >= 0 ? 'var(--good)' : 'var(--bad)' }}>
              <span className="tnum">{formatUSD(result.salaryEffect, { signed: true })}</span>
            </strong>
            {Math.abs(result.salaryEffect) > Math.abs(result.cityEffect)
              ? ' — which outweighs it.'
              : ' — not enough to outweigh it.'}
          </>
        ) : (
          <> at the same salary.</>
        )}
      </p>
      {result.breakEvenSalary > 0 && (
        <p className="mt-1 text-[0.8rem] leading-snug" style={{ color: 'var(--ink-soft)' }}>
          You&rsquo;d need{' '}
          <strong className="tnum" style={{ color: 'var(--ink)' }}>
            {formatUSD(result.breakEvenSalary)}
          </strong>{' '}
          in {to} to break even.
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

  const th = 'px-2 py-1.5 text-right text-[0.6rem] font-semibold uppercase tracking-[0.06em]';
  const td = 'px-2 py-1 text-right tnum text-[0.75rem]';

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
                <td className="px-2 py-1 text-left text-[0.75rem]" style={{ color: 'var(--ink-soft)' }}>
                  {r.label}
                  {FEDERAL_ROWS.has(r.key) && !cityMoved && (
                    <span
                      className="ml-1.5 rounded border px-1 text-[0.55rem] uppercase tracking-wider"
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
            <td className="px-2 py-1.5 text-left text-[0.75rem] font-bold" style={{ color: 'var(--ink)' }}>
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
        <p className="px-2 py-1.5 text-[0.68rem] leading-snug" style={{ color: 'var(--muted)' }}>
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
  const [showDetail, setShowDetail] = useState(false);
  const to = metro(result.destination.metroId).shortName;
  const max = Math.max(...result.breakdown.map((b) => Math.abs(b.delta)), 1);

  return (
    <div aria-live="polite" className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 py-3.5">
      <style>{`@keyframes fade-rise { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }`}</style>

      <Headline result={result} animate={animate} />
      <Why result={result} />

      <div>
        <h3
          className="mb-1 text-[0.65rem] font-semibold uppercase tracking-[0.09em]"
          style={{ color: 'var(--muted)' }}
        >
          Where it comes from
        </h3>
        <ul className="list-none p-0">
          {result.breakdown.map((row, i) => (
            <BreakdownRow key={row.key} row={row} max={max} animate={animate} index={i} />
          ))}
        </ul>
        <p className="mt-1.5 text-[0.68rem] leading-snug" style={{ color: 'var(--muted)' }}>
          Biggest effects first. Green means better off in {to}. Anything identical in both cities
          is left out.
        </p>
      </div>

      <div className="mt-auto flex flex-col gap-2.5 border-t pt-2.5" style={{ borderColor: 'var(--rule)' }}>
        {share}
        <button
          type="button"
          onClick={() => setShowDetail((v) => !v)}
          aria-expanded={showDetail}
          className="text-[0.8rem] font-medium underline underline-offset-4"
          style={{ color: 'var(--accent)' }}
        >
          {showDetail ? 'Hide the full numbers' : 'Show the full numbers, line by line'}
        </button>
        {showDetail && (
          <div className="mt-2.5">
            <DetailTable result={result} />
          </div>
        )}
      </div>
    </div>
  );
}
