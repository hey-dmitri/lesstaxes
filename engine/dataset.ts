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

/**
 * Housing figures for a place, narrowed to one state where that is possible.
 *
 * 43 of these metros cross a state line, and the halves are not alike: the New
 * Jersey side of the New York metro has a median home value near $512,000
 * against $685,000 on the New York side, either side of the $614,000 metro
 * figure that used to be quoted to both. The ACS publishes every table used
 * here at summary level 311 — metro by state part — so the state the user has
 * already chosen for tax purposes now picks the housing too.
 *
 * FIELD BY FIELD, not entry by entry. A state part is a smaller sample than its
 * metro, so the Census suppresses individual cells in it more often. Falling
 * back wholesale would throw away good figures to avoid a missing one; falling
 * back per field keeps the state's own number wherever it exists.
 */
export function housingDefaults(
  metroId: string,
  version?: string,
  stateCode?: string,
): HousingDefaults {
  const bundle = datasetBundle(version).housing;
  const metroWide = bundle.byMetro[metroId] as HousingDefaults | undefined;
  if (!metroWide) throw new Error(`no housing data for ${metroId}`);
  if (!stateCode) return metroWide;

  const part = (bundle.byMetroState as Record<string, HousingDefaults> | undefined)?.[
    `${metroId}:${stateCode}`
  ];
  if (!part) return metroWide;

  return {
    medianRentMonthly: part.medianRentMonthly ?? metroWide.medianRentMonthly,
    rentByBedrooms: Object.fromEntries(
      Object.keys(metroWide.rentByBedrooms).map((size) => [
        size,
        part.rentByBedrooms?.[Number(size)] ?? metroWide.rentByBedrooms[Number(size)],
      ]),
    ),
    derivedBedrooms: part.derivedBedrooms ?? metroWide.derivedBedrooms,
    medianHomePrice: part.medianHomePrice ?? metroWide.medianHomePrice,
    medianOwnerIncome: part.medianOwnerIncome ?? metroWide.medianOwnerIncome,
    medianRenterIncome: part.medianRenterIncome ?? metroWide.medianRenterIncome,
    medianPropertyTaxPaid: part.medianPropertyTaxPaid ?? metroWide.medianPropertyTaxPaid,
    effectivePropertyTaxRate:
      part.effectivePropertyTaxRate ?? metroWide.effectivePropertyTaxRate,
  };
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
  stateCode?: string,
): number {
  const curve = homeValueCurve(version);
  if (!curve) return 1; // a release that priced homes income-blind

  if (metroId) {
    const local = localIncomeFactor(
      income,
      housingDefaults(metroId, version, stateCode).medianOwnerIncome,
      curve.elasticity,
    );
    if (local !== null) return local;
  }
  // No local income published: fall back to the national curve.
  return factorFromCurve(income, curve.points, curve.elasticity);
}

/** The home-price prefill: the local median, scaled for what this income buys. */
export function homePriceDefault(
  metroId: string,
  income: USD,
  version?: string,
  stateCode?: string,
): USD {
  const base = housingDefaults(metroId, version, stateCode).medianHomePrice;
  // The published median is a 2024 figure; priceFactor restates it in today's
  // money. Applied here rather than in housingDefaults so the data browser goes
  // on showing exactly what the Census published.
  return Math.round(
    base *
      homeValueFactorForIncome(income, metroId, version, stateCode) *
      priceFactor('homePrice', version),
  );
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
  stateCode?: string,
): USD {
  const defaults = housingDefaults(metroId, version, stateCode);
  const size = Math.min(MAX_BEDROOMS, Math.max(0, Math.round(bedrooms)));
  // Releases before 2026.2 carry no rent-by-size table; they priced every
  // household at one metro-wide median, and their links must keep doing so.
  const base = defaults.rentByBedrooms?.[size] ?? defaults.medianRentMonthly;

  const curve = incomeRentCurve(version);
  const local = curve
    ? localIncomeFactor(income, defaults.medianRenterIncome, curve.elasticity)
    : null;
  const factor = local ?? rentFactorForIncome(income, version);
  // 2024 dollars restated in today's money. See homePriceDefault.
  return Math.round(base * factor * priceFactor('rent', version));
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

/** Vehicles per adult, narrowed to a state part where one exists. */
export function transportDefaults(
  metroId: string,
  version?: string,
  stateCode?: string,
): TransportDefaults {
  const bundle = datasetBundle(version).transport;
  const metroWide = bundle.byMetro[metroId] as TransportDefaults | undefined;
  if (!metroWide) throw new Error(`no transport data for ${metroId}`);
  if (!stateCode) return metroWide;

  const part = (bundle.byMetroState as Record<string, TransportDefaults> | undefined)?.[
    `${metroId}:${stateCode}`
  ];
  if (part?.vehiclesPerAdult == null) return metroWide;
  return { ...metroWide, ...part };
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
  /**
   * Mean income before taxes of the households in this bracket — the income
   * this bracket's spending actually describes.
   *
   * Absent on releases cut before spending was interpolated, which is what
   * makes those releases keep computing the way they did when they shipped.
   */
  meanIncome?: USD;
  /**
   * How the utilities figure divides against ACS gross rent.
   *
   * Census gross rent is contract rent PLUS renter-paid electricity, gas, water
   * and sewer, and fuels. Those four are the `insideGrossRent` half, and for a
   * renter they are already inside the rent figure this site quotes. Telephone
   * service is in the BLS utilities row and is not in gross rent.
   *
   * Absent on releases cut before the overlap was found, which keep charging
   * the whole utilities row on top of gross rent.
   */
  utilitiesSplit?: {
    insideGrossRent: USD;
    telephone: USD;
  };
  /**
   * Repairs, upkeep and home insurance for an owned home.
   *
   * The whole BLS shelter block used to be dropped and only a mortgage payment
   * and property tax added back, so this was never restored for anyone. Home
   * insurance is INSIDE it — the gap the site documented as "insurance is
   * missing" was one ingredient of a line item missing whole.
   *
   * Absent on releases cut before that was noticed, which charge owners nothing
   * for keeping the house standing.
   */
  /**
   * Giving, alimony and child support.
   *
   * Carried outside `categories` because it takes NO local price parity, and
   * every entry in that object is defined by the parity it scales with. A gift
   * to a charity is not bought at local prices and a support order is set by a
   * court, but both still move with income and household size.
   *
   * Absent on releases where it is still inside otherServices, priced by the
   * local services index — so a donation grew because local dentists did.
   */
  cashContributions?: USD;
  ownerUpkeep?: {
    /** As published: averaged over owners and renters together. */
    perConsumerUnit: USD;
    /** Share of households in this band who own, which is the divisor. */
    homeownerShare: number;
    /** What it costs somebody who actually owns. This is the figure charged. */
    perOwner: USD;
  };
  averageHouseholdSize: number;
  categories: SpendingCategories;
  livingTotal: USD;
  transport: {
    vehiclesPerHousehold: number;
    annualCostPerVehicle: USD;
    /** The car and its fuel. Absent before the goods/services split. */
    goodsPerVehicle?: USD;
    /** Insurance, servicing, finance charges, licensing. */
    servicesPerVehicle?: USD;
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

/** Linear blend between two numbers. */
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

export interface PriceLevel {
  baseYear: number;
  asOf: string;
  factors: Record<
    'basket' | 'rent' | 'homePrice',
    { value: number; series: string; name: string; currentMonth: string }
  >;
}

/**
 * How much to multiply this release's 2024 dollars by to state them in today's
 * money, or 1 on releases cut before the lag was corrected.
 *
 * EVERY DOLLAR BEHIND THIS SITE WAS MEASURED IN 2024 — the Census rent and
 * home-value tables and the BLS spending survey. The tax rules are 2026 and the
 * salary is whatever the reader types today. So costs were about six per cent
 * too low against a current salary, and that lands almost undiluted on money
 * left over, which is a small remainder of two large numbers: 13% of the answer
 * for a Chicago renter on $100,000, 27% for a buyer.
 *
 * Three factors, not one, because rent, house prices and the shopping basket
 * have moved differently since 2024 and using one index for all three would be
 * a knowingly worse number.
 */
export function priceLevel(version?: string): PriceLevel | undefined {
  return (datasetBundle(version).spending as { priceLevel?: PriceLevel }).priceLevel;
}

/** The multiplier for one kind of dollar. 1 when this release has no factors. */
export function priceFactor(
  kind: 'basket' | 'rent' | 'homePrice',
  version?: string,
): number {
  return priceLevel(version)?.factors[kind]?.value ?? 1;
}

/**
 * The spending profile for a household income.
 *
 * THIS USED TO BE A STEP FUNCTION AND THAT WAS A REAL BUG. The bracket was
 * chosen by its floor, so the basket jumped the instant a salary crossed a
 * published boundary. The justification on record was that interpolating would
 * "imply a precision the survey does not have". That argument is backwards. A
 * step function does not express uncertainty about spending — it asserts,
 * confidently and falsely, that spending is flat across a $50,000 band and then
 * leaps in a single dollar. What it actually produced:
 *
 *   $149,999 -> $150,000   Chicago leftover fell $8,300 for a $1 raise
 *   $199,999 -> $200,000   Chicago leftover fell $14,839 for a $1 raise
 *
 * And because the two cities sit at different price levels, the jumps did not
 * cancel: a $1 edit moved the gap between them by $614 at $150,000 and $1,119
 * at $200,000. That is enough to flip a verdict, and it made disposable income
 * fall as pay rose, which is not a thing that happens.
 *
 * THE FIX IS TO PUT EACH BRACKET WHERE IT BELONGS. A bracket's published mean
 * spending is the average over households spread across the whole bracket, so
 * it describes that bracket's mean INCOME, not its floor. Anchor each profile
 * at its mean income, interpolate between neighbours, and spending becomes a
 * continuous rising function of salary. No smoothing, no invention — the same
 * nine published points, read at the income they were measured at.
 *
 * Below the lowest mean and above the highest, the nearest profile is held
 * flat rather than extrapolated. The top bracket is open-ended, and its mean
 * income of $322,142 is a long way above its $200,000 floor, which is exactly
 * why the floor was the wrong anchor for it.
 *
 * OLD RELEASES KEEP STEPPING. Datasets cut before this carry no meanIncome, and
 * fall back to the original lookup — PROJECT.md §9.2: a shared link recomputes
 * against the model it was made with, not just the data.
 */
export function spendingProfile(householdIncome: USD, version?: string): SpendingProfile {
  const income = Math.max(0, householdIncome);
  const all = profiles(version);

  const knots = all.filter((p) => typeof p.meanIncome === 'number');
  if (knots.length < 2) {
    // Pre-interpolation dataset. Choose by floor, exactly as it shipped.
    let chosen = all[0];
    for (const p of all) {
      if (income >= p.incomeFloor) chosen = p;
      else break;
    }
    return chosen;
  }

  knots.sort((a, b) => a.meanIncome! - b.meanIncome!);
  const first = knots[0];
  const last = knots[knots.length - 1];
  if (income <= first.meanIncome!) return first;
  if (income >= last.meanIncome!) return last;

  let lower = first;
  let upper = last;
  for (let i = 0; i < knots.length - 1; i++) {
    if (income >= knots[i].meanIncome! && income <= knots[i + 1].meanIncome!) {
      lower = knots[i];
      upper = knots[i + 1];
      break;
    }
  }

  const span = upper.meanIncome! - lower.meanIncome!;
  const t = span > 0 ? (income - lower.meanIncome!) / span : 0;

  // Landing exactly on a published bracket's mean income should report that
  // bracket, not a blend of it with its neighbour. Same numbers either way;
  // this is so profileBracket does not name two brackets for a household
  // sitting precisely on one of them.
  if (t <= 0) return lower;
  if (t >= 1) return upper;

  const categories = {} as SpendingCategories;
  for (const key of Object.keys(lower.categories) as (keyof SpendingCategories)[]) {
    categories[key] = lerp(lower.categories[key], upper.categories[key], t);
  }

  return {
    // Both ends named, because the household is genuinely between the two and
    // claiming either one alone would be the same overstatement as before.
    bracket: `${lower.bracket} to ${upper.bracket}`,
    incomeFloor: lower.incomeFloor,
    meanIncome: income,
    averageHouseholdSize: lerp(lower.averageHouseholdSize, upper.averageHouseholdSize, t),
    utilitiesSplit:
      lower.utilitiesSplit && upper.utilitiesSplit
        ? {
            insideGrossRent: lerp(
              lower.utilitiesSplit.insideGrossRent,
              upper.utilitiesSplit.insideGrossRent,
              t,
            ),
            telephone: lerp(lower.utilitiesSplit.telephone, upper.utilitiesSplit.telephone, t),
          }
        : undefined,
    cashContributions:
      lower.cashContributions !== undefined && upper.cashContributions !== undefined
        ? lerp(lower.cashContributions, upper.cashContributions, t)
        : undefined,
    ownerUpkeep:
      lower.ownerUpkeep && upper.ownerUpkeep
        ? {
            perConsumerUnit: lerp(
              lower.ownerUpkeep.perConsumerUnit,
              upper.ownerUpkeep.perConsumerUnit,
              t,
            ),
            homeownerShare: lerp(
              lower.ownerUpkeep.homeownerShare,
              upper.ownerUpkeep.homeownerShare,
              t,
            ),
            perOwner: lerp(lower.ownerUpkeep.perOwner, upper.ownerUpkeep.perOwner, t),
          }
        : undefined,
    categories,
    livingTotal: lerp(lower.livingTotal, upper.livingTotal, t),
    transport: {
      vehiclesPerHousehold: lerp(
        lower.transport.vehiclesPerHousehold,
        upper.transport.vehiclesPerHousehold,
        t,
      ),
      annualCostPerVehicle: lerp(
        lower.transport.annualCostPerVehicle,
        upper.transport.annualCostPerVehicle,
        t,
      ),
      goodsPerVehicle:
        lower.transport.goodsPerVehicle !== undefined &&
        upper.transport.goodsPerVehicle !== undefined
          ? lerp(lower.transport.goodsPerVehicle, upper.transport.goodsPerVehicle, t)
          : undefined,
      servicesPerVehicle:
        lower.transport.servicesPerVehicle !== undefined &&
        upper.transport.servicesPerVehicle !== undefined
          ? lerp(lower.transport.servicesPerVehicle, upper.transport.servicesPerVehicle, t)
          : undefined,
      transitSpending: lerp(lower.transport.transitSpending, upper.transport.transitSpending, t),
    },
  };
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

/**
 * True when the spending baseline already has sales tax inside it, which means
 * the engine must NOT add a separate sales tax line.
 *
 * It always did. BLS defines an expenditure as the transaction cost including
 * sales and excise tax, and where a respondent reports a price without tax BLS
 * adds it before publishing. So every figure in the basket is what the
 * household handed over at the till, and charging sales tax on top of it
 * charged it twice — once inside the price, once as its own line.
 *
 * Releases up to 2026.6 do not carry this field and keep charging the separate
 * line, so links already shared recompute the way they did when they were made
 * (PROJECT.md section 9.2).
 */
export function spendingIncludesSalesTax(version?: string): boolean {
  const treatment = datasetBundle(version).spending.salesTaxTreatment as
    | { includedInCategories?: boolean }
    | undefined;
  return treatment?.includedInCategories === true;
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
