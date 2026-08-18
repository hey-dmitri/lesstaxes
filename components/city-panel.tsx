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
      className="tnum text-[0.72rem] font-semibold"
      style={{ color: better ? 'var(--good)' : 'var(--bad)' }}
    >
      {formatUSD(amount, { signed: true })}
    </span>
  );
}

/**
 * The fields that only some cities need, shared by both arrangements.
 *
 * Which state inside a metro that crosses a line, the three terms of a
 * mortgage, and the local income taxes that have to be opted into. None of
 * them appear for most comparisons and all of them decide the answer outright
 * for the ones where they do.
 */
function ExtraFields({
  state,
  filingStatus,
  childCount,
  onChange,
}: Pick<Props, 'state' | 'filingStatus' | 'childCount' | 'onChange'>) {
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

  const nothingToAsk =
    m.states.length <= 1 &&
    state.housing.tenure === 'rent' &&
    localGroups.length === 0 &&
    optionalLocals.length === 0;
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
          className="flex flex-col gap-2 rounded-lg border p-3"
          style={{ borderColor: 'var(--accent)', background: 'var(--surface-sunken)' }}
        >
          <Segmented
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
          />
          <span className="text-[0.76rem] leading-snug" style={{ color: 'var(--muted)' }}>
            This metro crosses a state line, and the two sides are not alike. Your state sets the
            income tax, any city tax, and the rent and home prices you are quoted. The gap can be
            large: in the New York metro the two sides differ by more than $170,000 of median home
            value.
          </span>
        </div>
      )}

      {/*
        The three terms of the same purchase, on one line. They were a 2-up
        grid with property tax orphaned underneath, which read as two unrelated
        decisions; the shared note now sits under all three.
      */}
      {state.housing.tenure === 'own' && (
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

      {localGroups.map(({ group, members }) => {
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

      {optionalLocals.length > 0 && (
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

  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <div className="flex items-baseline gap-2">
        <span className="eyebrow">City</span>
        <button
          type="button"
          onClick={onPick}
          aria-expanded={picking}
          className="ml-auto border-b border-dashed text-[0.74rem]"
          style={{ borderColor: 'var(--rule-input)', color: 'var(--muted)' }}
        >
          {picking ? 'done' : 'change'}
        </button>
      </div>
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
      </div>
      {size === 'large' && (
        <span className="truncate text-[0.75rem]" style={{ color: 'var(--faint)' }}>
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
        <p className="text-[0.8rem] leading-snug" style={{ color: 'var(--muted)' }}>
          Any of 387 metro areas, or &ldquo;rest of&rdquo; a state for somewhere rural &mdash; 438
          places in all. Salary, rent and cars fill in with real local figures once you pick.
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
 * A city on the setup screen: the tall card, name set large.
 *
 * Artboard 5a. This card used to end in the city's take-home, living costs and
 * leftover — three figures computed from inputs the reader was still typing.
 * They have moved to the answer screen, where the design puts them, and where
 * they are no longer a spoiler for the button underneath them.
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
  const transport = transportDefaults(state.metroId, undefined, stateCode);
  const household: Household = { filingStatus, children: childCount };
  const bedrooms = bedroomsFor(adultsIn(filingStatus), childCount);
  const suggestedRent = defaultRent(state.metroId, state.grossSalary, household, undefined, stateCode);

  const set = (patch: Partial<CityFormState>) => onChange({ ...state, ...patch });
  const setHousing = (patch: Partial<Housing>) =>
    set({ housing: { ...state.housing, ...patch } as Housing });

  return (
    <Frame highlight={highlight} className="gap-4 px-5 py-4">
      <div className="flex items-center justify-between gap-3">
        <span
          className="eyebrow"
          style={highlight ? { color: 'var(--accent)' } : undefined}
        >
          {title}
        </span>
        <span
          className="shrink-0 rounded-full px-2.5 py-0.5 text-[0.7rem]"
          style={{ background: 'var(--accent-dim)', color: 'var(--accent)' }}
        >
          {stateCode} &middot; {stateTaxBadge(stateCode, filingStatus)}
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
         * Two lines held open in both columns. The sentence is one line in one
         * column and two in the other depending on the city name and whether
         * the salary was typed, and the two panels are separate cards — so
         * without this the rent box, the car stepper and everything below them
         * sit at different heights on the two sides.
         */
        hintLines={2}
        emphasis
        highlight={highlight}
        suffix={
          against ? (
            <Gap amount={state.grossSalary - against.grossSalary} kind="pay" />
          ) : (
            <span className="text-[0.72rem]" style={{ color: 'var(--faint)' }}>
              a year, gross
            </span>
          )
        }
      />

      <div className="grid grid-cols-[minmax(0,1fr)_6rem] items-start gap-2.5">
        {state.housing.tenure === 'rent' ? (
          /*
            "With utilities" is not decoration. The figure behind this box is
            Census GROSS rent, which is the rent plus the gas, electricity,
            water and heating the tenant pays. Somebody who types their rent
            alone, having read a bare "Rent a month", enters a smaller number
            than the one the comparison is built from.
          */
          <MoneyField
            label="Rent a month, with utilities"
            value={state.housing.monthlyRent}
            onChange={(monthlyRent) => setHousing({ monthlyRent })}
            suffix={
              against ? (
                <Gap amount={state.housing.monthlyRent - against.monthlyRent} kind="cost" />
              ) : (
                <span className="text-[0.72rem]" style={{ color: 'var(--faint)' }}>
                  {bedrooms}-bed
                </span>
              )
            }
            hint={
              state.housing.monthlyRent === suggestedRent
                ? `${bedrooms}-bed, typical at this salary. Includes gas, electricity, water and heating.`
                : `${formatUSD(suggestedRent)} typical for ${bedrooms} bed, with utilities`
            }
            hintLines={2}
          />
        ) : (
          <MoneyField
            label="Home price"
            value={state.housing.homePrice}
            onChange={(homePrice) => setHousing({ homePrice })}
            hint={`${formatUSD(homePriceDefault(state.metroId, state.grossSalary, undefined, stateCode))} typical at this salary`}
            hintLines={2}
          />
        )}
        <CountField
          label="Cars"
          value={state.cars}
          onChange={(cars) => set({ cars })}
          hint={`${transport.vehiclesPerAdult.toFixed(2)} per adult`}
          hintLines={2}
        />
      </div>

      <ExtraFields
        state={state}
        filingStatus={filingStatus}
        childCount={childCount}
        onChange={onChange}
      />
    </Frame>
  );
}

/**
 * A city inside the answer screen's "Change anything" panel: one row.
 *
 * Artboard 5c. Same fields, no hints and no prose — the panel is open over an
 * answer the reader is watching change, so every line it costs is a line of
 * the thing they came for.
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
  const set = (patch: Partial<CityFormState>) => onChange({ ...state, ...patch });
  const setHousing = (patch: Partial<Housing>) =>
    set({ housing: { ...state.housing, ...patch } as Housing });

  return (
    <Frame highlight={highlight} className="gap-2.5 px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <span className="eyebrow" style={highlight ? { color: 'var(--accent)' } : undefined}>
          {title}
        </span>
        <span className="text-[0.7rem]" style={{ color: 'var(--muted)' }}>
          {stateCode} &middot; {stateTaxBadge(stateCode, filingStatus)}
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
        <div className="w-[7rem]">
          {state.housing.tenure === 'rent' ? (
            <MoneyField
              label="Rent"
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

      {picking && picker}

      <ExtraFields
        state={state}
        filingStatus={filingStatus}
        childCount={childCount}
        onChange={onChange}
      />
    </Frame>
  );
}
