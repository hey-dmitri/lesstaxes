'use client';

import { useState } from 'react';

import { CityPanel, resetCityForLocation, type CityFormState } from '@/components/city-panel';
import { CountField, SelectField } from '@/components/fields';
import { formatUSD, metro, type FilingStatus } from '@/engine';

const FILING_OPTIONS: Array<{ value: FilingStatus; label: string }> = [
  { value: 'single', label: 'Single' },
  { value: 'marriedJointly', label: 'Married filing jointly' },
  { value: 'marriedSeparately', label: 'Married filing separately' },
  { value: 'headOfHousehold', label: 'Head of household' },
];

const DEFAULT_ORIGIN = '16980'; // Chicago
const DEFAULT_DESTINATION = '12420'; // Austin
const DEFAULT_SALARY = 150_000;

export default function Home() {
  const [filingStatus, setFilingStatus] = useState<FilingStatus>('single');
  const [children, setChildren] = useState(0);

  const [origin, setOrigin] = useState<CityFormState>(() =>
    resetCityForLocation(DEFAULT_ORIGIN, DEFAULT_SALARY, 'single', 'rent'),
  );
  const [destination, setDestination] = useState<CityFormState>(() =>
    resetCityForLocation(DEFAULT_DESTINATION, DEFAULT_SALARY, 'single', 'rent'),
  );

  /**
   * Filing status changes the number of adults, which changes the suggested
   * car count. Re-derive it, but only for cities the user has not overridden
   * away from the suggestion — otherwise changing "single" to "married" would
   * silently discard a deliberate edit.
   */
  function changeFilingStatus(next: FilingStatus) {
    setFilingStatus(next);
    for (const [state, setState] of [
      [origin, setOrigin],
      [destination, setDestination],
    ] as const) {
      const wasSuggested =
        state.cars === resetCityForLocation(state.metroId, 0, filingStatus, 'rent').cars;
      if (wasSuggested) {
        setState({
          ...state,
          cars: resetCityForLocation(state.metroId, 0, next, 'rent').cars,
        });
      }
    }
  }

  const sameCity = origin.metroId === destination.metroId;
  const salaryChanged = origin.grossSalary !== destination.grossSalary;

  return (
    <main className="flex flex-col gap-8">
      <section
        className="rounded-lg border p-5 sm:p-6"
        style={{ borderColor: 'var(--rule-strong)', background: 'var(--surface)' }}
      >
        <h2 className="mb-1 font-serif text-lg font-semibold" style={{ color: 'var(--ink)' }}>
          Your household
        </h2>
        <p className="mb-5 text-xs" style={{ color: 'var(--muted)' }}>
          The same in both cities. Filing status alone can swing the answer by thousands, so it is
          not optional.
        </p>

        <div className="grid gap-5 sm:grid-cols-2">
          <SelectField
            label="Filing status"
            value={filingStatus}
            onChange={changeFilingStatus}
            options={FILING_OPTIONS}
          />
          <CountField
            label="Children"
            value={children}
            onChange={setChildren}
            max={10}
            hint="Drives the Child Tax Credit and state child credits"
          />
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <CityPanel
          title="Where you live now"
          subtitle="Your current situation"
          state={origin}
          filingStatus={filingStatus}
          onChange={setOrigin}
          salaryLabel="Current household salary"
          salaryHint="Total household wages before tax"
        />
        <CityPanel
          title="Where you'd move"
          subtitle="The city you're considering"
          state={destination}
          filingStatus={filingStatus}
          onChange={setDestination}
          salaryLabel="Salary there"
          salaryHint={
            salaryChanged
              ? `${formatUSD(destination.grossSalary - origin.grossSalary, { signed: true })} versus what you earn now`
              : 'Defaults to your current salary — change it if the offer differs'
          }
        />
      </div>

      {/*
        Stage 4 ends here: the form captures every input the engine needs.
        The results panel, reveal animation and share link arrive in Stage 5.
      */}
      <section
        className="rounded-lg border border-dashed p-5 sm:p-6"
        style={{ borderColor: 'var(--rule-strong)', background: 'var(--surface-sunken)' }}
      >
        <h2 className="mb-1 font-serif text-lg font-semibold" style={{ color: 'var(--ink)' }}>
          Inputs captured
        </h2>
        <p className="mb-4 text-xs" style={{ color: 'var(--muted)' }}>
          A temporary echo so you can confirm the form works. The real result — headline figure,
          breakdown, break-even salary and share link — lands in the next stage.
        </p>

        {sameCity && (
          <p className="mb-4 text-sm" style={{ color: 'var(--bad)' }}>
            Both cities are the same. Pick a different destination to see a comparison.
          </p>
        )}

        <dl className="grid gap-x-8 gap-y-2 text-sm sm:grid-cols-2">
          {[
            ['Household', `${FILING_OPTIONS.find((f) => f.value === filingStatus)?.label}, ${children} ${children === 1 ? 'child' : 'children'}`],
            ['From', `${metro(origin.metroId).shortName} — ${formatUSD(origin.grossSalary)}`],
            ['To', `${metro(destination.metroId).shortName} — ${formatUSD(destination.grossSalary)}`],
            [
              'Housing now',
              origin.housing.tenure === 'rent'
                ? `Renting at ${formatUSD(origin.housing.monthlyRent)}/mo`
                : `Owning a ${formatUSD(origin.housing.homePrice)} home`,
            ],
            [
              'Housing there',
              destination.housing.tenure === 'rent'
                ? `Renting at ${formatUSD(destination.housing.monthlyRent)}/mo`
                : `Owning a ${formatUSD(destination.housing.homePrice)} home`,
            ],
            ['Cars', `${origin.cars} now → ${destination.cars} there`],
          ].map(([term, value]) => (
            <div key={term} className="flex justify-between gap-4 border-b pb-1.5" style={{ borderColor: 'var(--rule)' }}>
              <dt style={{ color: 'var(--muted)' }}>{term}</dt>
              <dd className="text-right tnum" style={{ color: 'var(--ink)' }}>
                {value}
              </dd>
            </div>
          ))}
        </dl>
      </section>
    </main>
  );
}
