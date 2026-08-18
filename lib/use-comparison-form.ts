'use client';

import { useMemo, useState } from 'react';

import { housingFor, salaryIsPrefill, type CityFormState } from '@/components/city-panel';
import { comparisonInputsFrom } from '@/lib/comparison-inputs';
import { salaryWording } from '@/lib/salary-wording';
import { jurisdictionsFor } from '@/lib/shared-comparison';
import { encodeComparison, type SharedComparison } from '@/lib/share-link';
import {
  compare,
  DATASET_VERSION,
  cityName,
  defaultCarCount,
  defaultRent,
  defaultSalaryFor,
  formatUSD,
  housingAtSalary,
  metro,
  stateRules,
  type ComparisonResult,
  type FilingStatus,
} from '@/engine';

export const FILING_OPTIONS: Array<{ value: FilingStatus; label: string }> = [
  { value: 'single', label: 'single' },
  { value: 'marriedJointly', label: 'married, jointly' },
  { value: 'marriedSeparately', label: 'married, separately' },
  { value: 'headOfHousehold', label: 'head of household' },
];

/*
 * "Under 17" is the Child Tax Credit's own test, and saying so is the point:
 * the form used to ask for "children" and then hand every one of them a full
 * credit, including the 19-year-old at university. The Earned Income Credit
 * counts a slightly wider group, so one number for both is the conservative
 * reading — a household with an older teenager is credited less than it is
 * owed, never more.
 */
export const CHILD_OPTIONS = [
  { value: '0', label: 'no children under 17' },
  { value: '1', label: '1 child under 17' },
  { value: '2', label: '2 children under 17' },
  { value: '3', label: '3 children under 17' },
  { value: '4', label: '4 children under 17' },
  { value: '5', label: '5 children under 17' },
];

/*
 * Only asked of couples. The Social Security wage base is a per-worker cap, so
 * a household on $300,000 owes $7,161 more when two people earn it than when
 * one does — and that gap does not cancel out of a comparison where the salary
 * changes, which is most of them.
 */
export const EARNER_OPTIONS = [
  { value: '1', label: 'one of us earns' },
  { value: '2', label: 'we both earn' },
];

export const MARRIED: FilingStatus[] = ['marriedJointly', 'marriedSeparately'];

export const TENURE_OPTIONS = [
  { value: 'rent', label: 'rent' },
  { value: 'own', label: 'buy' },
];

/**
 * The salary the form opens on, before any city is chosen.
 *
 * It was $150,000, which is roughly the 90th percentile of American full-time
 * earnings. A default is not neutral: it is the number most people will leave
 * alone, and it seeds the rent and home-price prefills too, because both scale
 * with income. Opening on a figure most visitors will never earn quoted them a
 * house and a rent to match, and made every answer on the page a well-paid
 * person's answer until they noticed and changed it.
 *
 * The moment a city is chosen the box moves to what a full-time worker is
 * actually paid there, which runs from $40,095 to $108,768 across the 438
 * places — see defaultSalaryFor in the engine. This stays as the answer for the
 * one state where no place has been chosen yet.
 */
export const DEFAULT_SALARY = defaultSalaryFor();

/**
 * A column with no city in it yet.
 *
 * The site used to open on Chicago and Austin. It demonstrated the tool nicely
 * and answered nobody's question: a page that arrives already full reads as a
 * finished example, and the numbers on it are a stranger's. The salary keeps a
 * starting value because it is the one input nothing can be derived from —
 * everything else waits until there is a place to derive it from.
 */
export function emptyCity(): CityFormState {
  return {
    metroId: '',
    stateCode: undefined,
    grossSalary: DEFAULT_SALARY,
    cars: 0,
    housing: { tenure: 'rent', monthlyRent: 0 },
    localOptIns: {},
  };
}

export interface ComparisonForm {
  filingStatus: FilingStatus;
  children: number;
  earners: number;
  tenure: 'rent' | 'own';
  origin: CityFormState;
  destination: CityFormState;

  setEarners: (n: number) => void;
  setOrigin: (next: CityFormState) => void;
  setDestination: (next: CityFormState) => void;
  /** Filing status and children together, re-deriving whatever followed them. */
  applyHousehold: (status: FilingStatus, children: number) => void;
  /** Renting or buying, which the sentence says applies to both cities. */
  applyTenure: (next: 'rent' | 'own') => void;
  /** Salary, keeping an untouched rent or home price in step with it. */
  changeSalary: (which: 'origin' | 'destination') => (salary: number) => void;
  /**
   * Put a whole saved comparison back, exactly as it was.
   *
   * Not applyHousehold plus two setters, which is how the setup screen first
   * did it: applyHousehold re-derives an untouched rent from the household it
   * is being given, and it does not touch `tenure` at all — so a restored
   * comparison for a buyer came back with two home prices under a sentence
   * that still said "rent". Everything in a draft was already settled when it
   * was saved. Nothing here re-derives anything.
   */
  restore: (draft: SharedComparison) => void;

  bothChosen: boolean;
  sameCity: boolean;
  /** Null until both cities are chosen and different. */
  result: ComparisonResult | null;
  /** What the salary boxes ask for, in the household's own words. */
  salaryLabels: { here: string; there: string };
  salaryHint: (which: 'origin' | 'destination') => string;
  /** The comparison as a link, or the reason it cannot be one. */
  share: { payload: string; path: string; error: string | null };
  /** Everything a share link carries, for handing to another screen. */
  shared: SharedComparison | null;
}

/**
 * The whole form, owned in one place because two screens now share it.
 *
 * The setup screen fills it in and the answer screen edits it, and both have to
 * apply the same rules — that changing the household re-derives an untouched
 * rent, that changing the salary re-prices an untouched house, that one person
 * cannot be two earners. Those rules lived inside the single calculator
 * component until the interface became two screens; duplicating them into both
 * would have been the fastest way to make the two screens disagree.
 */
export function useComparisonForm(initial?: SharedComparison): ComparisonForm {
  const [filingStatus, setFilingStatus] = useState<FilingStatus>(initial?.filingStatus ?? 'single');
  const [children, setChildren] = useState(initial?.children ?? 0);
  const [earners, setEarners] = useState(initial?.earners ?? 1);

  /*
   * Renting or buying is a household fact, not a city fact — the sentence says
   * "in both". It lives up here rather than being read back off origin.housing
   * so that the choice can be made before either city exists.
   */
  const [tenure, setTenure] = useState<'rent' | 'own'>(initial?.origin.housing.tenure ?? 'rent');

  const [origin, setOrigin] = useState<CityFormState>(() =>
    initial ? { ...initial.origin } : emptyCity(),
  );
  const [destination, setDestination] = useState<CityFormState>(() =>
    initial ? { ...initial.destination } : emptyCity(),
  );

  const bothChosen = origin.metroId !== '' && destination.metroId !== '';
  const sameCity = bothChosen && origin.metroId === destination.metroId;

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
    // One person cannot be two earners. Leaving a stale 2 behind would keep
    // charging the household two Social Security caps after they said single.
    if (!MARRIED.includes(nextStatus)) setEarners(1);

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

      if (state.cars === defaultCarCount(state.metroId, filingStatus, undefined, state.stateCode)) {
        patch.cars = defaultCarCount(state.metroId, nextStatus, undefined, state.stateCode);
      }
      if (
        state.housing.tenure === 'rent' &&
        state.housing.monthlyRent ===
          defaultRent(state.metroId, state.grossSalary, before, undefined, state.stateCode)
      ) {
        patch.housing = {
          tenure: 'rent',
          monthlyRent: defaultRent(
            state.metroId,
            state.grossSalary,
            after,
            undefined,
            state.stateCode,
          ),
        };
      }
      if (Object.keys(patch).length > 0) setState({ ...state, ...patch });
    }
  }

  function restore(draft: SharedComparison) {
    setFilingStatus(draft.filingStatus);
    setChildren(draft.children);
    setEarners(Math.max(1, draft.earners ?? 1));
    // The link format stores tenure per city; the form holds one for both. The
    // origin's is the answer, and describeHousehold makes the same choice.
    setTenure(draft.origin.housing.tenure);
    setOrigin({ ...draft.origin });
    setDestination({ ...draft.destination });
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
        housing: housingFor(state.metroId, next, state.grossSalary, household, state.stateCode),
      });
    }
  }

  /**
   * Same idea for salary: untouched housing should track what was entered.
   *
   * Rent used to be the only field that followed. A home price left at its
   * prefill went stale the moment the salary moved — the hint underneath would
   * read "$528,186 typical at this salary" while the box still held $439,464
   * and the answer still priced the cheaper house, along with its mortgage, its
   * property tax and its deduction.
   */
  function changeSalary(which: 'origin' | 'destination') {
    const state = which === 'origin' ? origin : destination;
    const setState = which === 'origin' ? setOrigin : setDestination;
    return (grossSalary: number) => {
      if (state.metroId === '') {
        setState({ ...state, grossSalary });
        return;
      }
      setState({
        ...state,
        grossSalary,
        housing: housingAtSalary(
          state.metroId,
          state.housing,
          state.grossSalary,
          grossSalary,
          { filingStatus, children },
          undefined,
          state.stateCode,
        ),
      });
    };
  }

  /*
   * Either side counts. A couple filing separately who move from Texas to New
   * York are split on one side of the comparison and not the other, and the
   * sentence has to be true of the figure they are typing in — which is used
   * for both.
   */
  const splitsAcrossReturns = [origin, destination].some((city) => {
    const code = city.stateCode ?? (city.metroId ? metro(city.metroId)?.states[0] : undefined);
    return code ? stateRules(code, DATASET_VERSION).communityProperty === true : false;
  });
  const salary = salaryWording(filingStatus, earners, splitsAcrossReturns);

  /**
   * What to say under a salary box.
   *
   * BOTH COLUMNS SAY THE SAME KIND OF THING, and that is the point. The left
   * one used to explain the US median in two lines while the right one said
   * "defaults to what you earn now" in one, so every field below them sat at a
   * different height in the two columns.
   */
  function salaryHint(which: 'origin' | 'destination') {
    const city = which === 'origin' ? origin : destination;
    const whoseMoney = which === 'origin' ? 'yours' : 'the offer';
    const typed = !salaryIsPrefill(city);
    const place = city.metroId ? cityName(city.metroId) : null;
    const versusNow =
      which === 'destination' && destination.grossSalary !== origin.grossSalary
        ? ` ${formatUSD(destination.grossSalary - origin.grossSalary, { signed: true })} versus now.`
        : '';

    if (typed || !place) return `${salary.whose}${versusNow}`;
    /*
     * "Typical" rather than "median", and "in today's money" because it is NOT
     * the published figure — the Census median is a 2024 number and this is
     * that brought forward, so a reader who looks it up finds a different one
     * and has no way to reconcile the two.
     */
    return `${salary.whose} ${formatUSD(city.grossSalary)} is typical full-time pay in ${place}, in today's money${
      salary.combined ? ' for one worker' : ''
    } — change it to ${whoseMoney}.${versusNow}`;
  }

  // The result exists the moment the inputs do — there is nothing to wait for.
  const result = useMemo(() => {
    if (!bothChosen || sameCity) return null;
    // Built by lib/comparison-inputs, which strips the one form-only field
    // rather than listing the ones the engine wants. Listing them is how
    // stateCode came to be dropped here while the share link carried it.
    return compare(
      comparisonInputsFrom(
        { filingStatus, children, earners, origin, destination },
        DATASET_VERSION,
      ),
      {
        origin: { localJurisdictions: jurisdictionsFor(origin) },
        destination: { localJurisdictions: jurisdictionsFor(destination) },
      },
    );
  }, [origin, destination, filingStatus, children, earners, sameCity, bothChosen]);

  const shared: SharedComparison | null = bothChosen
    ? { datasetVersion: DATASET_VERSION, filingStatus, children, earners, origin, destination }
    : null;

  // Encoding can legitimately fail (an unknown location, say). Surface that
  // instead of shipping a link that would not open.
  const share = useMemo(() => {
    // Nothing to encode before both cities exist, and no error to report
    // either — the reader simply has not finished yet.
    if (!shared) return { payload: '', path: '', error: null as string | null };
    try {
      const payload = encodeComparison(shared);
      return { payload, path: `/r/${payload}`, error: null as string | null };
    } catch (e) {
      return { payload: '', path: '', error: e instanceof Error ? e.message : 'unknown problem' };
    }
    // `shared` is rebuilt on every render; its parts are what actually change.
  }, [shared?.filingStatus, shared?.children, shared?.earners, shared?.origin, shared?.destination]); // eslint-disable-line react-hooks/exhaustive-deps

  return {
    filingStatus,
    children,
    earners,
    tenure,
    origin,
    destination,
    setEarners,
    setOrigin,
    setDestination,
    applyHousehold,
    applyTenure,
    changeSalary,
    restore,
    bothChosen,
    sameCity,
    result,
    salaryLabels: { here: salary.here, there: salary.there },
    salaryHint,
    share,
    shared,
  };
}
