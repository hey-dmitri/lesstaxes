'use client';

import { useMemo, useRef, useState } from 'react';

import { CityPanel, housingFor, resetCityForLocation, type CityFormState } from '@/components/city-panel';
import { InlineSelect } from '@/components/fields';
import { Results } from '@/components/results';
import { ShareBar } from '@/components/share-bar';
import { encodeComparison, type SharedComparison } from '@/lib/share-link';
import { describeComparison, jurisdictionsFor } from '@/lib/shared-comparison';
import { ACTION, TAGLINE } from '@/lib/site';
import {
  compare,
  DATASET_VERSION,
  metro,
  type CityResult,
  defaultCarCount,
  defaultRent,
  formatUSD,
  type FilingStatus,
  type Household,
} from '@/engine';

const FILING_OPTIONS: Array<{ value: FilingStatus; label: string }> = [
  { value: 'single', label: 'single' },
  { value: 'marriedJointly', label: 'married, jointly' },
  { value: 'marriedSeparately', label: 'married, separately' },
  { value: 'headOfHousehold', label: 'head of household' },
];

const CHILD_OPTIONS = [
  { value: '0', label: 'no children' },
  { value: '1', label: '1 child' },
  { value: '2', label: '2 children' },
  { value: '3', label: '3 children' },
  { value: '4', label: '4 children' },
  { value: '5', label: '5 children' },
];

const TENURE_OPTIONS = [
  { value: 'rent', label: 'rent' },
  { value: 'own', label: 'buy' },
];

const DEFAULT_ORIGIN = '16980'; // Chicago
const DEFAULT_DESTINATION = '12420'; // Austin
const DEFAULT_SALARY = 150_000;

export interface CalculatorProps {
  /** Present when arriving via a share link, so the result opens revealed. */
  initial?: SharedComparison;
}

/**
 * The line under take-home, naming the taxes that were actually deducted.
 *
 * "Nothing spent yet" is the important half: it marks take-home as the point
 * before living costs, which is what makes the column's next two lines legible
 * as a subtraction rather than as three unrelated figures.
 */
function takeHomeNote(metroId: string, result: CityResult | null) {
  if (!result) return null;
  const state = metro(metroId).primaryState;
  const parts = ['Federal income tax', 'FICA'];
  if (result.tax.state > 0) parts.push(`${state} tax`);
  if (result.tax.local > 0) parts.push('local tax');
  const list =
    parts.length > 1 ? `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}` : parts[0];
  return `${list} paid. Nothing spent yet.`;
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

  /** The sentence says "in both", so tenure changes both columns together. */
  function applyTenure(tenure: 'rent' | 'own') {
    const household = { filingStatus, children };
    for (const [state, setState] of [
      [origin, setOrigin],
      [destination, setDestination],
    ] as const) {
      setState({
        ...state,
        housing: housingFor(state.metroId, tenure, state.grossSalary, household),
      });
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
    <main id="main" className="flex flex-1 flex-col gap-4">
      {/*
        What the site is, beside what it needs to know about you. Stacked, the
        two cost enough height to push the leftover figures under the fold on a
        laptop; side by side they read as one masthead and the work starts
        higher up the page.
      */}
      <div className="grid shrink-0 gap-3 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] lg:items-start">
        {/*
          The h1 is the question rather than the brand, because the question is
          the thing a stranger can act on; the sentence under it says what they
          get and what it accounts for, so nobody has to infer the product from
          a form.
        */}
        <div className="flex flex-col gap-2">
          <h1
            className="font-display text-[1.9rem] font-bold leading-[1.08] tracking-[-0.035em] xl:text-[2.3rem]"
            style={{ color: 'var(--ink)' }}
          >
            {TAGLINE}
          </h1>
          <p className="max-w-[52ch] text-[1.05rem] leading-snug" style={{ color: 'var(--ink-soft)' }}>
            Pick two cities and a salary. See what you&rsquo;d have left over each year, after tax,
            housing, cars and everyday costs.
          </p>
        </div>

        {/*
          "About you" as a sentence rather than a row of labelled fields. Filing
          status and children are the only inputs shared by both cities, and
          reading them as prose makes the shape of the household obvious at a
          glance — the redesign's Turn 3 form.
        */}
        <section
          className="flex flex-col gap-1.5 rounded-xl border px-5 py-3.5"
          style={{ borderColor: 'var(--rule-strong)', background: 'var(--surface)' }}
        >
          <span className="eyebrow">About you</span>
          <p className="flex flex-wrap items-baseline gap-x-1.5 gap-y-2 text-[1.05rem]" style={{ color: 'var(--ink)' }}>
            I file as{' '}
            <InlineSelect
              label="Filing status"
              value={filingStatus}
              onChange={(next) => applyHousehold(next as FilingStatus, children)}
              options={FILING_OPTIONS}
            />{' '}
            with{' '}
            <InlineSelect
              label="Children"
              value={String(children)}
              onChange={(next: string) => applyHousehold(filingStatus, Number(next))}
              options={CHILD_OPTIONS}
            />
            , and I&rsquo;d{' '}
            <InlineSelect
              label="Housing"
              value={origin.housing.tenure}
              onChange={(tenure: string) => applyTenure(tenure as 'rent' | 'own')}
              options={TENURE_OPTIONS}
            />{' '}
            in both.
          </p>
          <span className="text-[0.8rem]" style={{ color: 'var(--muted)' }}>
            Salary and housing go in each city, prefilled with real local figures.
          </span>
        </section>
      </div>

      {/*
        Two grids, not three columns, and this is the whole point.

        A single three-column row made every column as tall as the tallest, so
        revealing the answer stretched the two city panels by a few hundred
        pixels and their bottom-pinned leftover figures slid down with it —
        the reader pressed a button and watched the numbers they were reading
        run away. The cities now share a nested grid, so they stretch to each
        other and to nothing else, and items-start lets the answer column grow
        downwards on its own without moving anything.
      */}
      <div className="grid flex-1 items-start gap-3 lg:grid-cols-[minmax(0,2fr)_minmax(0,1.3fr)]">
        <div className="grid gap-3 sm:grid-cols-2">
          <CityPanel
            title="Living now"
            state={origin}
            filingStatus={filingStatus}
            childCount={children}
            onChange={setOrigin}
            onSalaryChange={changeSalary(origin, setOrigin)}
            salaryLabel="Salary here"
            salaryHint="a year, gross"
            result={result?.origin ?? null}
            takeHomeNote={takeHomeNote(origin.metroId, result?.origin ?? null)}
          />
          <CityPanel
            title="The offer"
            state={destination}
            filingStatus={filingStatus}
            childCount={children}
            onChange={setDestination}
            onSalaryChange={changeSalary(destination, setDestination)}
            result={result?.destination ?? null}
            takeHomeNote={takeHomeNote(destination.metroId, result?.destination ?? null)}
            salaryLabel="Salary offered"
            salaryHint={
              destination.grossSalary !== origin.grossSalary
                ? `${formatUSD(destination.grossSalary - origin.grossSalary, { signed: true })} versus now`
                : 'Defaults to your current salary'
            }
          />
        </div>

        <section
          className="flex flex-col rounded-xl border"
          style={{ borderColor: 'var(--rule-strong)', background: 'var(--surface)' }}
        >
          <h2
            className="shrink-0 border-b px-4 py-2.5 font-display text-sm font-semibold"
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
            /*
              Top-aligned and left-aligned, with the same padding the answer
              uses, so the button sits roughly where the headline figure will
              land. Pressing it swaps a button for a number in place, rather
              than firing one in from the top of a tall empty box.
            */
            <div className="flex flex-col gap-3 px-5 py-4">
              {sameCity ? (
                <p className="text-sm" style={{ color: 'var(--bad)' }}>
                  Both cities are the same. Pick a different destination.
                </p>
              ) : (
                <>
                  <p className="text-[0.95rem] leading-snug" style={{ color: 'var(--ink-soft)' }}>
                    Both cities are filled in and ready. Change anything you like, or go straight
                    to the answer.
                  </p>
                  <button
                    type="button"
                    onClick={onCompare}
                    className="w-full rounded-lg px-6 py-3 text-base font-semibold"
                    style={{ background: 'var(--accent)', color: '#ffffff' }}
                  >
                    {ACTION}
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
