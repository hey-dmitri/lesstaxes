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
  type CityResult,
} from '@/engine';
import {
  CountField,
  MoneyField,
  PercentField,
  Segmented,
  StepBadge,
  Checkbox,
} from '@/components/fields';
import { LocationPicker } from '@/components/location-picker';
import { stateTaxBadge } from '@/lib/state-badge';

export interface CityFormState extends CityInputs {
  /** Local jurisdictions the user has confirmed, e.g. living inside NYC. */
  localOptIns: Record<string, boolean>;
}

interface Props {
  title: string;
  /** Position in the form: the numbered marker, and the "still to do" accent. */
  step: number;
  /** Asked when no city has been chosen yet, e.g. "Where do you live now?". */
  emptyPrompt: string;
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
  /** Computed figures for this city. The column ends in them. */
  result: CityResult | null;
  /** Copy under take-home, naming the taxes actually paid here. */
  takeHomeNote: React.ReactNode;
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

export function CityPanel({
  title,
  step,
  emptyPrompt,
  state,
  filingStatus,
  childCount,
  tenure,
  onChange,
  onSalaryChange,
  salaryLabel,
  salaryHint,
  result,
  takeHomeNote,
}: Props) {
  const [picking, setPicking] = useState(false);

  const pickerId = `location-${title.replace(/\s+/g, '-').toLowerCase()}`;
  const picker = (
    <LocationPicker
      id={pickerId}
      label="City or area"
      value={state.metroId || null}
      onChange={(metroId) => {
        onChange(
          resetCityForLocation(metroId, state, filingStatus, tenure, childCount),
        );
        setPicking(false);
      }}
    />
  );

  /*
   * No city yet.
   *
   * The form used to open on Chicago and Austin, which made it look like a
   * finished example rather than something waiting on you — people read the
   * answer and left without ever noticing the cities were not theirs. An empty
   * column asks its question outright and shows nothing else, because none of
   * the other fields have a sensible value until a place is chosen.
   */
  if (!state.metroId) {
    return (
      <section
        className="flex flex-col rounded-xl border"
        style={{ borderColor: 'var(--accent)', background: 'var(--surface)' }}
      >
        {/* Same padding as the filled state, so choosing a city does not
            shift the frame the reader is already looking at. */}
        <div className="flex flex-col gap-3 px-4 py-3.5">
          <div className="flex items-center gap-2">
            <StepBadge n={step} />
            <span className="eyebrow">{title}</span>
          </div>
          <h2
            className="font-display text-[1.35rem] font-bold leading-tight tracking-[-0.02em]"
            style={{ color: 'var(--ink)' }}
          >
            {emptyPrompt}
          </h2>
          {picker}
          <p className="text-[0.82rem] leading-snug" style={{ color: 'var(--muted)' }}>
            Any of 387 metro areas, or &ldquo;rest of&rdquo; a state for somewhere rural &mdash;
            438 places in all. Salary, rent and cars fill in with real local figures once you
            pick.
          </p>
        </div>
      </section>
    );
  }

  const m = metro(state.metroId);
  const stateCode = resolveStateCode(state.metroId, state.stateCode);
  const defaults = housingDefaults(state.metroId, undefined, stateCode);
  /*
   * Null only on a share link pinned to a release cut before the survey
   * shipped, where the field holds that release's flat figure and saying which
   * quarter it came from would be a claim about data that release never had.
   */
  const rateSource = mortgageRateSource();
  const transport = transportDefaults(state.metroId, undefined, stateCode);
  const allLocals = localTaxOptions(state.metroId, undefined, stateCode);
  const optionalLocals = allLocals.filter((o) => o.optional && !o.group);
  // Grouped options are alternatives, so they render as one choice rather than
  // as independent checkboxes that could both be ticked or both left clear.
  const localGroups = [...new Set(allLocals.filter((o) => o.group).map((o) => o.group!))].map(
    (group) => ({ group, members: allLocals.filter((o) => o.group === group) }),
  );

  const household: Household = { filingStatus, children: childCount };
  const bedrooms = bedroomsFor(adultsIn(filingStatus), childCount);
  const suggestedRent = defaultRent(state.metroId, state.grossSalary, household, undefined, stateCode);

  const set = (patch: Partial<CityFormState>) => onChange({ ...state, ...patch });
  const setHousing = (patch: Partial<Housing>) =>
    set({ housing: { ...state.housing, ...patch } as Housing });

  const badge = stateTaxBadge(stateCode, filingStatus);
  const livingTotal = result ? result.housing.total + result.living.total + result.salesTax : 0;

  return (
    <section
      className="flex flex-col rounded-xl border"
      style={{ borderColor: 'var(--rule-strong)', background: 'var(--surface)' }}
    >
      {/*
        Padding and type step down a little from what they were, because the
        column itself did: the two cities share half the width on a wide screen
        now rather than 60% of it. Every pixel taken off the frame here is a
        pixel the three mortgage fields keep, and they have to stay on one line.
      */}
      <div className="flex shrink-0 flex-col gap-3 px-4 pt-3.5">
        <div className="flex items-center gap-2">
          <StepBadge n={step} done />
          <span className="eyebrow">{title}</span>
          <span
            className="ml-auto rounded-full px-2.5 py-0.5 text-[0.7rem]"
            style={{ background: 'var(--accent-dim)', color: 'var(--accent)' }}
          >
            {stateCode} &middot; {badge}
          </span>
        </div>

        {/*
          The city is the loudest thing in the column, with the picker folded
          away behind "change" — once you have chosen it, the name is what you
          want to see, not a search field.
        */}
        <div
          className="flex items-baseline gap-2 border-b pb-3"
          style={{ borderColor: 'var(--rule)' }}
        >
          {/*
            Sized to the narrower column. "Louisville/Jefferson County" and
            "Rest of District of Columbia" are real entries in this list, and
            they share the line with the state code and the change button, so
            the name has to give way before the row does.
          */}
          <h2
            className="font-display text-[1.5rem] font-bold leading-none tracking-[-0.03em] xl:text-[1.7rem]"
            style={{ color: 'var(--ink)' }}
          >
            {m.shortName.replace(/,.*$/, '')}
          </h2>
          <span className="text-sm" style={{ color: 'var(--muted)' }}>
            {stateCode}
          </span>
          <button
            type="button"
            onClick={() => setPicking((v) => !v)}
            aria-expanded={picking}
            className="ml-auto border-b border-dashed text-[0.8rem]"
            style={{ borderColor: 'var(--rule-input)', color: 'var(--muted)' }}
          >
            {picking ? 'done' : 'change'}
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-2.5 px-4 py-3 lg:flex-1">
        {picking && picker}

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
            {/*
              Both halves of this were true when it was written and neither is
              now. Rent and home prices ARE sliced by state part — that landed
              with 2026.5 — and there is no separate sales tax line to set,
              because the spending basket already contains it. Stale help is
              worse than none: it tells the reader the tool is doing something
              it is not.
            */}
            <span className="text-[0.76rem] leading-snug" style={{ color: 'var(--muted)' }}>
              This metro crosses a state line, and the two sides are not alike. Your state sets
              the income tax, any city tax, and the rent and home prices you are quoted. The gap
              can be large: in the New York metro the two sides differ by more than $170,000 of
              median home value.
            </span>
          </div>
        )}

        <MoneyField
          label={salaryLabel}
          value={state.grossSalary}
          onChange={onSalaryChange}
          hint={salaryHint}
          /*
           * Two lines held open in both columns. The sentence is one line in
           * one column and two in the other depending on the city name and
           * whether the salary was typed, and the two panels are separate
           * cards — so without this the rent box, the car stepper and every
           * figure below them sit at different heights on the two sides.
           */
          hintLines={2}
          emphasis
        />

        {state.housing.tenure === 'rent' ? (
          /*
            "With utilities" is not decoration. The figure behind this box is
            Census GROSS rent, which is the rent plus the gas, electricity,
            water and heating the tenant pays. Somebody who types their rent
            alone, having read a bare "Rent a month", enters a smaller number
            than the one the comparison is built from — and the site used to
            charge those utilities a second time on top, which is what this
            whole change is undoing.
          */
          <MoneyField
            label="Rent a month, with utilities"
            value={state.housing.monthlyRent}
            onChange={(monthlyRent) => setHousing({ monthlyRent })}
            hint={
              state.housing.monthlyRent === suggestedRent
                ? `${bedrooms}-bed, typical at this salary. Includes gas, electricity, water and heating.`
                : `${formatUSD(suggestedRent)} typical for ${bedrooms} bed, with utilities`
            }
          />
        ) : (
          <>
            <MoneyField
              label="Home price"
              value={state.housing.homePrice}
              onChange={(homePrice) => setHousing({ homePrice })}
              hint={`${formatUSD(homePriceDefault(state.metroId, state.grossSalary, undefined, stateCode))} typical at this salary`}
            />
            {/*
              The three terms of the same purchase, on one line. They were a
              2-up grid with property tax orphaned underneath, which read as two
              unrelated decisions; the shared note now sits under all three.
            */}
            <div>
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
                   * SAID PLAINLY, INCLUDING THE PART THAT IS NOT FLATTERING.
                   * Every other figure on this site comes from a federal
                   * source and can be traced to it. This one cannot: it is a
                   * round starting number, and pretending otherwise here —
                   * where a reader has come to ask exactly that — would be the
                   * one place the site lied about its own provenance.
                   */
                  info={
                    <>
                      {rateSource ? (
                        <>
                          The US average for a 30-year fixed loan across{' '}
                          {rateSource.quarter}, from Freddie Mac&rsquo;s weekly survey. Yours
                          depends on your credit and your lender.
                        </>
                      ) : (
                        <>
                          A starting figure for a 30-year fixed loan. Yours depends on your credit
                          and your lender.
                        </>
                      )}
                    </>
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
                      <strong>{(defaults.effectivePropertyTaxRate * 100).toFixed(2)}%</strong> is
                      the <em>effective</em> rate here &mdash; what owners actually pay, worked out
                      as the median property tax bill over the median home value in this area
                      (Census ACS). That is more honest than a headline millage rate, which ignores
                      assessment ratios, homestead exemptions and caps. Your own bill turns on your
                      assessment.
                    </>
                  }
                />
              </div>
            </div>
          </>
        )}

        <CountField
          label="Cars"
          value={state.cars}
          onChange={(cars) => set({ cars })}
          hint={`${transport.vehiclesPerAdult.toFixed(2)} per adult here`}
        />

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

        {/*
          The money summary, pinned to the bottom of the column. Take-home is
          the anchor — a figure people recognise from a payslip — and living
          costs are then visibly subtracted from it to reach what is left.
        */}
        {result && (
          <div
            className="mt-auto flex flex-col gap-2.5 border-t pt-3.5"
            style={{ borderColor: 'var(--rule)' }}
          >
            <div className="flex flex-col gap-0.5">
              <span className="eyebrow">Take-home after tax</span>
              <div className="flex items-baseline gap-2">
                <span
                  className="tnum text-[1.6rem] font-semibold leading-none"
                  style={{ color: 'var(--ink)' }}
                >
                  {formatUSD(result.takeHome)}
                </span>
                <span className="text-[0.82rem]" style={{ color: 'var(--muted)' }}>
                  &middot; <span className="tnum">{formatUSD(result.takeHome / 12)}</span>/mo
                </span>
              </div>
              {/*
                Two lines held open, for the same reason the salary hint holds
                two: this line names the taxes actually paid, so it is longer
                in a state with an income tax and a disability contribution
                than in one with neither — and the two columns are separate
                cards, so a line that wraps on one side and not the other puts
                every figure below it out of step.
              */}
              <span
                className="text-[0.76rem] leading-snug"
                style={{ color: 'var(--faint)', minHeight: '2.75em' }}
              >
                {takeHomeNote}
              </span>
            </div>

            {/*
              Laid out like the two figures it sits between, rather than as a
              label on the left with its number pushed to the right margin.
              Three money figures make a subtraction only if the eye can run
              straight down them; one of them flung to the opposite edge broke
              the column and turned the sum into three unrelated rows.
            */}
            <div className="flex flex-col gap-0.5">
              <span className="eyebrow">Typical living costs</span>
              <div className="flex items-baseline gap-2">
                <span
                  className="tnum text-[1.6rem] font-semibold leading-none"
                  style={{ color: 'var(--bad)' }}
                >
                  &minus;{formatUSD(livingTotal)}
                </span>
                <span className="text-[0.82rem]" style={{ color: 'var(--muted)' }}>
                  &middot; <span className="tnum">{formatUSD(livingTotal / 12)}</span>/mo
                </span>
              </div>
              {/*
                This said "Living costs" over a single lump figure, which reads
                as a statement about the reader: here is what you spend. Only
                the housing half is theirs — they typed it. The rest is a
                national spending basket re-priced for this metro and scaled to
                a household of this size and income, which is a good answer to
                "what do people like you spend here" and no answer at all to
                "what do YOU spend". Somebody who cooks at home and cycles will
                beat it, and should be told so rather than left to conclude the
                site is wrong about them.
              */}
              <span className="text-[0.76rem] leading-snug" style={{ color: 'var(--faint)' }}>
                Your housing, plus what a household your size usually spends here. Not your own
                budget.
              </span>
            </div>

            <div
              className="flex flex-col gap-0.5 border-t pt-2.5"
              style={{ borderColor: 'var(--rule-strong)' }}
            >
              <span className="eyebrow" style={{ color: 'var(--muted)' }}>
                What&rsquo;s left over, a year
              </span>
              <div className="flex items-baseline gap-2">
                <span
                  className="tnum text-[2rem] font-bold leading-none"
                  style={{ color: result.leftover >= 0 ? 'var(--accent)' : 'var(--bad)' }}
                >
                  {formatUSD(result.leftover)}
                </span>
                <span className="text-[0.87rem]" style={{ color: 'var(--muted)' }}>
                  <span className="tnum">{formatUSD(result.leftover / 12)}</span>/mo
                </span>
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
