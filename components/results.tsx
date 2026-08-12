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
        className="text-[0.7rem] font-semibold uppercase tracking-[0.12em]"
        style={{ color: 'var(--muted)' }}
      >
        {better ? 'More in your pocket' : 'Less in your pocket'}
      </p>
      <p
        className="tnum mt-1 text-5xl font-bold leading-none tracking-tight sm:text-6xl"
        style={{ color: colour }}
      >
        {formatUSD(Math.abs(rolled))}
      </p>
      <p className="mt-2 text-base" style={{ color: 'var(--ink-soft)' }}>
        per year {better ? 'better off' : 'worse off'} &middot;{' '}
        <span className="tnum">{formatUSD(Math.abs(result.deltaMonthly))}</span> a month
      </p>
      <p className="mt-1 text-sm" style={{ color: 'var(--muted)' }}>
        That is{' '}
        <strong className="tnum" style={{ color: colour }}>
          {formatPercent(Math.abs(result.deltaPct))}
        </strong>{' '}
        {better ? 'more' : 'less'} spare cash than you have now
      </p>
    </div>
  );
}

function Why({ result }: { result: ComparisonResult }) {
  const to = metro(result.destination.metroId).shortName;
  const salaryChanged = result.destination.grossSalary !== result.origin.grossSalary;
  const cityCheaper = result.cityEffect >= 0;

  return (
    <div
      className="rounded border-l-2 py-1 pl-4"
      style={{ borderColor: 'var(--rule-strong)' }}
    >
      <p className="text-sm" style={{ color: 'var(--ink-soft)' }}>
        {to} is{' '}
        <strong style={{ color: cityCheaper ? 'var(--good)' : 'var(--bad)' }}>
          <span className="tnum">{formatUSD(Math.abs(result.cityEffect))}</span>{' '}
          {cityCheaper ? 'cheaper' : 'pricier'}
        </strong>{' '}
        to live in each year
        {salaryChanged ? (
          <>
            {' '}
            &mdash; but the pay change is worth{' '}
            <strong style={{ color: result.salaryEffect >= 0 ? 'var(--good)' : 'var(--bad)' }}>
              <span className="tnum">{formatUSD(result.salaryEffect, { signed: true })}</span>
            </strong>
            , which {Math.abs(result.salaryEffect) > Math.abs(result.cityEffect) ? 'outweighs it' : 'does not outweigh it'}.
          </>
        ) : (
          <> at the same salary.</>
        )}
      </p>
      {result.breakEvenSalary > 0 && (
        <p className="mt-2 text-sm" style={{ color: 'var(--ink-soft)' }}>
          You would need{' '}
          <strong className="tnum" style={{ color: 'var(--ink)' }}>
            {formatUSD(result.breakEvenSalary)}
          </strong>{' '}
          in {to} to end up exactly where you are today.
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
      className="grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1 py-2.5"
      style={{
        borderBottom: '1px solid var(--rule)',
        animation: animate ? `fade-rise 380ms ease-out ${index * 45}ms both` : undefined,
      }}
    >
      <span className="text-sm" style={{ color: 'var(--ink-soft)' }}>
        {row.label}
      </span>
      <span className="tnum text-sm font-semibold" style={{ color: colour }}>
        {formatUSD(row.delta, { signed: true })}
      </span>
      <span className="col-span-2 h-1 w-full overflow-hidden rounded-full" style={{ background: 'var(--surface-sunken)' }}>
        <span
          className="block h-full rounded-full"
          style={{
            width: `${width}%`,
            background: colour,
            transition: 'width 500ms ease-out',
          }}
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

  const rows: Array<{ key: string; label: string; a: number; b: number; c: number }> = [
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

  const th = 'px-3 py-2 text-right text-[0.65rem] font-semibold uppercase tracking-[0.08em]';
  const td = 'px-3 py-1.5 text-right tnum text-sm';

  return (
    <div className="overflow-x-auto rounded border" style={{ borderColor: 'var(--rule)' }}>
      <table className="w-full border-collapse">
        <thead>
          <tr style={{ borderBottom: '1px solid var(--rule-strong)' }}>
            <th className={`${th} text-left`} style={{ color: 'var(--muted)' }}>Line</th>
            <th className={th} style={{ color: 'var(--muted)' }}>
              {from}
              <span className="block font-normal normal-case tracking-normal">
                {formatUSD(result.origin.grossSalary)}
              </span>
            </th>
            {salaryChanged && (
              <th className={th} style={{ color: 'var(--muted)' }}>
                {to}
                <span className="block font-normal normal-case tracking-normal">
                  at {formatUSD(result.origin.grossSalary)}
                </span>
              </th>
            )}
            <th className={th} style={{ color: 'var(--muted)' }}>
              {to}
              <span className="block font-normal normal-case tracking-normal">
                {formatUSD(result.destination.grossSalary)}
              </span>
            </th>
            <th className={th} style={{ color: 'var(--muted)' }}>Change</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const change = r.c - r.a;
            const cityMoved = Math.abs(r.b - r.a) >= 1;
            const isFederal = FEDERAL_ROWS.has(r.key);
            return (
              <tr key={r.key} style={{ borderBottom: '1px solid var(--rule)' }}>
                <td className="px-3 py-1.5 text-left text-sm" style={{ color: 'var(--ink-soft)' }}>
                  {r.label}
                  {isFederal && !cityMoved && (
                    <span
                      className="ml-2 rounded border px-1 py-px text-[0.6rem] uppercase tracking-wider"
                      style={{ borderColor: 'var(--rule-strong)', color: 'var(--muted)' }}
                      title="Federal rules are identical in every state. This moves only because the salary moves."
                    >
                      same in both
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
            <td className="px-3 py-2 text-left text-sm font-bold" style={{ color: 'var(--ink)' }}>
              In your pocket
            </td>
            <td className={`${td} font-bold`} style={{ color: 'var(--ink)' }}>
              {formatUSD(result.origin.leftover)}
            </td>
            {salaryChanged && (
              <td className={`${td} font-bold`} style={{ color: 'var(--ink)' }}>
                {formatUSD(mid.leftover)}
              </td>
            )}
            <td className={`${td} font-bold`} style={{ color: 'var(--ink)' }}>
              {formatUSD(result.destination.leftover)}
            </td>
            <td
              className={`${td} font-bold`}
              style={{ color: result.delta >= 0 ? 'var(--good)' : 'var(--bad)' }}
            >
              {formatUSD(result.delta, { signed: true })}
            </td>
          </tr>
        </tbody>
      </table>
      {salaryChanged && (
        <p className="px-3 py-2.5 text-xs" style={{ color: 'var(--muted)' }}>
          The middle column is {to} <em>at your current salary</em>, so the gap from column one to
          column two is what the <strong>city</strong> did, and column two to column three is what
          the <strong>pay change</strong> did.
        </p>
      )}
    </div>
  );
}

export function Results({ result, animate }: { result: ComparisonResult; animate: boolean }) {
  const [showDetail, setShowDetail] = useState(false);
  const from = metro(result.origin.metroId).shortName;
  const to = metro(result.destination.metroId).shortName;
  const max = Math.max(...result.breakdown.map((b) => Math.abs(b.delta)), 1);

  return (
    <section
      aria-live="polite"
      className="rounded-lg border p-5 sm:p-7"
      style={{ borderColor: 'var(--rule-strong)', background: 'var(--surface)' }}
    >
      <style>{`@keyframes fade-rise { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }`}</style>

      <p className="mb-5 text-sm" style={{ color: 'var(--muted)' }}>
        <strong style={{ color: 'var(--ink)' }}>{from}</strong> &rarr;{' '}
        <strong style={{ color: 'var(--ink)' }}>{to}</strong>
      </p>

      <div className="grid gap-7 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-10">
        <div className="flex flex-col gap-5">
          <Headline result={result} animate={animate} />
          <Why result={result} />
        </div>

        <div>
          <h3
            className="mb-1 text-[0.7rem] font-semibold uppercase tracking-[0.09em]"
            style={{ color: 'var(--muted)' }}
          >
            Where it comes from
          </h3>
          <p className="mb-2 text-xs" style={{ color: 'var(--muted)' }}>
            Biggest effects first. Green means better off in {to}.
          </p>
          <ul className="list-none p-0">
            {result.breakdown.map((row, i) => (
              <BreakdownRow key={row.key} row={row} max={max} animate={animate} index={i} />
            ))}
          </ul>
        </div>
      </div>

      <div className="mt-6 border-t pt-4" style={{ borderColor: 'var(--rule)' }}>
        <button
          type="button"
          onClick={() => setShowDetail((v) => !v)}
          aria-expanded={showDetail}
          className="text-sm font-medium underline underline-offset-4"
          style={{ color: 'var(--accent)' }}
        >
          {showDetail ? 'Hide the full numbers' : 'Show the full numbers, line by line'}
        </button>
        {showDetail && (
          <div className="mt-4">
            <DetailTable result={result} />
          </div>
        )}
      </div>
    </section>
  );
}
