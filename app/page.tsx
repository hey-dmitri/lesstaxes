'use client';

import { useMemo, useRef, useState } from 'react';

import { CityPanel, resetCityForLocation, type CityFormState } from '@/components/city-panel';
import { CountField, SelectField } from '@/components/fields';
import { Results } from '@/components/results';
import {
  compare,
  DATASET_VERSION,
  formatUSD,
  localJurisdiction,
  localTaxOptions,
  type FilingStatus,
  type Household,
} from '@/engine';

const FILING_OPTIONS: Array<{ value: FilingStatus; label: string }> = [
  { value: 'single', label: 'Single' },
  { value: 'marriedJointly', label: 'Married filing jointly' },
  { value: 'marriedSeparately', label: 'Married filing separately' },
  { value: 'headOfHousehold', label: 'Head of household' },
];

const DEFAULT_ORIGIN = '16980'; // Chicago
const DEFAULT_DESTINATION = '12420'; // Austin
const DEFAULT_SALARY = 150_000;

/** Turn the user's opt-in checkboxes into the jurisdictions the engine applies. */
function jurisdictionsFor(city: CityFormState) {
  return localTaxOptions(city.metroId)
    .filter((option) =>
      option.optional ? (city.localOptIns[option.jurisdictionId] ?? false) : option.defaultApplies,
    )
    .map((option) => localJurisdiction(option.jurisdictionId));
}

export default function Home() {
  const [filingStatus, setFilingStatus] = useState<FilingStatus>('single');
  const [children, setChildren] = useState(0);

  const [origin, setOrigin] = useState<CityFormState>(() =>
    resetCityForLocation(DEFAULT_ORIGIN, DEFAULT_SALARY, 'single', 'rent'),
  );
  const [destination, setDestination] = useState<CityFormState>(() =>
    resetCityForLocation(DEFAULT_DESTINATION, DEFAULT_SALARY, 'single', 'rent'),
  );

  const [revealed, setRevealed] = useState(false);
  // Animate the roll-up on the first reveal only. Re-rolling on every keystroke
  // while someone drags a salary around would be noise, not delight.
  const firstRevealRef = useRef(true);
  const [animate, setAnimate] = useState(false);
  const resultsRef = useRef<HTMLDivElement>(null);

  function changeFilingStatus(next: FilingStatus) {
    setFilingStatus(next);
    for (const [state, setState] of [
      [origin, setOrigin],
      [destination, setDestination],
    ] as const) {
      const wasSuggested =
        state.cars === resetCityForLocation(state.metroId, 0, filingStatus, 'rent').cars;
      if (wasSuggested) {
        setState({ ...state, cars: resetCityForLocation(state.metroId, 0, next, 'rent').cars });
      }
    }
  }

  const household: Household = { filingStatus, children };
  const sameCity = origin.metroId === destination.metroId;

  // The result exists the moment the inputs do — there is nothing to wait for.
  const result = useMemo(() => {
    if (sameCity) return null;
    return compare(
      {
        datasetVersion: DATASET_VERSION,
        household,
        origin: { metroId: origin.metroId, grossSalary: origin.grossSalary, housing: origin.housing, cars: origin.cars },
        destination: {
          metroId: destination.metroId,
          grossSalary: destination.grossSalary,
          housing: destination.housing,
          cars: destination.cars,
        },
      },
      {
        origin: { localJurisdictions: jurisdictionsFor(origin) },
        destination: { localJurisdictions: jurisdictionsFor(destination) },
      },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [origin, destination, filingStatus, children, sameCity]);

  function onCompare() {
    setRevealed(true);
    if (firstRevealRef.current) {
      firstRevealRef.current = false;
      setAnimate(true);
      window.setTimeout(() => setAnimate(false), 1200);
    }
    window.requestAnimationFrame(() => {
      resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

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
            destination.grossSalary !== origin.grossSalary
              ? `${formatUSD(destination.grossSalary - origin.grossSalary, { signed: true })} versus what you earn now`
              : 'Defaults to your current salary — change it if the offer differs'
          }
        />
      </div>

      {sameCity && (
        <p
          className="rounded border px-4 py-3 text-sm"
          style={{ borderColor: 'var(--rule-strong)', background: 'var(--surface)', color: 'var(--bad)' }}
        >
          Both cities are the same. Pick a different destination to see a comparison.
        </p>
      )}

      {!revealed && (
        <div className="flex flex-col items-center gap-2">
          <button
            type="button"
            onClick={onCompare}
            disabled={sameCity}
            className="w-full rounded-lg px-6 py-3.5 text-base font-semibold transition-opacity disabled:opacity-40 sm:w-auto sm:min-w-64"
            style={{ background: 'var(--accent)', color: '#ffffff' }}
          >
            Compare these cities
          </button>
          <p className="text-xs" style={{ color: 'var(--muted)' }}>
            Nothing is sent anywhere. The whole calculation runs in your browser.
          </p>
        </div>
      )}

      {revealed && result && (
        <div ref={resultsRef} className="scroll-mt-6">
          <Results result={result} animate={animate} />
          <p className="mt-3 text-center text-xs" style={{ color: 'var(--muted)' }}>
            Edit anything above and this updates instantly.
          </p>
        </div>
      )}
    </main>
  );
}
