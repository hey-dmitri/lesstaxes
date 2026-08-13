/**
 * Typed access to a dataset version.
 *
 * Reads through engine/datasets.ts rather than importing a directory, so that a
 * shared link can resolve against the release it was made with (PROJECT.md
 * §9.2). Every accessor takes an optional version as its last argument and
 * defaults to the current release, which keeps the interface's call sites — the
 * pickers, the data browser — unchanged while letting the calculation pin
 * itself.
 */

import { CURRENT_DATASET_VERSION, datasetBundle } from './datasets';
import type { Rate, USD } from './types';
import type { LocalTaxRules } from './tax/local';

/** What a fresh visit computes with. Per-link resolution goes through datasetBundle. */
export const DATASET_VERSION = CURRENT_DATASET_VERSION;

// ---------------------------------------------------------------------------
// Metros
// ---------------------------------------------------------------------------

/** BEA price levels relative to the national average. 1.12 means 12% above. */
export interface PriceParity {
  allItems: Rate;
  goods: Rate;
  housing: Rate;
  utilities: Rate;
  otherServices: Rate;
}

export interface Metro {
  id: string;
  name: string;
  shortName: string;
  type: 'metro' | 'restOfState';
  states: string[];
  primaryState: string;
  priceParity: PriceParity;
}

const metros = (version?: string) =>
  datasetBundle(version).metros.metros as Record<string, Metro>;

export const ALL_METRO_IDS: readonly string[] = Object.keys(metros());

export function metro(id: string, version?: string): Metro {
  const m = metros(version)[id];
  if (!m) throw new Error(`unknown location id: ${id}`);
  return m;
}

/** Every selectable location, sorted for a picker. */
export function allMetros(version?: string): Metro[] {
  return Object.values(metros(version)).sort((a, b) => a.shortName.localeCompare(b.shortName));
}

// ---------------------------------------------------------------------------
// Housing
// ---------------------------------------------------------------------------

export interface HousingDefaults {
  medianRentMonthly: USD;
  /** Local median rent for each unit size, keyed by bedroom count (0 = studio). */
  rentByBedrooms: Record<number, USD>;
  /** Sizes the Census suppressed locally, filled from national ratios. */
  derivedBedrooms: number[];
  medianHomePrice: USD;
  medianPropertyTaxPaid: USD;
  /** Taxes actually paid divided by home value — already net of exemptions and caps. */
  effectivePropertyTaxRate: Rate;
}

export function housingDefaults(metroId: string, version?: string): HousingDefaults {
  const h = datasetBundle(version).housing.byMetro[metroId] as HousingDefaults | undefined;
  if (!h) throw new Error(`no housing data for ${metroId}`);
  return h;
}

// ---------------------------------------------------------------------------
// Rent for a household, rather than for the average of the whole rental stock
// ---------------------------------------------------------------------------

const MAX_BEDROOMS = 5;

/**
 * How many bedrooms this household is quoted for.
 *
 * Adults share one room; children fill further rooms two at a time. This is the
 * standard occupancy convention (HUD uses two people per bedroom), and it is
 * deliberately the conservative reading — a family of four is priced into a
 * two-bedroom, not a three. The resulting rent is a prefill, and editable.
 *
 * Before this existed a single person and a family of four were quoted exactly
 * the same rent, because the only figure available was the median across every
 * rented unit in the metro regardless of size.
 */
export function bedroomsFor(adults: number, children: number): number {
  const rooms = 1 + Math.ceil(Math.max(0, children) / 2);
  return Math.min(MAX_BEDROOMS, Math.max(1, rooms, adults > 2 ? adults - 1 : 1));
}

export interface IncomeRentCurve {
  nationalMedianRent: USD;
  points: Array<{ income: USD; medianBurdenPct: number; factor: number }>;
  elasticity: number;
}

/**
 * Null for releases built before the curve existed. 2026.1 shipped a single
 * income-blind median, and a 2026.1 link has to keep reproducing exactly that.
 */
export function incomeRentCurve(version?: string): IncomeRentCurve | null {
  return (datasetBundle(version).housing.incomeCurve as IncomeRentCurve | undefined) ?? null;
}

export const INCOME_RENT_CURVE = incomeRentCurve() as IncomeRentCurve;

/**
 * How this household's rent compares with the typical renter's.
 *
 * Interpolated on a log-log scale between the published points, which is the
 * natural reading of a constant elasticity and keeps the curve smooth across
 * the survey's band boundaries. Below the first point the curve is flat;
 * above the last it continues on the elasticity measured across the whole
 * range rather than stopping dead, because incomes do not.
 *
 * See the note in scripts/build-housing-transport.mjs for why this is a single
 * national curve and not a per-metro one.
 */
export function rentFactorForIncome(income: USD, version?: string): number {
  const curve = incomeRentCurve(version);
  if (!curve) return 1; // a release with no curve priced rent income-blind
  const points = curve.points;
  const target = Math.max(1, income);

  if (target <= points[0].income) return points[0].factor;

  for (let i = 1; i < points.length; i++) {
    const low = points[i - 1];
    const high = points[i];
    if (target <= high.income) {
      const t =
        Math.log(target / low.income) / Math.log(high.income / low.income);
      return low.factor * (high.factor / low.factor) ** t;
    }
  }

  const last = points[points.length - 1];
  return last.factor * (target / last.income) ** curve.elasticity;
}

/**
 * The rent prefill: the local median for a unit this household's size, scaled
 * for what people at this income actually pay.
 */
export function rentDefault(
  metroId: string,
  income: USD,
  bedrooms: number,
  version?: string,
): USD {
  const defaults = housingDefaults(metroId, version);
  const size = Math.min(MAX_BEDROOMS, Math.max(0, Math.round(bedrooms)));
  // Releases before 2026.2 carry no rent-by-size table; they priced every
  // household at one metro-wide median, and their links must keep doing so.
  const base = defaults.rentByBedrooms?.[size] ?? defaults.medianRentMonthly;
  return Math.round(base * rentFactorForIncome(income, version));
}

// ---------------------------------------------------------------------------
// Transport
// ---------------------------------------------------------------------------

export interface TransportDefaults {
  vehiclesPerHousehold: number;
  adultsPerHousehold: number;
  /** Multiplied by the adults implied by filing status to get a car count. */
  vehiclesPerAdult: number;
}

export function transportDefaults(metroId: string, version?: string): TransportDefaults {
  const t = datasetBundle(version).transport.byMetro[metroId] as TransportDefaults | undefined;
  if (!t) throw new Error(`no transport data for ${metroId}`);
  return t;
}

// ---------------------------------------------------------------------------
// Spending
// ---------------------------------------------------------------------------

export interface SpendingCategories {
  food: USD;
  otherGoods: USD;
  utilities: USD;
  healthcare: USD;
  otherServices: USD;
}

export interface SpendingProfile {
  bracket: string;
  incomeFloor: USD;
  averageHouseholdSize: number;
  categories: SpendingCategories;
  livingTotal: USD;
  transport: {
    vehiclesPerHousehold: number;
    annualCostPerVehicle: USD;
    transitSpending: USD;
  };
}

const profiles = (version?: string): SpendingProfile[] =>
  (datasetBundle(version).spending.profiles as SpendingProfile[])
    .slice()
    .sort((a, b) => a.incomeFloor - b.incomeFloor);

/** Which BEA parity scales each spending category. */
export const PARITY_FOR_CATEGORY: Record<keyof SpendingCategories, keyof PriceParity> = {
  food: 'goods',
  otherGoods: 'goods',
  utilities: 'utilities',
  healthcare: 'otherServices',
  otherServices: 'otherServices',
};

/**
 * The spending profile for a household income.
 *
 * Brackets are chosen by floor, not interpolated. Interpolating would imply a
 * precision the survey does not have, and would hide the step structure from
 * anyone reading the methodology page.
 */
export function spendingProfile(householdIncome: USD, version?: string): SpendingProfile {
  const income = Math.max(0, householdIncome);
  const all = profiles(version);
  let chosen = all[0];
  for (const p of all) {
    if (income >= p.incomeFloor) chosen = p;
    else break;
  }
  return chosen;
}

export const ALL_SPENDING_PROFILES: readonly SpendingProfile[] = profiles();

// ---------------------------------------------------------------------------
// Sales tax
// ---------------------------------------------------------------------------

export interface SalesTaxRules {
  code: string;
  name: string;
  stateRate: Rate;
  avgLocalRate: Rate;
  combinedRate: Rate;
  grocery: { treatment: 'exempt' | 'full' | 'reduced'; effectiveRate: Rate };
}



export interface TaxableShares {
  food: { groceryPortion: number; restaurantPortion: number };
  otherGoods: number;
  utilities: number;
  healthcare: number;
  otherServices: number;
}

export function taxableShares(version?: string): TaxableShares {
  return datasetBundle(version).salesTax.taxableShares as TaxableShares;
}

export const TAXABLE_SHARES = taxableShares();

export function salesTaxRules(stateCode: string, version?: string): SalesTaxRules {
  const s = datasetBundle(version).salesTax.states[stateCode] as SalesTaxRules | undefined;
  if (!s) throw new Error(`no sales tax data for state ${stateCode}`);
  return s;
}

// ---------------------------------------------------------------------------
// Local income tax
// ---------------------------------------------------------------------------

export interface LocalTaxOption {
  jurisdictionId: string;
  /** True when the user genuinely may or may not live inside the boundary. */
  optional: boolean;
  defaultApplies: boolean;
  prompt?: string;
}

/** Local income tax options for a metro. Empty for most of the country. */
export function localTaxOptions(metroId: string, version?: string): LocalTaxOption[] {
  return (datasetBundle(version).localTax.byMetro[metroId] as LocalTaxOption[] | undefined) ?? [];
}

export function localJurisdiction(id: string, version?: string): LocalTaxRules {
  const j = datasetBundle(version).localTax.jurisdictions[id] as LocalTaxRules | undefined;
  if (!j) throw new Error(`unknown local jurisdiction: ${id}`);
  return j;
}

/**
 * The jurisdictions that apply by default for a metro. The interface may let
 * the user override any marked optional.
 */
export function defaultLocalJurisdictions(metroId: string, version?: string): LocalTaxRules[] {
  return localTaxOptions(metroId, version)
    .filter((o) => o.defaultApplies)
    .map((o) => localJurisdiction(o.jurisdictionId, version));
}
