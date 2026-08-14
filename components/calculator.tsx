'use client';

import { useMemo, useRef, useState } from 'react';

import { CityPanel, housingFor, type CityFormState } from '@/components/city-panel';
import { InlineSelect, StepBadge } from '@/components/fields';
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

const DEFAULT_SALARY = 150_000;

/**
 * A column with no city in it yet.
 *
 * The site used to open on Chicago and Austin. It demonstrated the tool nicely
 * and answered nobody's question: a page that arrives already full reads as a
 * finished example, and the numbers on it are a stranger's. The salary keeps a
 * starting value because it is the one input nothing can be derived from —
 * everything else waits until there is a place to derive it from.
 */
function emptyCity(): CityFormState {
  return {
    metroId: '',
    grossSalary: DEFAULT_SALARY,
    cars: 0,
    housing: { tenure: 'rent', monthlyRent: 0 },
    localOptIns: {},
  };
}

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

/** One outstanding step in the answer panel's checklist. */
function Waiting({
  done,
  n,
  children,
}: {
  done: boolean;
  n: number;
  children: React.ReactNode;
}) {
  return (
    <li className="flex items-center gap-2" style={{ color: done ? 'var(--muted)' : 'var(--ink)' }}>
      <StepBadge n={n} done={done} />
      <span style={{ textDecoration: done ? 'line-through' : undefined }}>{children}</span>
    </li>
  );
}

export function Calculator({ initial }: CalculatorProps) {
  const [filingStatus, setFilingStatus] = useState<FilingStatus>(
    initial?.filingStatus ?? 'single',
  );
  const [children, setChildren] = useState(initial?.children ?? 0);

  /*
   * Renting or buying is a household fact, not a city fact — the sentence says
   * "in both". It lives up here rather than being read back off origin.housing
   * so that the choice can be made before either city exists.
   */
  const [tenure, setTenure] = useState<'rent' | 'own'>(
    initial?.origin.housing.tenure ?? 'rent',
  );

  const [origin, setOrigin] = useState<CityFormState>(() =>
    initial ? { ...initial.origin } : emptyCity(),
  );
  const [destination, setDestination] = useState<CityFormState>(() =>
    initial ? { ...initial.destination } : emptyCity(),
  );

  // A shared link is already an answer — show it, don't make the recipient
  // press a button to see the thing they were sent.
  const [revealed, setRevealed] = useState(Boolean(initial));
  // Animate the roll-up on the first reveal only. Re-rolling on every keystroke
  // while someone drags a salary around would be noise, not delight.
  const firstRevealRef = useRef(true);
  const [animate, setAnimate] = useState(false);

  const bothChosen = origin.metroId !== '' && destination.metroId !== '';

  // Encoding can legitimately fail (an unknown location, say). Surface that
  // instead of shipping a link that would not open.
  const share = useMemo(() => {
    // Nothing to encode before both cities exist, and no error to report
    // either — the reader simply has not finished yet.
    if (!bothChosen) return { payload: '', path: '', error: null as string | null };
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
  }, [filingStatus, children, origin, destination, bothChosen]);

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
      // An empty column has nothing to re-derive — its defaults are computed
      // from the place, and there is no place yet.
      if (!state.metroId) continue;

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
  function applyTenure(next: 'rent' | 'own') {
    setTenure(next);
    const household = { filingStatus, children };
    for (const [state, setState] of [
      [origin, setOrigin],
      [destination, setDestination],
    ] as const) {
      // A column with no city has no housing figures to swap; it will pick up
      // the new tenure from `tenure` when a city is chosen.
      if (!state.metroId) continue;
      setState({
        ...state,
        housing: housingFor(state.metroId, next, state.grossSalary, household),
      });
    }
  }

  /** Same idea for salary: an untouched rent should track what was entered. */
  function changeSalary(state: CityFormState, setState: (s: CityFormState) => void) {
    return (grossSalary: number) => {
      const household = { filingStatus, children };
      const patch: Partial<CityFormState> = { grossSalary };
      if (state.metroId === '') {
        setState({ ...state, ...patch });
        return;
      }
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
  const sameCity = bothChosen && origin.metroId === destination.metroId;

  // The result exists the moment the inputs do — there is nothing to wait for.
  const result = useMemo(() => {
    if (!bothChosen || sameCity) return null;
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
  }, [origin, destination, filingStatus, children, sameCity, bothChosen]);

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
          className="flex flex-col gap-2 rounded-xl border-2 px-5 py-4"
          style={{ borderColor: 'var(--accent)', background: 'var(--surface)' }}
        >
          <div className="flex items-center gap-2">
            <StepBadge n={1} />
            <span className="eyebrow">About you</span>
          </div>
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
              value={tenure}
              onChange={(next: string) => applyTenure(next as 'rent' | 'own')}
              options={TENURE_OPTIONS}
            />{' '}
            in both.
          </p>
          <span className="text-[0.8rem]" style={{ color: 'var(--muted)' }}>
            Tap any green word to change it. Then pick your two cities below.
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
            step={2}
            emptyPrompt="Where do you live now?"
            state={origin}
            filingStatus={filingStatus}
            childCount={children}
            tenure={tenure}
            onChange={setOrigin}
            onSalaryChange={changeSalary(origin, setOrigin)}
            salaryLabel="Salary here"
            salaryHint="a year, gross"
            result={result?.origin ?? null}
            takeHomeNote={takeHomeNote(origin.metroId, result?.origin ?? null)}
          />
          <CityPanel
            title="The offer"
            step={3}
            emptyPrompt="Where are you thinking of going?"
            state={destination}
            filingStatus={filingStatus}
            childCount={children}
            tenure={tenure}
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
          {/*
            Step 4 completes the sequence: the three inputs, then the thing
            they are for. Its marker only goes quiet once the verdict is
            actually on screen.
          */}
          <h2
            className="flex shrink-0 items-center gap-2 border-b px-4 py-2.5 font-display text-sm font-semibold"
            style={{ borderColor: 'var(--rule)', color: 'var(--ink)' }}
          >
            <StepBadge n={4} done={revealed && Boolean(result)} />
            {revealed && result ? 'Pack or stay' : 'Your answer'}
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
              {!bothChosen ? (
                /*
                  Name the step that is outstanding rather than showing a dead
                  button. The two prompts match the headings on the columns, so
                  the reader is told where to look, not just that something is
                  missing.
                */
                <>
                  <p className="text-[0.95rem] leading-snug" style={{ color: 'var(--ink-soft)' }}>
                    Pick both cities and the answer appears here.
                  </p>
                  <ul className="flex flex-col gap-1.5 text-[0.9rem]">
                    <Waiting done={origin.metroId !== ''} n={2}>
                      Where do you live now
                    </Waiting>
                    <Waiting done={destination.metroId !== ''} n={3}>
                      Where you&rsquo;re thinking of going
                    </Waiting>
                    <Waiting done={false} n={4}>
                      Pack or stay
                    </Waiting>
                  </ul>
                </>
              ) : sameCity ? (
                <p className="text-sm" style={{ color: 'var(--bad)' }}>
                  Both cities are the same. Pick a different destination.
                </p>
              ) : (
                <>
                  <p className="text-[0.95rem] leading-snug" style={{ color: 'var(--ink-soft)' }}>
                    Both cities are set, with real local figures filled in. Change anything you
                    like, or go straight to the answer.
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
