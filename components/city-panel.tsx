'use client';

import { useState } from 'react';

import {
  bedroomsFor,
  defaultCarCount,
  adultsIn,
  defaultRent,
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
  PrefillNote,
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
): Housing {
  const h = housingDefaults(metroId);
  return tenure === 'rent'
    ? { tenure: 'rent', monthlyRent: defaultRent(metroId, salary, household) }
    : {
        tenure: 'own',
        homePrice: homePriceDefault(metroId, salary, undefined),
        downPayment: 0.2,
        mortgageRate: 0.068,
        propertyTaxRate: h.effectivePropertyTaxRate,
      };
}

/** Everything that must be re-derived when the location or household changes. */
export function resetCityForLocation(
  metroId: string,
  salary: number,
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
  return {
    metroId,
    stateCode: state,
    grossSalary: salary,
    cars: defaultCarCount(metroId, filingStatus),
    housing: housingFor(metroId, tenure, salary, { filingStatus, children }),
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
          resetCityForLocation(metroId, state.grossSalary, filingStatus, tenure, childCount),
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
        <div className="flex flex-col gap-3 px-5 py-4">
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
            Any of 438 metro areas, or &ldquo;rest of&rdquo; a state for somewhere rural. Salary,
            rent and cars fill in with real local figures once you pick.
          </p>
        </div>
      </section>
    );
  }

  const m = metro(state.metroId);
  const defaults = housingDefaults(state.metroId);
  const transport = transportDefaults(state.metroId);
  const stateCode = resolveStateCode(state.metroId, state.stateCode);
  const allLocals = localTaxOptions(state.metroId, undefined, stateCode);
  const optionalLocals = allLocals.filter((o) => o.optional && !o.group);
  // Grouped options are alternatives, so they render as one choice rather than
  // as independent checkboxes that could both be ticked or both left clear.
  const localGroups = [...new Set(allLocals.filter((o) => o.group).map((o) => o.group!))].map(
    (group) => ({ group, members: allLocals.filter((o) => o.group === group) }),
  );

  const household: Household = { filingStatus, children: childCount };
  const bedrooms = bedroomsFor(adultsIn(filingStatus), childCount);
  const suggestedRent = defaultRent(state.metroId, state.grossSalary, household);

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
      <div className="flex shrink-0 flex-col gap-3 px-5 pt-4">
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
          <h2
            className="font-display text-[1.9rem] font-bold leading-none tracking-[-0.03em]"
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

      <div className="flex flex-col gap-3 px-5 py-3.5 lg:flex-1">
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
                    state.grossSalary,
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
              This metro crosses a state line. Your state sets the income tax, the sales tax and
              which city taxes can apply. Rent and living costs stay metro-wide &mdash; the Census
              does not publish them by state slice.
            </span>
          </div>
        )}

        <MoneyField
          label={salaryLabel}
          value={state.grossSalary}
          onChange={onSalaryChange}
          hint={salaryHint}
          emphasis
        />

        {state.housing.tenure === 'rent' ? (
          <MoneyField
            label="Rent a month"
            value={state.housing.monthlyRent}
            onChange={(monthlyRent) => setHousing({ monthlyRent })}
            hint={
              state.housing.monthlyRent === suggestedRent
                ? `${bedrooms}-bed, typical at this salary`
                : `${formatUSD(suggestedRent)} typical for ${bedrooms} bed`
            }
          />
        ) : (
          <>
            <MoneyField
              label="Home price"
              value={state.housing.homePrice}
              onChange={(homePrice) => setHousing({ homePrice })}
              hint={`${formatUSD(homePriceDefault(state.metroId, state.grossSalary))} typical at this salary`}
            />
            {/*
              The three terms of the same purchase, on one line. They were a
              2-up grid with property tax orphaned underneath, which read as two
              unrelated decisions; the shared note now sits under all three.
            */}
            <div>
              <div className="grid grid-cols-3 items-end gap-2">
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
                />
                <PercentField
                  label="Property tax"
                  value={state.housing.propertyTaxRate}
                  onChange={(propertyTaxRate) => setHousing({ propertyTaxRate })}
                  max={10}
                  step={0.01}
                  compact
                />
              </div>
              <PrefillNote>
                {(defaults.effectivePropertyTaxRate * 100).toFixed(2)}% property tax is the
                effective rate here.
              </PrefillNote>
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
              <span className="text-[0.76rem] leading-snug" style={{ color: 'var(--faint)' }}>
                {takeHomeNote}
              </span>
            </div>

            <div className="flex items-baseline justify-between gap-2">
              <span className="text-[0.82rem]" style={{ color: 'var(--muted-strong)' }}>
                Living costs
              </span>
              <span
                className="tnum text-[1rem] font-semibold"
                style={{ color: 'var(--bad)' }}
              >
                &minus;{formatUSD(livingTotal)}
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
