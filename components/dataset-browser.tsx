'use client';

import { useDeferredValue, useMemo, useState } from 'react';

import { formatUSD } from '@/engine';
import { DATASET_ROWS, type DatasetRow } from '@/lib/dataset-rows';

const pct = (v: number, dp = 1) => `${(v * 100).toFixed(dp)}%`;

function Row({ row }: { row: DatasetRow }) {
  const td = 'px-2.5 py-1.5 text-right tnum text-[0.78rem] whitespace-nowrap';
  return (
    <tr style={{ borderBottom: '1px solid var(--rule)' }}>
      <th
        scope="row"
        className="px-2.5 py-1.5 text-left text-[0.78rem] font-normal"
        style={{ color: 'var(--ink)' }}
      >
        {row.label}
        {row.isRural && (
          <span className="ml-1.5 text-[0.65rem]" style={{ color: 'var(--muted)' }}>
            rural
          </span>
        )}
      </th>
      <td className={td} style={{ color: 'var(--ink)' }}>{formatUSD(row.rent)}</td>
      <td className={td} style={{ color: 'var(--ink)' }}>{formatUSD(row.homePrice)}</td>
      <td className={td} style={{ color: 'var(--ink)' }}>{pct(row.propertyTaxRate, 2)}</td>
      <td className={td} style={{ color: 'var(--ink)' }}>{row.vehiclesPerAdult.toFixed(2)}</td>
      <td className={td} style={{ color: 'var(--ink)' }}>{(row.parityAll * 100).toFixed(0)}</td>
      <td className={td} style={{ color: 'var(--ink)' }}>{(row.parityHousing * 100).toFixed(0)}</td>
      <td className={td} style={{ color: 'var(--ink)' }}>{(row.parityGoods * 100).toFixed(0)}</td>
      <td className={td} style={{ color: 'var(--ink)' }}>{(row.parityUtilities * 100).toFixed(0)}</td>
      <td className={td} style={{ color: row.hasStateIncomeTax ? 'var(--ink)' : 'var(--muted)' }}>
        {row.hasStateIncomeTax ? 'yes' : 'none'}
      </td>
      <td className={td} style={{ color: 'var(--ink)' }}>{pct(row.salesTaxRate, 2)}</td>
      <td
        className={td}
        style={{ color: row.groceryTreatment === 'exempt' ? 'var(--muted)' : 'var(--ink)' }}
      >
        {row.groceryTreatment}
      </td>
      <td className="px-2.5 py-1.5 text-right text-[0.72rem]" style={{ color: 'var(--muted)' }}>
        {row.localTax ?? '—'}
      </td>
    </tr>
  );
}

export function DatasetBrowser() {
  const [query, setQuery] = useState('');
  // Typing stays responsive even while 438 rows re-filter and re-render.
  const deferred = useDeferredValue(query);

  const rows = useMemo(() => {
    const q = deferred.trim().toLowerCase();
    if (!q) return DATASET_ROWS;
    return DATASET_ROWS.filter((r) => r.search.includes(q));
  }, [deferred]);

  const th =
    'sticky top-0 z-10 px-2.5 py-2 text-right text-[0.63rem] font-semibold uppercase tracking-[0.07em]';

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search 438 locations — try Chicago, TX, or Rest of"
          aria-label="Search locations"
          className="min-w-64 flex-1 rounded border px-3 py-2 text-sm"
          style={{
            background: 'var(--surface)',
            borderColor: 'var(--rule-strong)',
            color: 'var(--ink)',
          }}
        />
        <p aria-live="polite" className="text-xs tnum" style={{ color: 'var(--muted)' }}>
          {rows.length} of {DATASET_ROWS.length}
        </p>
      </div>

      <div
        className="max-h-[60vh] overflow-auto rounded border"
        style={{ borderColor: 'var(--rule)', background: 'var(--surface)' }}
      >
        <table className="w-full border-collapse">
          <caption className="sr-only">
            Every location the calculator supports, with its housing costs, price levels and tax
            treatment.
          </caption>
          <thead>
            <tr>
              <th
                scope="col"
                className={`${th} text-left`}
                style={{ color: 'var(--muted)', background: 'var(--surface)' }}
              >
                Location
              </th>
              {[
                ['Rent/mo', 'Median gross rent'],
                ['Home price', 'Median home value'],
                ['Prop tax', 'Effective rate actually paid'],
                ['Cars/adult', 'Vehicles per adult'],
                ['All items', 'Price level vs national = 100'],
                ['Housing', 'Price level vs national = 100'],
                ['Goods', 'Price level vs national = 100'],
                ['Utilities', 'Price level vs national = 100'],
                ['Income tax', 'State income tax on wages'],
                ['Sales tax', 'State plus average local'],
                ['Groceries', 'Sales tax treatment of food at home'],
                ['Local tax', 'Local income tax jurisdictions'],
              ].map(([label, title]) => (
                <th
                  key={label}
                  scope="col"
                  className={th}
                  title={title}
                  style={{ color: 'var(--muted)', background: 'var(--surface)' }}
                >
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <Row key={row.id} row={row} />
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={13} className="px-3 py-6 text-center text-sm" style={{ color: 'var(--muted)' }}>
                  Nothing matches “{query}”. Try a state code, or “Rest of” for rural areas.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <p className="text-xs" style={{ color: 'var(--muted)' }}>
        Price levels are indexed so the national average is 100 — Chicago housing at 112 means 12%
        above the US average. Property tax is the <em>effective</em> rate actually paid, which
        already reflects assessment ratios, homestead exemptions and caps.
      </p>
    </div>
  );
}
