/**
 * Typed access to the committed dataset.
 *
 * Like engine/tax/rules.ts, this is a boundary module: it is the only place the
 * engine reaches into `data/`. Everything downstream takes plain values, so the
 * calculation is testable against fixtures and a new dataset version is a
 * one-line change here.
 */

import housingData from '../data/2026.1/housing.json';
import localTaxData from '../data/2026.1/local-income-tax.json';
import metrosData from '../data/2026.1/metros.json';
import salesTaxData from '../data/2026.1/sales-tax.json';
import spendingData from '../data/2026.1/spending.json';
import transportData from '../data/2026.1/transport.json';
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
