/**
 * Flattened dataset rows for the public /data browser.
 *
 * One row per selectable location, carrying every figure the calculator will
 * use for it. This is the product's credibility argument made inspectable:
 * anyone can look up a city they know and check the numbers against their own
 * experience (PROJECT.md D26).
 */

/*
 * Everything here reads through the engine's accessors rather than importing a
 * dataset directory by name. Two of these imports were pinned to 2026.3 while
 * the engine had moved to 2026.4: the values happened to match, so the page was
 * telling the truth by luck, and the next refresh that changed a sales-tax rate
 * would have had the browser quietly disagreeing with the calculator it exists
 * to explain. A version number should appear in exactly one place.
 */
import {
  allMetros,
  housingDefaults,
  localTaxOptions,
  localJurisdiction,
  salesTaxRules,
  stateRules,
  transportDefaults,
} from '@/engine';

export interface DatasetRow {
  id: string;
  label: string;
  detail: string;
  state: string;
  /** Every state the metro touches. More than one for 43 of them. */
  states: string[];
  isRural: boolean;
  /** Metro-wide median across all unit sizes — the raw published figure. */
  rent: number;
  /** Local median for a one-bedroom and a three-bedroom, before income scaling. */
  rent1br: number;
  rent3br: number;
  homePrice: number;
  /** Whose households the local medians describe — the anchor for both curves. */
  ownerIncome: number;
  renterIncome: number;
  propertyTaxRate: number;
  vehiclesPerAdult: number;
  parityAll: number;
  parityHousing: number;
  parityGoods: number;
  parityUtilities: number;
  parityServices: number;
  hasStateIncomeTax: boolean;
  salesTaxRate: number;
  groceryTreatment: string;
  localTax: string | null;
  /** Lowercased haystack so filtering does no work per keystroke. */
  search: string;
}

export const DATASET_ROWS: DatasetRow[] = allMetros().map((m) => {
  const housing = housingDefaults(m.id);
  const transport = transportDefaults(m.id);
  const sales = salesTaxRules(m.primaryState);
  const locals = localTaxOptions(m.id);

  return {
    id: m.id,
    label: m.shortName,
    detail:
      m.type === 'restOfState'
        ? 'Rural fallback — statewide figures'
        : m.states.length > 1
          ? `${m.name} — crosses a state line, so the calculator asks which of ${m.states.join(', ')} you live in`
          : m.name,
    state: m.primaryState,
    states: m.states,
    isRural: m.type === 'restOfState',
    rent: housing.medianRentMonthly,
    rent1br: housing.rentByBedrooms[1],
    rent3br: housing.rentByBedrooms[3],
    homePrice: housing.medianHomePrice,
    ownerIncome: housing.medianOwnerIncome ?? 0,
    renterIncome: housing.medianRenterIncome ?? 0,
    propertyTaxRate: housing.effectivePropertyTaxRate,
    vehiclesPerAdult: transport.vehiclesPerAdult,
    parityAll: m.priceParity.allItems,
    parityHousing: m.priceParity.housing,
    parityGoods: m.priceParity.goods,
    parityUtilities: m.priceParity.utilities,
    parityServices: m.priceParity.otherServices,
    hasStateIncomeTax: stateRules(m.primaryState).hasWageIncomeTax,
    salesTaxRate: sales.combinedRate,
    groceryTreatment: sales.grocery.treatment,
    localTax: locals.length
      ? locals.map((l) => localJurisdiction(l.jurisdictionId).name).join(' / ')
      : null,
    search: `${m.shortName} ${m.name} ${m.states.join(' ')}`.toLowerCase(),
  };
});

/**
 * What kind of number a figure actually is.
 *
 * The site said "every figure is a local median" in several places and that was
 * simply false. Housing figures are medians; BLS spending and vehicle counts
 * are population MEANS, which behave quite differently in a skewed
 * distribution; price parities are index numbers, not dollars; several tax
 * lines are statewide averages or modelled shares rather than anything anyone
 * is charged. A reader checking a figure against their own life needs to know
 * which of those they are looking at, so every row now says.
 */
export type FigureKind =
  | 'Local median'
  | 'National median'
  | 'Local average'
  | 'National average'
  | 'Index'
  | 'Statutory rate'
  | 'State average'
  | 'Definition';

export const DATASET_SOURCES: Array<{
  what: string;
  kind: FigureKind;
  source: string;
  licence: string;
}> = [
  {
    what: 'Metro definitions and counties',
    kind: 'Definition',
    source: 'Census Bureau, Core Based Statistical Area delineation files (2023)',
    licence: 'Public domain',
  },
  {
    what: 'Price levels by category',
    kind: 'Index',
    source: 'Bureau of Economic Analysis, Regional Price Parities (2024)',
    licence: 'Public domain',
  },
  {
    what: 'Rent, home values, property tax paid',
    kind: 'Local median',
    source: 'Census ACS 2024 5-year estimates (B25064, B25077, B25103)',
    licence: 'Public domain',
  },
  {
    what: 'Rent by unit size',
    kind: 'Local median',
    source: 'Census ACS 2024 5-year estimates (B25031)',
    licence: 'Public domain',
  },
  {
    what: 'How rent scales with income',
    kind: 'National median',
    source: 'Census ACS 2024 5-year estimates (B25074), national',
    licence: 'Public domain',
  },
  {
    what: 'How home price scales with income',
    kind: 'National median',
    source: 'Census ACS 2024 5-year estimates (B25121), national',
    licence: 'Public domain',
  },
  {
    what: 'Median income of owners and renters',
    kind: 'Local median',
    source: 'Census ACS 2024 5-year estimates (B25119)',
    licence: 'Public domain',
  },
  {
    what: 'Vehicles per household',
    kind: 'Local average',
    source: 'Census ACS 2024 5-year estimates (B25044, B09021)',
    licence: 'Public domain',
  },
  {
    what: 'Household spending by income',
    kind: 'National average',
    source: 'BLS Consumer Expenditure Survey, Table 1203 (2024) — population means',
    licence: 'Public domain',
  },
  {
    what: 'Cost of running a car',
    kind: 'National average',
    source: 'BLS Consumer Expenditure Survey, scaled by the local goods price parity',
    licence: 'Public domain',
  },
  {
    what: 'Federal tax rules',
    kind: 'Statutory rate',
    source: 'IRS Rev. Proc. 2025-32; 26 U.S.C. §164; SSA contribution base',
    licence: 'Public domain',
  },
  {
    what: 'State income tax rules',
    kind: 'Statutory rate',
    source: 'Tax Foundation (2026), compiled from state statutes',
    licence: 'CC BY-NC 4.0',
  },
  {
    what: 'Sales tax rates',
    kind: 'State average',
    source: 'Tax Foundation (2026) — state rate plus the population-weighted local average',
    licence: 'CC BY-NC 4.0',
  },
  {
    what: 'Local income tax',
    kind: 'Statutory rate',
    source: 'Named cities from their own revenue departments; state averages elsewhere',
    licence: 'Mixed',
  },
];
