'use client';

import { useMemo, useRef, useState } from 'react';

import { CityPanel, resetCityForLocation, type CityFormState } from '@/components/city-panel';
import { CountField, SelectField } from '@/components/fields';
import { Results } from '@/components/results';
import { ShareBar } from '@/components/share-bar';
import { encodeComparison, type SharedComparison } from '@/lib/share-link';
import { describeComparison, jurisdictionsFor } from '@/lib/shared-comparison';
import { SUPPORTING } from '@/lib/site';
import {
  compare,
  DATASET_VERSION,
  defaultCarCount,
  defaultRent,
  formatUSD,
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

export interface CalculatorProps {
  /** Present when arriving via a share link, so the result opens revealed. */
  initial?: SharedComparison;
}

export function Calculator({ initial }: CalculatorProps) {
  const [filingStatus, setFilingStatus] = useState<FilingStatus>(
    initial?.filingStatus ?? 'single',
  );
  const [children, setChildren] = useState(initial?.children ?? 0);

  const [origin, setOrigin] = useState<CityFormState>(() =>
    initial
      ? { ...initial.origin }
      : resetCityForLocation(DEFAULT_ORIGIN, DEFAULT_SALARY, 'single', 'rent', 0),
  );
  const [destination, setDestination] = useState<CityFormState>(() =>
    initial
      ? { ...initial.destination }
      : resetCityForLocation(DEFAULT_DESTINATION, DEFAULT_SALARY, 'single', 'rent'),
  );

  // A shared link is already an answer — show it, don't make the recipient
  // press a button to see the thing they were sent.
  const [revealed, setRevealed] = useState(Boolean(initial));
  // Animate the roll-up on the first reveal only. Re-rolling on every keystroke
  // while someone drags a salary around would be noise, not delight.
  const firstRevealRef = useRef(true);
  const [animate, setAnimate] = useState(false);

  // Encoding can legitimately fail (an unknown location, say). Surface that
  // instead of shipping a link that would not open.
  const share = useMemo(() => {
    try {
      const payload = encodeComparison({
        datasetVersion: DATASET_VERSION,
        filingStatus,
        children,
        origin,
        destination,
      });
      return { payload, path: `/r/${payload}`, error: null as string | null };
    } catch (e) {
      return { payload: '', path: '', error: e instanceof Error ? e.message : 'unknown problem' };
    }
  }, [filingStatus, children, origin, destination]);

  /**
   * Re-derive the fields that depend on the household, but only where the user
   * has not overridden them. Cars and rent both follow from filing status and
   * children — a second adult adds a car, a child adds a bedroom — so leaving
   * them stale after a change would quietly answer the wrong question. Anything
   * typed by hand is left exactly as typed.
   */
  function applyHousehold(nextStatus: FilingStatus, nextChildren: number) {
    setFilingStatus(nextStatus);
    setChildren(nextChildren);

    for (const [state, setState] of [
      [origin, setOrigin],
      [destination, setDestination],
    ] as const) {
      const before = { filingStatus, children };
      const after = { filingStatus: nextStatus, children: nextChildren };
      const patch: Partial<CityFormState> = {};

      if (state.cars === defaultCarCount(state.metroId, filingStatus)) {
        patch.cars = defaultCarCount(state.metroId, nextStatus);
      }
      if (
        state.housing.tenure === 'rent' &&
        state.housing.monthlyRent === defaultRent(state.metroId, state.grossSalary, before)
      ) {
        patch.housing = {
          tenure: 'rent',
          monthlyRent: defaultRent(state.metroId, state.grossSalary, after),
        };
      }
      if (Object.keys(patch).length > 0) setState({ ...state, ...patch });
    }
  }

  /** Same idea for salary: an untouched rent should track what was entered. */
  function changeSalary(state: CityFormState, setState: (s: CityFormState) => void) {
    return (grossSalary: number) => {
      const household = { filingStatus, children };
      const patch: Partial<CityFormState> = { grossSalary };
      if (
        state.housing.tenure === 'rent' &&
        state.housing.monthlyRent === defaultRent(state.metroId, state.grossSalary, household)
      ) {
        patch.housing = {
          tenure: 'rent',
          monthlyRent: defaultRent(state.metroId, grossSalary, household),
        };
      }
      setState({ ...state, ...patch });
    };
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
        origin: {
          metroId: origin.metroId,
          grossSalary: origin.grossSalary,
          housing: origin.housing,
          cars: origin.cars,
        },
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
  }

  return (
    <main id="main" className="flex flex-1 flex-col gap-3 lg:h-0 lg:min-h-0 lg:overflow-hidden">
      {/* Household — one compact bar, since it is two fields that apply to both cities. */}
      <section
        className="flex shrink-0 flex-wrap items-end gap-x-5 gap-y-3 rounded-lg border px-4 py-3"
        style={{ borderColor: 'var(--rule-strong)', background: 'var(--surface)' }}
      >
        <div className="min-w-56 flex-1 sm:max-w-72">
          <SelectField
            label="Filing status"
            value={filingStatus}
            onChange={(next) => applyHousehold(next, children)}
            options={FILING_OPTIONS}
          />
        </div>
        <div className="w-32">
          <CountField
            label="Children"
            value={children}
            onChange={(next) => applyHousehold(filingStatus, next)}
            max={10}
          />
        </div>
        <p className="flex-1 text-[0.76rem] leading-snug" style={{ color: 'var(--muted)' }}>
          These apply to both cities. Filing status alone can swing the answer by thousands, so it
          is not optional.
        </p>
      </section>

      <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.35fr)]">
        <CityPanel
          title="Where you live now"
          state={origin}
          filingStatus={filingStatus}
          childCount={children}
          onChange={setOrigin}
          onSalaryChange={changeSalary(origin, setOrigin)}
          salaryLabel="Current household salary"
          salaryHint="Total household wages before tax"
        />
        <CityPanel
          title="Where you'd move"
          state={destination}
          filingStatus={filingStatus}
          childCount={children}
          onChange={setDestination}
          onSalaryChange={changeSalary(destination, setDestination)}
          salaryLabel="Salary there"
          salaryHint={
            destination.grossSalary !== origin.grossSalary
              ? `${formatUSD(destination.grossSalary - origin.grossSalary, { signed: true })} versus now`
              : 'Defaults to your current salary'
          }
        />

        <section
          className="flex flex-col rounded-lg border lg:min-h-0"
          style={{ borderColor: 'var(--rule-strong)', background: 'var(--surface)' }}
        >
          <h2
            className="shrink-0 border-b px-4 py-2.5 font-serif text-sm font-semibold"
            style={{ borderColor: 'var(--rule)', color: 'var(--ink)' }}
          >
            {revealed && result ? 'What it means for you' : 'Your answer'}
          </h2>

          {revealed && result ? (
            <Results
              result={result}
              animate={animate}
              share={
                <ShareBar
                  path={share.path}
                  payload={share.payload}
                  slug={describeComparison(result).slug}
                  error={share.error}
                />
              }
            />
          ) : (
            <div className="flex flex-col items-center justify-center gap-3 px-6 py-8 text-center lg:min-h-0 lg:flex-1">
              {sameCity ? (
                <p className="text-sm" style={{ color: 'var(--bad)' }}>
                  Both cities are the same. Pick a different destination.
                </p>
              ) : (
                <>
                  <p className="max-w-[34ch] text-sm" style={{ color: 'var(--muted)' }}>
                    Everything is filled in with real local figures. Adjust anything, or just see
                    the answer.
                  </p>
                  <button
                    type="button"
                    onClick={onCompare}
                    className="w-full max-w-64 rounded-lg px-6 py-3 text-base font-semibold"
                    style={{ background: 'var(--accent)', color: '#ffffff' }}
                  >
                    {SUPPORTING}
                  </button>
                  <p className="text-[0.76rem]" style={{ color: 'var(--muted)' }}>
                    Nothing is sent anywhere. It all runs in your browser.
                  </p>
                </>
              )}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
