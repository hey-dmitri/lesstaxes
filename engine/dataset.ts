/**
 * Typed access to the committed dataset.
 *
 * Like engine/tax/rules.ts, this is a boundary module: it is the only place the
 * engine reaches into `data/`. Everything downstream takes plain values, so the
 * calculation is testable against fixtures and a new dataset version is a
 * one-line change here.
 */

import housingData from '../data/2026.2/housing.json';
import localTaxData from '../data/2026.2/local-income-tax.json';
import metrosData from '../data/2026.2/metros.json';
import salesTaxData from '../data/2026.2/sales-tax.json';
import spendingData from '../data/2026.2/spending.json';
import transportData from '../data/2026.2/transport.json';
import type { Rate, USD } from './types';
import type { LocalTaxRules } from './tax/local';

export const DATASET_VERSION = metrosData.datasetVersion;

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

const METROS = metrosData.metros as unknown as Record<string, Metro>;

export const ALL_METRO_IDS: readonly string[] = Object.keys(METROS);

export function metro(id: string): Metro {
  const m = METROS[id];
  if (!m) throw new Error(`unknown location id: ${id}`);
  return m;
}

/** Every selectable location, sorted for a picker. */
export function allMetros(): Metro[] {
  return Object.values(METROS).sort((a, b) => a.shortName.localeCompare(b.shortName));
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

const HOUSING = housingData.byMetro as unknown as Record<string, HousingDefaults>;

export function housingDefaults(metroId: string): HousingDefaults {
  const h = HOUSING[metroId];
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

export const INCOME_RENT_CURVE = housingData.incomeCurve as unknown as IncomeRentCurve;

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
export function rentFactorForIncome(income: USD): number {
  const points = INCOME_RENT_CURVE.points;
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
  return last.factor * (target / last.income) ** INCOME_RENT_CURVE.elasticity;
}

/**
 * The rent prefill: the local median for a unit this household's size, scaled
 * for what people at this income actually pay.
 */
export function rentDefault(metroId: string, income: USD, bedrooms: number): USD {
  const table = housingDefaults(metroId).rentByBedrooms;
  const size = Math.min(MAX_BEDROOMS, Math.max(0, Math.round(bedrooms)));
  const base = table[size] ?? housingDefaults(metroId).medianRentMonthly;
  return Math.round(base * rentFactorForIncome(income));
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

const TRANSPORT = transportData.byMetro as unknown as Record<string, TransportDefaults>;

export function transportDefaults(metroId: string): TransportDefaults {
  const t = TRANSPORT[metroId];
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

const PROFILES = (spendingData.profiles as unknown as SpendingProfile[])
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
export function spendingProfile(householdIncome: USD): SpendingProfile {
  const income = Math.max(0, householdIncome);
  let chosen = PROFILES[0];
  for (const p of PROFILES) {
    if (income >= p.incomeFloor) chosen = p;
    else break;
  }
  return chosen;
}

export const ALL_SPENDING_PROFILES: readonly SpendingProfile[] = PROFILES;

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

const SALES_TAX = salesTaxData.states as unknown as Record<string, SalesTaxRules>;

export interface TaxableShares {
  food: { groceryPortion: number; restaurantPortion: number };
  otherGoods: number;
  utilities: number;
  healthcare: number;
  otherServices: number;
}

export const TAXABLE_SHARES = salesTaxData.taxableShares as unknown as TaxableShares;

export function salesTaxRules(stateCode: string): SalesTaxRules {
  const s = SALES_TAX[stateCode];
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

const LOCAL_JURISDICTIONS = localTaxData.jurisdictions as unknown as Record<string, LocalTaxRules>;
const LOCAL_BY_METRO = localTaxData.byMetro as unknown as Record<string, LocalTaxOption[]>;

/** Local income tax options for a metro. Empty for most of the country. */
export function localTaxOptions(metroId: string): LocalTaxOption[] {
  return LOCAL_BY_METRO[metroId] ?? [];
}

export function localJurisdiction(id: string): LocalTaxRules {
  const j = LOCAL_JURISDICTIONS[id];
  if (!j) throw new Error(`unknown local jurisdiction: ${id}`);
  return j;
}

/**
 * The jurisdictions that apply by default for a metro. The interface may let
 * the user override any marked optional.
 */
export function defaultLocalJurisdictions(metroId: string): LocalTaxRules[] {
  return localTaxOptions(metroId)
    .filter((o) => o.defaultApplies)
    .map((o) => localJurisdiction(o.jurisdictionId));
}
