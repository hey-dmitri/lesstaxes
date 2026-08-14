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

/**
 * Which state's tax system applies to someone living in this metro.
 *
 * 43 of the 438 locations straddle a state line, some of them three or four
 * ways: "New York–Newark–Jersey City" is NY and NJ, Philadelphia is PA, NJ, DE
 * and MD, Washington is DC, VA, MD and WV. Every one of them was reduced to a
 * single primaryState which then drove BOTH state income tax and sales tax, so
 * a Newark resident was quoted New York's tax system — and, because the local
 * option list was not filtered either, New York City's resident tax on top.
 *
 * The chosen state is validated against the metro's own list rather than
 * trusted, because it arrives from a share link and a stale or hand-edited one
 * must not silently apply Texas rates to somebody in New Jersey.
 */
export function resolveStateCode(
  metroId: string,
  stateCode: string | undefined,
  version?: string,
): string {
  const m = metro(metroId, version);
  return stateCode && m.states.includes(stateCode) ? stateCode : m.primaryState;
}

/** True when this location genuinely offers a choice of state tax systems. */
export function isMultiState(metroId: string, version?: string): boolean {
  return metro(metroId, version).states.length > 1;
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
  /** Whose households the local medians describe. Used to anchor the curves. */
  medianOwnerIncome?: USD;
  medianRenterIncome?: USD;
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
  return factorFromCurve(income, curve.points, curve.elasticity);
}

/**
 * Scale a local median for a household's income, relative to the households
 * that median actually describes.
 *
 * A national multiplier looks right until you apply it somewhere expensive. San
 * Francisco's median home is already owned by high earners, so multiplying it
 * by "what a $150,000 earner buys nationally" put that household at $1.5m —
 * a third ABOVE the local median, while earning BELOW the local median owner.
 * Anchoring to the local median owner or renter income makes the factor exactly
 * 1.0 for the household the median describes, which is the only value it can
 * correctly have.
 *
 * The elasticity stays national: how sharply housing spend rises with income is
 * a behavioural constant, and it is what the national curves are really
 * measuring. The local PRICE is untouched, so differences between cities — the
 * thing this site exists to measure — survive at full strength.
 */
function localIncomeFactor(income: USD, medianIncome: USD | undefined, elasticity: number): number | null {
  if (!medianIncome || medianIncome <= 0) return null; // suppressed in a few small metros
  return (Math.max(1, income) / medianIncome) ** elasticity;
}

export interface HomeValueCurve {
  nationalMedianValue: USD;
  points: Array<{ income: USD; medianValue: USD; factor: number }>;
  elasticity: number;
}

/** Null for releases built before buying was scaled to income. */
export function homeValueCurve(version?: string): HomeValueCurve | null {
  return (datasetBundle(version).housing.homeValueCurve as HomeValueCurve | undefined) ?? null;
}

/**
 * Interpolate a curve of income → multiplier on the log-log scale, flat below
 * the first point and extrapolating on the measured elasticity above the last.
 * Shared by rent and home value, which are the same shape of question.
 */
function factorFromCurve(
  income: USD,
  points: ReadonlyArray<{ income: USD; factor: number }>,
  elasticity: number,
): number {
  const target = Math.max(1, income);
  if (target <= points[0].income) return points[0].factor;

  for (let i = 1; i < points.length; i++) {
    const low = points[i - 1];
    const high = points[i];
    if (target <= high.income) {
      const t = Math.log(target / low.income) / Math.log(high.income / low.income);
      return low.factor * (high.factor / low.factor) ** t;
    }
  }

  const last = points[points.length - 1];
  return last.factor * (target / last.income) ** elasticity;
}

/**
 * How this household's home compares with the typical owner's.
 *
 * Buying carried the flaw renting lost in 2026.2: the metro median home value
 * is what the MEDIAN owner owns, and the effective property tax rate is applied
 * to it, so a high earner was quoted both a cheaper house and a smaller tax
 * bill than they would really face.
 */
export function homeValueFactorForIncome(
  income: USD,
  metroId?: string,
  version?: string,
): number {
  const curve = homeValueCurve(version);
  if (!curve) return 1; // a release that priced homes income-blind

  if (metroId) {
    const local = localIncomeFactor(
      income,
      housingDefaults(metroId, version).medianOwnerIncome,
      curve.elasticity,
    );
    if (local !== null) return local;
  }
  // No local income published: fall back to the national curve.
  return factorFromCurve(income, curve.points, curve.elasticity);
}

/** The home-price prefill: the local median, scaled for what this income buys. */
export function homePriceDefault(metroId: string, income: USD, version?: string): USD {
  const base = housingDefaults(metroId, version).medianHomePrice;
  return Math.round(base * homeValueFactorForIncome(income, metroId, version));
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

  const curve = incomeRentCurve(version);
  const local = curve
    ? localIncomeFactor(income, defaults.medianRenterIncome, curve.elasticity)
    : null;
  const factor = local ?? rentFactorForIncome(income, version);
  return Math.round(base * factor);
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
  /**
   * Options sharing a group are MUTUALLY EXCLUSIVE — exactly one applies.
   *
   * A metro is much larger than its principal city: only Philadelphia
   * residents pay Philadelphia's wage tax, and someone elsewhere in that metro
   * pays their own township's rate, for which the state average stands in.
   * Applying both would invent a tax nobody pays.
   */
  group?: string;
  /** Shown instead of the prompt when the option is one of a group. */
  label?: string;
}

/** Local income tax options for a metro. Empty for most of the country. */
/**
 * The local income tax choices for a metro, narrowed to the state the person
 * actually lives in.
 *
 * Local taxes are levied by a city inside one state, but they were attached to
 * the whole metro. New York City's resident tax was therefore offered — and
 * ticked by default — to everyone in the New York–Newark–Jersey City metro,
 * including the New Jersey half. Passing the state filters the list to
 * jurisdictions that could actually reach them.
 *
 * Omitting the state returns everything, which is what the /data browser wants
 * when it lists what a metro carries.
 */
export function localTaxOptions(
  metroId: string,
  version?: string,
  stateCode?: string,
): LocalTaxOption[] {
  const all =
    (datasetBundle(version).localTax.byMetro[metroId] as LocalTaxOption[] | undefined) ?? [];
  if (!stateCode) return all;
  return all.filter((o) => localJurisdiction(o.jurisdictionId, version).stateCode === stateCode);
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
export function defaultLocalJurisdictions(
  metroId: string,
  version?: string,
  stateCode?: string,
): LocalTaxRules[] {
  return localTaxOptions(metroId, version, stateCode)
    .filter((o) => o.defaultApplies)
    .map((o) => localJurisdiction(o.jurisdictionId, version));
}

/**
 * Resolve a metro's options against the user's choices into the jurisdictions
 * that actually apply.
 *
 * Grouped options are collapsed to exactly one: whichever the user selected,
 * falling back to the group's default if their selection is missing or stale.
 * Ungrouped options apply independently, which is how NYC and Yonkers work —
 * a Yonkers resident is not a New York City resident, but the two are separate
 * questions rather than alternatives.
 */
export function resolveLocalJurisdictions(
  metroId: string,
  optIns: Record<string, boolean>,
  version?: string,
  stateCode?: string,
): LocalTaxRules[] {
  const options = localTaxOptions(metroId, version, stateCode);
  const chosen: string[] = [];
  const seenGroups = new Set<string>();

  for (const option of options) {
    if (!option.group) {
      const applies = option.optional
        ? (optIns[option.jurisdictionId] ?? option.defaultApplies)
        : option.defaultApplies;
      if (applies) chosen.push(option.jurisdictionId);
      continue;
    }
    if (seenGroups.has(option.group)) continue;

    const members = options.filter((o) => o.group === option.group);
    const selected =
      members.find((m) => optIns[m.jurisdictionId] === true) ??
      members.find((m) => m.defaultApplies);
    if (selected) chosen.push(selected.jurisdictionId);
    seenGroups.add(option.group);
  }

  return chosen.map((id) => localJurisdiction(id, version));
}
