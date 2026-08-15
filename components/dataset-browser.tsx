'use client';

import { useDeferredValue, useMemo, useState } from 'react';

import { formatUSD } from '@/engine';
import { DATASET_ROWS, type DatasetRow } from '@/lib/dataset-rows';
import { ALL_STATE_CODES, stateRules } from '@/engine';

/*
 * Counted, not typed. This said "Ten" while twelve states were on prior-year
 * figures — Connecticut and Delaware joined once their cited documents were
 * opened and turned out to be 2025 papers with 2026 revision stamps.
 */
const PRIOR_YEAR_COUNT = ALL_STATE_CODES.map((code) => stateRules(code)).filter(
  (s) => s.priorYearFigures,
).length;

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
          <span className="ml-1.5 text-[0.72rem]" style={{ color: 'var(--muted)' }}>
            rural
          </span>
        )}
        {/* A split metro appears once per state, because that is how many
            different tax answers it has. */}
        {row.isStatePart && (
          <span
            className="ml-1.5 rounded px-1.5 py-0.5 text-[0.7rem]"
            style={{ background: 'var(--accent-dim)', color: 'var(--accent)' }}
            title={`The ${row.state} part of a metro spanning ${row.states.join(', ')}`}
          >
            {row.state} part
          </span>
        )}
      </th>
      <td className={td} style={{ color: 'var(--ink)' }}>{formatUSD(row.rent)}</td>
      <td className={td} style={{ color: 'var(--ink)' }}>{formatUSD(row.rent1br)}</td>
      <td className={td} style={{ color: 'var(--ink)' }}>{formatUSD(row.rent3br)}</td>
      <td className={td} style={{ color: 'var(--muted)' }}>{formatUSD(row.renterIncome)}</td>
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
      <td className="px-2.5 py-1.5 text-right text-[0.78rem]" style={{ color: 'var(--muted)' }}>
        {row.localTax ?? '—'}
      </td>
      {/* Provenance, not a figure. A reader checking our numbers deserves to
          know whether this state's tax rules were read off the state's own
          schedule or taken from an annual table published in February.

          THE DATE IS A LINK, because the methodology page promises the data
          page "links to the document it was checked against" and for a long
          time it did not — the URL was in a title attribute, which is a hover
          tooltip. A phone cannot hover and a keyboard cannot reach it, so on
          the two devices most likely to be used the document was simply not
          there. This is the sentence carrying the site's whole provenance
          claim, so it is better to make the claim true than to soften it. */}
      <td
        className="px-2.5 py-1.5 text-right text-[0.78rem] whitespace-nowrap"
        style={{ color: row.taxChecked ? 'var(--ink)' : 'var(--muted)' }}
      >
        {row.taxCheckedUrl ? (
          <a
            href={row.taxCheckedUrl}
            target="_blank"
            rel="noreferrer"
            className="underline underline-offset-2"
            style={{ color: 'var(--ink)' }}
            title={`Open the document ${row.state} was checked against`}
          >
            {row.taxChecked}
          </a>
        ) : (
          <span title="This state does not tax wages, so there is no rate schedule to check.">
            {row.taxChecked ?? 'not checked'}
          </span>
        )}
      </td>
    </tr>
  );
}

export function DatasetBrowser() {
  const [query, setQuery] = useState('');
  // Typing stays responsive even while every row re-filters and re-renders.
  const deferred = useDeferredValue(query);

  const rows = useMemo(() => {
    const q = deferred.trim().toLowerCase();
    if (!q) return DATASET_ROWS;
    return DATASET_ROWS.filter((r) => r.search.includes(q));
  }, [deferred]);

  const th =
    'sticky top-0 z-10 px-2.5 py-2 text-right text-[0.72rem] font-semibold uppercase tracking-[0.07em]';

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={`Search ${DATASET_ROWS.length} rows — try Chicago, NJ, or Rest of`}
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
                ['Rent/mo', 'Median gross rent, all unit sizes'],
                ['1 bed', 'Median gross rent for a one-bedroom'],
                ['3 bed', 'Median gross rent for a three-bedroom'],
                ['Renter inc', 'Median income of renter households — the anchor for the rent prefill'],
                ['Home price', 'Median home value'],
                ['Prop tax', 'Effective rate actually paid'],
                ['Cars/adult', 'Vehicles per adult'],
                ['All items', 'Price level vs national = 100'],
                ['Housing', 'Price level vs national = 100'],
                ['Goods', 'Price level vs national = 100'],
                ['Utilities', 'Price level vs national = 100'],
                ['Income tax', 'State income tax on wages'],
                // Reference only. Nothing in the calculation multiplies by
                // these — the spending basket already includes sales tax.
                ['Sales tax', 'State plus average local. Reference only — not charged.'],
                ['Groceries', 'Sales tax treatment of food at home. Reference only.'],
                ['Local tax', 'Local income tax jurisdictions'],
                [
                  'Tax checked',
                  `When this state's rates and allowances were last read off the state's own publication, rather than taken from the annual bracket table. ${PRIOR_YEAR_COUNT} states are checked against their most recent figures rather than a 2026 document, because they have published none`,
                ],
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
                <td colSpan={17} className="px-3 py-6 text-center text-sm" style={{ color: 'var(--muted)' }}>
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
        already reflects assessment ratios, homestead exemptions and caps.{' '}
        <strong>Tax checked</strong> is the date someone opened that state&rsquo;s own rate schedule
        and compared every bracket and allowance to ours. Every state that taxes wages has been —
        which mattered, because the annual bracket table is printed in February and seven states
        legislated their way out of it during 2026. Where it says <em>not checked</em>, that state
        has no wage income tax and so no schedule to check.
      </p>
    </div>
  );
}
