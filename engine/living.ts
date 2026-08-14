/**
 * Living costs: food, goods, utilities, healthcare, services, transport, and
 * the sales tax paid on all of it.
 *
 * The central idea, from PROJECT.md section 2: a cost-of-living index measures
 * PRICES, not QUANTITIES. Re-pricing the same basket in a new city is right for
 * groceries and haircuts. It is wrong for cars, because moving from Manhattan
 * to Austin does not make your car cheaper — it makes you buy two.
 *
 * So everything except transport is "same basket, new prices". Transport is
 * "new quantity, national price".
 */

import {
  PARITY_FOR_CATEGORY,
  spendingProfile,
  transportDefaults,
  type PriceParity,
  type SalesTaxRules,
  type SpendingCategories,
  type TaxableShares,
} from './dataset';
import type { FilingStatus, LivingBreakdown, USD } from './types';
import { adultsIn } from './tax/state';

/** Default car count for a metro and household. See PROJECT.md D17. */
export function defaultCarCount(
  metroId: string,
  filingStatus: FilingStatus,
  version?: string,
  stateCode?: string,
): number {
  const { vehiclesPerAdult } = transportDefaults(metroId, version, stateCode);
  return Math.round(vehiclesPerAdult * adultsIn(filingStatus));
}

export interface TransportInputs {
  cars: number;
  annualCostPerVehicle: USD;
  transitSpending: USD;
  /** Fuel and vehicle servicing track local goods prices. */
  goodsParity: number;
}

/**
 * Transport cost from car COUNT.
 *
 * Transit spending is not scaled away when cars go to zero: a car-free
 * household in a transit-rich city still pays for travel, and typically more
 * than the national average. It is left at the national figure rather than
 * invented upward.
 */
export function computeTransport(inputs: TransportInputs): USD {
  const cars = Math.max(0, inputs.cars);
  const perCar = Math.max(0, inputs.annualCostPerVehicle) * inputs.goodsParity;
  return cars * perCar + Math.max(0, inputs.transitSpending);
}

export interface LivingInputs {
  metroId: string;
  /** Narrows vehicle ownership to one state's part of a split metro. */
  stateCode?: string;
  /**
   * The income whose spending profile defines the household's BASKET.
   *
   * This must be the SAME value for both cities in a comparison, and it is not
   * necessarily the city's own salary.
   *
   * PROJECT.md section 11, assumption 5: the household's lifestyle transfers —
   * the same basket of goods is re-priced in the new city, rather than assuming
   * they change how they live. Choosing the profile from each city's own salary
   * instead would let the BLS bracket boundaries leak into the answer: a move
   * that crosses from the $150k bracket to the $100k bracket would show a
   * five-figure "saving" on food and healthcare that is purely an artefact of
   * where the survey draws its lines, not anything about either city.
   */
  basketIncome: USD;
  filingStatus: FilingStatus;
  /** Adults plus children. Used for the equivalence adjustment below. */
  householdSize: number;
  cars: number;
  priceParity: PriceParity;
  /** Which shipped dataset the spending profiles come from. */
  datasetVersion?: string;
}

/**
 * Adjust a bracket's average basket to this household's size.
 *
 * BLS publishes spending by income only, but household size varies enormously
 * within a bracket — households in the $150k–$200k band average 3.1 people, so
 * a single filer handed that basket would be charged for a family of three.
 *
 * Scaling linearly would be equally wrong in the other direction: two people
 * do not need two fridges, two sofas or twice the heating. The standard fix is
 * the SQUARE ROOT equivalence scale, used by the OECD and in most inequality
 * research — needs grow with household size, but sub-linearly.
 *
 *   factor = sqrt(householdSize) / sqrt(bracketAverageSize)
 *
 * This factor is identical in both cities, so it barely moves the difference
 * between them. It matters for the absolute "money in your pocket" figure, and
 * therefore for the percentage, which is measured against that.
 */
export function equivalenceFactor(householdSize: number, bracketAverageSize: number): number {
  const size = Math.max(1, householdSize);
  const base = Math.max(1, bracketAverageSize);
  return Math.sqrt(size) / Math.sqrt(base);
}

export interface LivingResult extends LivingBreakdown {
  /** Category spend after price parities and household sizing. Feeds sales tax. */
  scaledCategories: SpendingCategories;
  profileBracket: string;
  /** How much the bracket's average basket was scaled for this household. */
  equivalenceFactor: number;
}

/** Re-price the national basket for this metro, then add transport. */
export function computeLiving(inputs: LivingInputs): LivingResult {
  const profile = spendingProfile(inputs.basketIncome, inputs.datasetVersion);
  const sizeFactor = equivalenceFactor(inputs.householdSize, profile.averageHouseholdSize);

  const scaledCategories = {} as SpendingCategories;
  for (const key of Object.keys(profile.categories) as (keyof SpendingCategories)[]) {
    const parityKey = PARITY_FOR_CATEGORY[key];
    scaledCategories[key] = profile.categories[key] * inputs.priceParity[parityKey] * sizeFactor;
  }

  const transport = computeTransport({
    cars: inputs.cars,
    annualCostPerVehicle: profile.transport.annualCostPerVehicle,
    transitSpending: profile.transport.transitSpending,
    goodsParity: inputs.priceParity.goods,
  });

  // Map internal categories onto the breakdown the results page shows.
  const food = scaledCategories.food;
  const utilities = scaledCategories.utilities;
  const healthcare = scaledCategories.healthcare;
  const other = scaledCategories.otherGoods + scaledCategories.otherServices;

  return {
    food,
    utilities,
    healthcare,
    transport,
    other,
    total: food + utilities + healthcare + transport + other,
    scaledCategories,
    profileBracket: profile.bracket,
    equivalenceFactor: sizeFactor,
  };
}

// ---------------------------------------------------------------------------
// Sales tax
// ---------------------------------------------------------------------------

export interface SalesTaxInputs {
  scaledCategories: SpendingCategories;
  rules: SalesTaxRules;
  shares: TaxableShares;
}

export interface SalesTaxResult {
  taxableSpending: USD;
  groceryTaxableSpending: USD;
  tax: USD;
  /** Sales tax as a share of the taxable base actually identified. */
  effectiveRateOnSpending: number;
}

/**
 * Sales tax on the household's spending.
 *
 * The taxable base is far smaller than total spending, for two reasons the
 * headline rate hides:
 *
 *   - Groceries are exempt in 40 states and reduced in several more, so food
 *     splits: the grocery portion at the state's grocery rate, restaurant
 *     meals at the ordinary rate.
 *   - Services are broadly untaxed everywhere, so healthcare and most of
 *     "other services" contribute very little.
 */
export function computeSalesTax(inputs: SalesTaxInputs): SalesTaxResult {
  const { scaledCategories: c, rules, shares } = inputs;

  const groceries = c.food * shares.food.groceryPortion;
  const restaurants = c.food * shares.food.restaurantPortion;

  const ordinaryBase =
    restaurants +
    c.otherGoods * shares.otherGoods +
    c.utilities * shares.utilities +
    c.healthcare * shares.healthcare +
    c.otherServices * shares.otherServices;

  const tax = ordinaryBase * rules.combinedRate + groceries * rules.grocery.effectiveRate;
  const taxableSpending = ordinaryBase + groceries;

  return {
    taxableSpending,
    groceryTaxableSpending: groceries,
    tax,
    effectiveRateOnSpending: taxableSpending > 0 ? tax / taxableSpending : 0,
  };
}
