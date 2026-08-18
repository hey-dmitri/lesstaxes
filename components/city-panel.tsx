'use client';

import { useState } from 'react';

import {
  bedroomsFor,
  defaultCarCount,
  adultsIn,
  defaultMortgageRate,
  defaultRent,
  defaultSalaryFor,
  mortgageRateSource,
  formatUSD,
  homePriceDefault,
  housingDefaults,
  localTaxOptions,
  metro,
  resolveStateCode,
  transportDefaults,
  type CityInputs,
  type FilingStatus,
  type Household,
  type Housing,
} from '@/engine';
import {
  CountField,
  MoneyField,
  PercentField,
  Segmented,
  Checkbox,
} from '@/components/fields';
import { LocationPicker } from '@/components/location-picker';
import { stateTaxBadge } from '@/lib/state-badge';

export interface CityFormState extends CityInputs {
  /** Local jurisdictions the user has confirmed, e.g. living inside NYC. */
  localOptIns: Record<string, boolean>;
}

/**
 * Housing defaults for a metro.
 *
 * Rent now depends on the household and the salary as well as the place: a
 * family of four is quoted a larger unit than a single person, and a high
 * earner is quoted what high earners actually pay rather than the median across
 * the entire rental stock.
 */
export function housingFor(
  metroId: string,
  tenure: 'rent' | 'own',
  salary: number,
  household: Household,
  stateCode?: string,
): Housing {
  const h = housingDefaults(metroId, undefined, stateCode);
  return tenure === 'rent'
    ? { tenure: 'rent', monthlyRent: defaultRent(metroId, salary, household, undefined, stateCode) }
    : {
        tenure: 'own',
        homePrice: homePriceDefault(metroId, salary, undefined, stateCode),
        downPayment: 0.2,
        mortgageRate: defaultMortgageRate(),
        propertyTaxRate: h.effectivePropertyTaxRate,
      };
}

/**
 * Whether the salary in the box is still the one the site put there.
 *
 * The same test rent and cars already use: a field is a prefill until it does
 * not match what we would have filled in. Somebody who types the local median
 * to the dollar is treated as not having typed it, which costs them nothing —
 * the next city fills in its own figure, which is what they would have wanted.
 */
export function salaryIsPrefill(state: { metroId: string; grossSalary: number }): boolean {
  return state.grossSalary === defaultSalaryFor(state.metroId || undefined);
}

/** Everything that must be re-derived when the location or household changes. */
export function resetCityForLocation(
  metroId: string,
  previous: { metroId: string; grossSalary: number },
  filingStatus: FilingStatus,
  tenure: 'rent' | 'own',
  children = 0,
  stateCode?: string,
): CityFormState {
  // Defaults to the metro's primary state. For the 43 that straddle a state
  // line the panel then asks, because that choice decides the whole state and
  // local tax system and the sales tax rate.
  const state = resolveStateCode(metroId, stateCode);
  const options = localTaxOptions(metroId, undefined, state);
  /*
   * THE SALARY FOLLOWS THE PLACE, unless it was typed.
   *
   * A national median standing in for 438 local ones is wrong nearly
   * everywhere, and it does not stop at the salary line: rent and the house
   * price are both scaled by whatever is in this box, so a national figure in
   * a cheap metro also quoted a home nobody there on that pay would look at.
   *
   * Anything typed by hand survives the change of city, exactly as a typed
   * rent does. That is the case that matters most — somebody comparing their
   * own offer against their own pay.
   */
  const salary = salaryIsPrefill(previous) ? defaultSalaryFor(metroId) : previous.grossSalary;
  return {
    metroId,
    stateCode: state,
    grossSalary: salary,
    cars: defaultCarCount(metroId, filingStatus, undefined, state),
    housing: housingFor(metroId, tenure, salary, { filingStatus, children }, state),
    localOptIns: Object.fromEntries(options.map((o) => [o.jurisdictionId, o.defaultApplies])),
  };
}

/**
 * The two screens ask for the same things and are laid out nothing alike.
 *
 * The setup screen (Turn 5, artboard 5a) gives each city a tall card with the
 * name set large, because choosing the two places is the whole job of that
 * screen. The answer screen's "Change anything" panel (5c) puts the same
 * fields in a single row per city, because the answer is behind it and the
 * panel is borrowing the reader's attention rather than holding it.
 *
 * One component, two arrangements. Splitting them into two files was the first
 * attempt and it went wrong immediately: the state question for a metro that
 * crosses a line, the three mortgage terms and the local income tax opt-ins
 * are fiddly, easy to forget, and have to be reachable on BOTH screens or the
 * answer screen quietly cannot express inputs the setup screen can.
 */
interface Props {
  /** "Living now" or "Moving to". */
  title: string;
  /** Asked when no city has been chosen yet, e.g. "Where do you live now?". */
  emptyPrompt: string;
  /**
   * The column being considered reads greener. It is not decoration: the two
   * cards are otherwise identical and the reader has to know at a glance which
   * one is the move.
   */
  highlight?: boolean;
  state: CityFormState;
  filingStatus: FilingStatus;
  childCount: number;
  /**
   * Renting or buying, from the "About you" sentence.
   *
   * Passed in rather than read off state.housing, because a column with no
   * city has no housing figures to read it from — and the choice can be made
   * before either city exists.
   */
  tenure: 'rent' | 'own';
  onChange: (next: CityFormState) => void;
  /** Salary is handled by the parent, which keeps an untouched rent in step. */
  onSalaryChange: (salary: number) => void;
  salaryLabel: string;
  salaryHint?: React.ReactNode;
  /**
   * The other city's figures, so this column can print the gap beside its own.
   *
   * Only the destination gets one. "−$10,000" beside the salary and "−$270"
   * beside the rent are the two facts a reader is trying to hold in their head
   * while they fill this in, and making them subtract two boxes themselves is
   * the sort of small tax that loses people before they reach the answer.
   */
  against?: { grossSalary: number; monthlyRent: number } | null;
}

/** The pin that marks a chosen place. */
function PinIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="var(--muted)"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="shrink-0"
    >
      <path d="M12 21s7-5.7 7-11a7 7 0 1 0-14 0c0 5.3 7 11 7 11z" />
      <circle cx="12" cy="10" r="2.6" />
    </svg>
  );
}

/**
 * A signed gap against the other city, coloured by which way it points.
 *
 * Costs and pay run opposite ways: $270 less rent is good news, $10,000 less
 * salary is not. `kind` says which of the two this is rather than letting the
 * sign decide, because the sign alone cannot know.
 */
function Gap({ amount, kind }: { amount: number; kind: 'pay' | 'cost' }) {
  if (Math.abs(amount) < 1) return null;
  const better = kind === 'pay' ? amount > 0 : amount < 0;
  return (
    <span
      className="tnum text-[0.8rem] font-semibold"
      style={{ color: better ? 'var(--good)' : 'var(--bad)' }}
    >
      {formatUSD(amount, { signed: true })}
    </span>
  );
}

/**
 * The fields that only some cities need.
 *
 * Which state inside a metro that crosses a line, the three terms of a
 * mortgage, and the local income taxes that have to be opted into. None of
 * them appear for most comparisons and all of them decide the answer outright
 * for the ones where they do.
 *
 * `scope` splits them across the two screens the same way everything else is
 * split. The setup screen asks only WHERE — and the state question is part of
 * where, because Newark and Manhattan are one metro here and two completely
 * different tax bills. Everything to do with money and housing waits for the
 * answer screen, where it can be changed against a figure that moves.
 */
function ExtraFields({
  state,
  filingStatus,
  childCount,
  onChange,
  scope,
}: Pick<Props, 'state' | 'filingStatus' | 'childCount' | 'onChange'> & {
  scope: 'place' | 'everything';
}) {
  const m = metro(state.metroId);
  const stateCode = resolveStateCode(state.metroId, state.stateCode);
  const defaults = housingDefaults(state.metroId, undefined, stateCode);
  /*
   * Null only on a share link pinned to a release cut before the survey
   * shipped, where the field holds that release's flat figure and saying which
   * quarter it came from would be a claim about data that release never had.
   */
  const rateSource = mortgageRateSource();
  const allLocals = localTaxOptions(state.metroId, undefined, stateCode);
  const optionalLocals = allLocals.filter((o) => o.optional && !o.group);
  // Grouped options are alternatives, so they render as one choice rather than
  // as independent checkboxes that could both be ticked or both left clear.
  const localGroups = [...new Set(allLocals.filter((o) => o.group).map((o) => o.group!))].map(
    (group) => ({ group, members: allLocals.filter((o) => o.group === group) }),
  );

  const set = (patch: Partial<CityFormState>) => onChange({ ...state, ...patch });
  const setHousing = (patch: Partial<Housing>) =>
    set({ housing: { ...state.housing, ...patch } as Housing });

  const askDetails = scope === 'everything';
  const nothingToAsk =
    m.states.length <= 1 &&
    (!askDetails ||
      (state.housing.tenure === 'rent' && localGroups.length === 0 && optionalLocals.length === 0));
  if (nothingToAsk) return null;

  return (
    <div className="flex flex-col gap-2.5">
      {/*
        The state question, for the 43 locations that straddle a state line.
        It comes first because it decides more than anything else below it:
        the whole state income tax system, which local city taxes can reach
        you, and the sales tax rate. Newark and Manhattan are one metro here
        and two completely different tax bills.
      */}
      {m.states.length > 1 && (
        <div
          className="rounded-lg border px-3 py-2"
          style={{ borderColor: 'var(--accent)', background: 'var(--surface-sunken)' }}
        >
          <Segmented
            compact
            label="Which state do you live in?"
            value={stateCode}
            onChange={(next) =>
              onChange(
                resetCityForLocation(
                  state.metroId,
                  state,
                  filingStatus,
                  state.housing.tenure,
                  childCount,
                  next,
                ),
              )
            }
            options={m.states.map((s) => ({ value: s, label: s }))}
            info={
              <>
                This metro crosses a state line, and the two sides are not alike. Your state sets
                the income tax, any city tax, and the rent and home prices you are quoted. The gap
                can be large: in the New York metro the two sides differ by more than $170,000 of
                median home value.
              </>
            }
          />
        </div>
      )}

      {/*
        The three terms of the same purchase, on one line. They were a 2-up
        grid with property tax orphaned underneath, which read as two unrelated
        decisions; the shared note now sits under all three.
      */}
      {askDetails && state.housing.tenure === 'own' && (
        <div className="grid grid-cols-3 items-end gap-1.5">
          <PercentField
            label="Down payment"
            value={state.housing.downPayment}
            onChange={(downPayment) => setHousing({ downPayment })}
            step={1}
            compact
          />
          <PercentField
            label="Mortgage rate"
            value={state.housing.mortgageRate}
            onChange={(mortgageRate) => setHousing({ mortgageRate })}
            max={25}
            step={0.05}
            compact
            /*
             * SAID PLAINLY, INCLUDING THE PART THAT IS NOT FLATTERING. Every
             * other figure on this site comes from a federal source and can be
             * traced to it. This one cannot: it is a round starting number, and
             * pretending otherwise here — where a reader has come to ask exactly
             * that — would be the one place the site lied about its provenance.
             */
            info={
              rateSource ? (
                <>
                  The US average for a 30-year fixed loan across {rateSource.quarter}, from Freddie
                  Mac&rsquo;s weekly survey. Yours depends on your credit and your lender.
                </>
              ) : (
                <>
                  A starting figure for a 30-year fixed loan. Yours depends on your credit and your
                  lender.
                </>
              )
            }
          />
          <PercentField
            label="Property tax"
            value={state.housing.propertyTaxRate}
            onChange={(propertyTaxRate) => setHousing({ propertyTaxRate })}
            max={10}
            step={0.01}
            compact
            info={
              <>
                <strong>{(defaults.effectivePropertyTaxRate * 100).toFixed(2)}%</strong> is the{' '}
                <em>effective</em> rate here &mdash; what owners actually pay, worked out as the
                median property tax bill over the median home value in this area (Census ACS). That
                is more honest than a headline millage rate, which ignores assessment ratios,
                homestead exemptions and caps. Your own bill turns on your assessment.
              </>
            }
          />
        </div>
      )}

      {askDetails &&
        localGroups.map(({ group, members }) => {
        const selected =
          members.find((mem) => state.localOptIns[mem.jurisdictionId] === true) ??
          members.find((mem) => mem.defaultApplies)!;
        return (
          <Segmented
            key={group}
            label="Where in this metro"
            value={selected.jurisdictionId}
            onChange={(jurisdictionId) =>
              set({
                localOptIns: {
                  ...state.localOptIns,
                  ...Object.fromEntries(
                    members.map((mem) => [mem.jurisdictionId, mem.jurisdictionId === jurisdictionId]),
                  ),
                },
              })
            }
            options={members.map((mem) => ({
              value: mem.jurisdictionId,
              label: mem.label ?? mem.jurisdictionId,
            }))}
          />
        );
      })}

      {askDetails && optionalLocals.length > 0 && (
        <div
          className="flex flex-col gap-2 rounded-lg border p-3"
          style={{ borderColor: 'var(--rule)', background: 'var(--surface-sunken)' }}
        >
          <span className="eyebrow">Local income tax</span>
          {optionalLocals.map((option) => (
            <Checkbox
              key={option.jurisdictionId}
              label={option.prompt ?? option.jurisdictionId}
              checked={state.localOptIns[option.jurisdictionId] ?? false}
              onChange={(checked) =>
                set({ localOptIns: { ...state.localOptIns, [option.jurisdictionId]: checked } })
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}

/** The card frame both arrangements sit in. */
function Frame({
  highlight,
  className = '',
  children,
}: {
  highlight?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      className={`flex flex-col rounded-xl border ${className}`}
      style={{
        borderColor: highlight ? 'var(--picked-rule)' : 'var(--rule-strong)',
        background: highlight ? 'var(--picked)' : 'var(--surface-raised)',
      }}
    >
      {children}
    </section>
  );
}

/** The name of the chosen place, with the picker folded away behind "change". */
function ChosenCity({
  state,
  picking,
  onPick,
  size,
}: {
  state: CityFormState;
  picking: boolean;
  onPick: () => void;
  size: 'large' | 'small';
}) {
  const m = metro(state.metroId);
  const stateCode = resolveStateCode(state.metroId, state.stateCode);

  const change = (
    <button
      type="button"
      onClick={onPick}
      aria-expanded={picking}
      className="shrink-0 border-b border-dashed text-[0.82rem]"
      style={{ borderColor: 'var(--rule-input)', color: 'var(--muted)' }}
    >
      {picking ? 'done' : 'change'}
    </button>
  );

  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      {/*
        No "CITY" label on the tall card. The box has a map pin in it and a
        place name set at 1.4rem — nothing about it needs saying, and the label
        row cost a line of the one screen this page is supposed to fit in. The
        compact row keeps its label, where the box is small enough to be
        mistaken for anything.
      */}
      {size === 'small' && (
        <div className="flex items-baseline gap-2">
          <span className="eyebrow">City</span>
          <span className="ml-auto">{change}</span>
        </div>
      )}
      <div
        className={`flex items-center gap-2 rounded-[0.6rem] border ${
          size === 'large' ? 'px-3.5 py-3' : 'px-3 py-2'
        }`}
        style={{ background: 'var(--ground)', borderColor: 'var(--rule-input)' }}
      >
        <PinIcon />
        <span
          className={`truncate font-display font-bold tracking-[-0.02em] ${
            size === 'large' ? 'text-[1.4rem]' : 'text-[1rem]'
          }`}
          style={{ color: 'var(--ink)' }}
        >
          {/*
            The state comes off the name and back on separately, because for
            the 43 metros that cross a line the two can differ: the New York
            metro is named NY and the reader may have said they live in NJ.
            Printing the name as published would have told them otherwise.
          */}
          {m.shortName.replace(/,.*$/, '')}
          <span className="pl-1.5 font-sans text-[0.8em] font-normal" style={{ color: 'var(--muted)' }}>
            {stateCode}
          </span>
        </span>
        {size === 'large' && <span className="ml-auto">{change}</span>}
      </div>
      {size === 'large' && (
        <span className="truncate text-[0.84rem]" style={{ color: 'var(--faint)' }}>
          {m.name}
        </span>
      )}
    </div>
  );
}

/** Nothing chosen yet: the question, and the field that answers it. */
function EmptyCity({
  title,
  emptyPrompt,
  picker,
  compact,
}: {
  title: string;
  emptyPrompt: string;
  picker: React.ReactNode;
  compact: boolean;
}) {
  return (
    <Frame className={compact ? 'gap-2.5 px-4 py-3' : 'gap-3 px-5 py-4'}>
      <span className="eyebrow">{title}</span>
      <h3
        className={`font-display font-bold leading-tight tracking-[-0.02em] ${
          compact ? 'text-[1.05rem]' : 'text-[1.35rem]'
        }`}
        style={{ color: 'var(--ink)' }}
      >
        {emptyPrompt}
      </h3>
      {picker}
      {!compact && (
        <p className="text-[0.88rem] leading-snug" style={{ color: 'var(--muted)' }}>
          387 metro areas, or &ldquo;rest of&rdquo; a state for somewhere rural &mdash; 438 places.
        </p>
      )}
    </Frame>
  );
}

/** Shared plumbing: the picker, and the two housing/car fields. */
function useCityFields(props: Props) {
  const { state, filingStatus, childCount, tenure, onChange } = props;
  const [picking, setPicking] = useState(false);

  const pickerId = `location-${props.title.replace(/\s+/g, '-').toLowerCase()}`;
  const picker = (
    <LocationPicker
      id={pickerId}
      label="City or area"
      value={state.metroId || null}
      onChange={(metroId) => {
        onChange(resetCityForLocation(metroId, state, filingStatus, tenure, childCount));
        setPicking(false);
      }}
    />
  );

  return { picking, setPicking, picker };
}

/**
 * A city on the setup screen: the place, and what it pays.
 *
 * Artboard 5a. Two rounds of things have left this card, and both left for the
 * same reason — the setup screen asks one question, WHERE, and everything it
 * asks besides that is a reason not to answer.
 *
 * First went take-home, living costs and leftover: three figures computed from
 * inputs the reader was still typing, printed directly above the button that
 * offers to compute them. They are on the answer screen now.
 *
 * Then went rent, cars, the home price and the three mortgage terms. They are
 * all prefilled from real local figures, so nobody has to touch them to get a
 * true answer — and every one of them is a box asking to be checked, on the
 * screen where the reader has the least reason to care and the least idea what
 * a good answer looks like. They are on the answer screen too, behind "Change
 * anything", where the figure moves as you change them and the question
 * "should I put my real rent in?" has a visible point.
 *
 * What is left is the city and the salary, which are the only two things this
 * site cannot derive for you.
 */
export function CityCard(props: Props) {
  const {
    title,
    emptyPrompt,
    highlight,
    state,
    filingStatus,
    childCount,
    onChange,
    onSalaryChange,
    salaryLabel,
    salaryHint,
    against,
  } = props;
  const { picking, setPicking, picker } = useCityFields(props);

  if (!state.metroId) {
    return <EmptyCity title={title} emptyPrompt={emptyPrompt} picker={picker} compact={false} />;
  }

  const stateCode = resolveStateCode(state.metroId, state.stateCode);

  return (
    <Frame highlight={highlight} className="gap-2.5 px-5 py-3">
      <div className="flex items-center justify-between gap-3">
        <span
          className="eyebrow"
          style={highlight ? { color: 'var(--accent)' } : undefined}
        >
          {title}
        </span>
        <span
          className="shrink-0 rounded-full px-3 py-1 text-[0.82rem] font-medium"
          style={{ background: 'var(--accent-dim)', color: 'var(--accent)' }}
        >
          {stateTaxBadge(stateCode, filingStatus)}
        </span>
      </div>

      <ChosenCity state={state} picking={picking} onPick={() => setPicking((v) => !v)} size="large" />
      {picking && picker}

      <MoneyField
        label={salaryLabel}
        value={state.grossSalary}
        onChange={onSalaryChange}
        hint={salaryHint}
        /*
         * No reserved second line any more. It existed because the rent box,
         * the car stepper and three money figures sat underneath and had to
         * stay level across two separate cards. All of that is on the answer
         * screen now, so a hint that wraps in one column and not the other
         * costs nothing — and holding a blank line open in both cost a line of
         * the one screen this page has to fit in.
         */
        emphasis
        highlight={highlight}
        suffix={
          against ? (
            <Gap amount={state.grossSalary - against.grossSalary} kind="pay" />
          ) : (
            <span className="text-[0.8rem]" style={{ color: 'var(--faint)' }}>
              a year, gross
            </span>
          )
        }
      />

      <ExtraFields
        state={state}
        filingStatus={filingStatus}
        childCount={childCount}
        onChange={onChange}
        scope="place"
      />
    </Frame>
  );
}

/**
 * A city inside the answer screen's "Change anything" panel: one row.
 *
 * Artboard 5c, plus the fields the setup screen handed over. Rent, cars, the
 * home price and the three mortgage terms are only asked here now, so this is
 * the only place their explanations can live — and they are not decoration.
 * "Rent a month" alone gets a smaller number than the comparison is built
 * from: the figure behind the box is Census GROSS rent, which already contains
 * the gas, electricity, water and heating. One line under the row, rather than
 * a note under each box, because the panel is open over an answer the reader
 * is watching change and every line it costs is a line of that answer.
 */
export function CityRow(props: Props) {
  const {
    title,
    emptyPrompt,
    highlight,
    state,
    filingStatus,
    childCount,
    onChange,
    onSalaryChange,
    salaryLabel,
    against,
  } = props;
  const { picking, setPicking, picker } = useCityFields(props);

  if (!state.metroId) {
    return <EmptyCity title={title} emptyPrompt={emptyPrompt} picker={picker} compact />;
  }

  const stateCode = resolveStateCode(state.metroId, state.stateCode);
  const household: Household = { filingStatus, children: childCount };
  const bedrooms = bedroomsFor(adultsIn(filingStatus), childCount);
  const suggestedRent = defaultRent(state.metroId, state.grossSalary, household, undefined, stateCode);
  const suggestedPrice = homePriceDefault(state.metroId, state.grossSalary, undefined, stateCode);
  const transport = transportDefaults(state.metroId, undefined, stateCode);

  const set = (patch: Partial<CityFormState>) => onChange({ ...state, ...patch });
  const setHousing = (patch: Partial<Housing>) =>
    set({ housing: { ...state.housing, ...patch } as Housing });

  return (
    <Frame highlight={highlight} className="gap-2.5 px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <span className="eyebrow" style={highlight ? { color: 'var(--accent)' } : undefined}>
          {title}
        </span>
        <span className="text-[0.8rem]" style={{ color: 'var(--muted-strong)' }}>
          {stateTaxBadge(stateCode, filingStatus)}
        </span>
      </div>

      <div className="flex flex-wrap items-end gap-2.5">
        <div className="min-w-[9rem] flex-1">
          <ChosenCity
            state={state}
            picking={picking}
            onPick={() => setPicking((v) => !v)}
            size="small"
          />
        </div>
        <div className="min-w-[8rem] flex-1">
          <MoneyField
            label={salaryLabel}
            value={state.grossSalary}
            onChange={onSalaryChange}
            highlight={highlight}
            suffix={against ? <Gap amount={state.grossSalary - against.grossSalary} kind="pay" /> : undefined}
          />
        </div>
        <div className="w-[8rem]">
          {state.housing.tenure === 'rent' ? (
            <MoneyField
              label="Rent a month"
              value={state.housing.monthlyRent}
              onChange={(monthlyRent) => setHousing({ monthlyRent })}
            />
          ) : (
            <MoneyField
              label="Home price"
              value={state.housing.homePrice}
              onChange={(homePrice) => setHousing({ homePrice })}
            />
          )}
        </div>
        <div className="w-[6.5rem]">
          <CountField label="Cars" value={state.cars} onChange={(cars) => set({ cars })} />
        </div>
      </div>

      {/*
        What the two prefills are, in one line. "With utilities" is the half
        that matters: the rent figure behind that box is Census GROSS rent, so
        somebody who reads a bare "Rent a month" and types their rent alone
        enters a smaller number than the comparison is built from — and the
        site used to charge those utilities a second time on top.
      */}
      <p className="text-[0.84rem] leading-snug" style={{ color: 'var(--muted)' }}>
        {state.housing.tenure === 'rent' ? (
          <>
            Rent here is {formatUSD(suggestedRent)} for a {bedrooms}-bed at this salary, with gas,
            electricity, water and heating in it.
          </>
        ) : (
          <>A {formatUSD(suggestedPrice)} home is typical at this salary here.</>
        )}{' '}
        Households here run {transport.vehiclesPerAdult.toFixed(2)} cars per adult.
      </p>

      {picking && picker}

      <ExtraFields
        state={state}
        filingStatus={filingStatus}
        childCount={childCount}
        onChange={onChange}
        scope="everything"
      />
    </Frame>
  );
}
