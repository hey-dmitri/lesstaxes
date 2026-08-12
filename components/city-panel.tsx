'use client';

import {
  defaultCarCount,
  formatUSD,
  housingDefaults,
  localTaxOptions,
  metro,
  transportDefaults,
  type CityInputs,
  type FilingStatus,
  type Housing,
} from '@/engine';
import { CountField, MoneyField, PercentField, Segmented, Checkbox } from '@/components/fields';
import { LocationPicker } from '@/components/location-picker';

export interface CityFormState extends CityInputs {
  /** Local jurisdictions the user has confirmed, e.g. living inside NYC. */
  localOptIns: Record<string, boolean>;
}

interface Props {
  title: string;
  state: CityFormState;
  filingStatus: FilingStatus;
  onChange: (next: CityFormState) => void;
  salaryLabel: string;
  salaryHint?: React.ReactNode;
}

/** Housing defaults for a metro at a given tenure. */
export function housingFor(metroId: string, tenure: 'rent' | 'own'): Housing {
  const h = housingDefaults(metroId);
  return tenure === 'rent'
    ? { tenure: 'rent', monthlyRent: h.medianRentMonthly }
    : {
        tenure: 'own',
        homePrice: h.medianHomePrice,
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
): CityFormState {
  const options = localTaxOptions(metroId);
  return {
    metroId,
    grossSalary: salary,
    cars: defaultCarCount(metroId, filingStatus),
    housing: housingFor(metroId, tenure),
    localOptIns: Object.fromEntries(options.map((o) => [o.jurisdictionId, o.defaultApplies])),
  };
}

export function CityPanel({ title, state, filingStatus, onChange, salaryLabel, salaryHint }: Props) {
  const m = metro(state.metroId);
  const defaults = housingDefaults(state.metroId);
  const transport = transportDefaults(state.metroId);
  const suggestedCars = defaultCarCount(state.metroId, filingStatus);
  const optionalLocals = localTaxOptions(state.metroId).filter((o) => o.optional);

  const set = (patch: Partial<CityFormState>) => onChange({ ...state, ...patch });
  const setHousing = (patch: Partial<Housing>) =>
    set({ housing: { ...state.housing, ...patch } as Housing });

  return (
    <section
      className="flex flex-col rounded-lg border lg:min-h-0"
      style={{ borderColor: 'var(--rule-strong)', background: 'var(--surface)' }}
    >
      <h2
        className="shrink-0 border-b px-4 py-2.5 font-serif text-sm font-semibold"
        style={{ borderColor: 'var(--rule)', color: 'var(--ink)' }}
      >
        {title}
      </h2>

      <div className="flex flex-col gap-3.5 px-4 py-3.5 lg:min-h-0 lg:flex-1 lg:overflow-y-auto">
        <LocationPicker
          id={`location-${title.replace(/\s+/g, '-').toLowerCase()}`}
          label="City or area"
          value={state.metroId}
          onChange={(metroId) =>
            onChange(
              resetCityForLocation(metroId, state.grossSalary, filingStatus, state.housing.tenure),
            )
          }
        />

        <MoneyField
          label={salaryLabel}
          value={state.grossSalary}
          onChange={(grossSalary) => set({ grossSalary })}
          hint={salaryHint}
        />

        <Segmented
          label="Housing"
          value={state.housing.tenure}
          onChange={(tenure) => set({ housing: housingFor(state.metroId, tenure) })}
          options={[
            { value: 'rent', label: 'Rent' },
            { value: 'own', label: 'Own' },
          ]}
        />

        {state.housing.tenure === 'rent' ? (
          <MoneyField
            label="Monthly rent"
            value={state.housing.monthlyRent}
            onChange={(monthlyRent) => setHousing({ monthlyRent })}
            suffix="/mo"
            hint={`Median here is ${formatUSD(defaults.medianRentMonthly)}/mo`}
          />
        ) : (
          <>
            <MoneyField
              label="Home price"
              value={state.housing.homePrice}
              onChange={(homePrice) => setHousing({ homePrice })}
              hint={`Median here is ${formatUSD(defaults.medianHomePrice)}`}
            />
            <div className="grid grid-cols-2 gap-3">
              <PercentField
                label="Down payment"
                value={state.housing.downPayment}
                onChange={(downPayment) => setHousing({ downPayment })}
                step={1}
              />
              <PercentField
                label="Mortgage rate"
                value={state.housing.mortgageRate}
                onChange={(mortgageRate) => setHousing({ mortgageRate })}
                max={25}
                step={0.05}
              />
            </div>
            <PercentField
              label="Property tax rate"
              value={state.housing.propertyTaxRate}
              onChange={(propertyTaxRate) => setHousing({ propertyTaxRate })}
              max={10}
              step={0.01}
              hint={`${(defaults.effectivePropertyTaxRate * 100).toFixed(2)}% effective here — what is actually paid, not the headline millage`}
            />
          </>
        )}

        <CountField
          label="Cars"
          value={state.cars}
          onChange={(cars) => set({ cars })}
          hint={
            suggestedCars === state.cars
              ? `Typical here — ${transport.vehiclesPerAdult.toFixed(2)} per adult`
              : `Typical here is ${suggestedCars}`
          }
        />

        {optionalLocals.length > 0 && (
          <div
            className="flex flex-col gap-2 rounded border p-3"
            style={{ borderColor: 'var(--rule)', background: 'var(--surface-sunken)' }}
          >
            <p
              className="text-[0.65rem] font-semibold uppercase tracking-[0.09em]"
              style={{ color: 'var(--muted)' }}
            >
              Local income tax
            </p>
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
            <p className="text-[0.68rem] leading-snug" style={{ color: 'var(--muted)' }}>
              This metro spans several jurisdictions and only some levy it. It makes a real
              difference, so we ask rather than guess.
            </p>
          </div>
        )}

        <p className="mt-auto pt-1 text-[0.68rem]" style={{ color: 'var(--muted)' }}>
          {m.name}
        </p>
      </div>
    </section>
  );
}
