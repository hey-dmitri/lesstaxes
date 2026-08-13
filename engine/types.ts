/**
 * Pack or Stay — domain model.
 *
 * This file has NO framework dependencies and must never gain any.
 * See engine/README.md for the rule and why it exists.
 *
 * CONVENTION: every monetary value is an ANNUAL amount in whole US dollars,
 * unless the property name explicitly says otherwise (e.g. `monthlyRent`).
 * This convention is the single most important thing to preserve — mixing
 * annual and monthly figures is the most likely way to produce a number that
 * is wrong by exactly 12x and looks plausible.
 */

/** An annual amount in US dollars. */
export type USD = number;

/** A rate expressed as a fraction, not a percentage. 6.8% is 0.068. */
export type Rate = number;

export type FilingStatus =
  | 'single'
  | 'marriedJointly'
  | 'marriedSeparately'
  | 'headOfHousehold';

export type Tenure = 'rent' | 'own';

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

export interface RentHousing {
  tenure: 'rent';
  monthlyRent: USD;
}

export interface OwnHousing {
  tenure: 'own';
  homePrice: USD;
  downPayment: Rate;
  mortgageRate: Rate;
  propertyTaxRate: Rate;
}

export type Housing = RentHousing | OwnHousing;

/** Everything that varies between the two cities being compared. */
export interface CityInputs {
  /** CBSA code, or a synthetic id for a "rest of <state>" region. */
  metroId: string;
  grossSalary: USD;
  housing: Housing;
  /** Defaults to metro vehicles-per-adult x adults; user-adjustable. */
  cars: number;
}

/** Everything that is the same in both cities. */
export interface Household {
  filingStatus: FilingStatus;
  children: number;
}

export interface ComparisonInputs {
  /** Pins the dataset so a shared link always recomputes identically. */
  datasetVersion: string;
  household: Household;
  origin: CityInputs;
  destination: CityInputs;
}

// ---------------------------------------------------------------------------
// Results
// ---------------------------------------------------------------------------

export interface TaxBreakdown {
  federal: USD;
  state: USD;
  /** NYC, Yonkers, and PA/OH/MD localities. Zero nearly everywhere. */
  local: USD;
  fica: USD;
  total: USD;
  /** True when itemized deductions beat the standard deduction. */
  itemized: boolean;
  deductionTaken: USD;
}

export interface HousingBreakdown {
  /** Rent, or mortgage principal + interest. Principal counts as an outflow (D25). */
  shelter: USD;
  propertyTax: USD;
  insurance: USD;
  total: USD;
  /**
   * First-year mortgage interest. Feeds the federal itemization test.
   * Zero for renters.
   */
  mortgageInterest: USD;
}

export interface LivingBreakdown {
  food: USD;
  utilities: USD;
  healthcare: USD;
  /** Derived from car COUNT, not just car prices. See PROJECT.md section 2. */
  transport: USD;
  other: USD;
  total: USD;
  /**
   * Which BLS income band supplied the basket. Identical for both cities in a
   * comparison — the household's lifestyle travels with them and is re-priced,
   * rather than being re-selected from each city's salary.
   */
  profileBracket: string;
  /**
   * How much that band's average basket was scaled for this household's size,
   * using the square-root equivalence scale.
   */
  equivalenceFactor: number;
}

/** The full picture for one city. */
export interface CityResult {
  metroId: string;
  grossSalary: USD;
  tax: TaxBreakdown;
  housing: HousingBreakdown;
  living: LivingBreakdown;
  salesTax: USD;
  /** gross - tax - housing - living - salesTax. The headline quantity. */
  /**
   * Gross minus every mandatory tax, before a penny is spent.
   *
   * The number on a payslip, and the anchor the interface was missing: leftover
   * is unfamiliar and unguessable, take-home is neither.
   */
  takeHome: USD;
  leftover: USD;
}

export type CategoryKey =
  | 'salary'
  | 'federalTax'
  | 'stateTax'
  | 'localTax'
  | 'fica'
  | 'housing'
  | 'propertyTax'
  | 'transport'
  | 'living'
  | 'salesTax';

/**
 * Which half of the story a row belongs to.
 *
 * The redesign splits the breakdown in two, because "your pay changed" and
 * "your costs changed" are different kinds of news and a reader sorting one
 * list by size has to hold both in their head at once.
 */
export type CategoryGroup = 'payAndTax' | 'living';

export interface CategoryDelta {
  key: CategoryKey;
  label: string;
  group: CategoryGroup;
  /** Positive means better off in the destination. */
  delta: USD;
}

export interface ComparisonResult {
  datasetVersion: string;
  origin: CityResult;
  destination: CityResult;

  /** destination.leftover - origin.leftover. Negative means worse off. */
  delta: USD;
  /** delta as a fraction of origin.leftover. */
  deltaPct: Rate;
  deltaMonthly: USD;

  /**
   * The destination computed at the ORIGIN salary.
   *
   * Exposed so the interface can show, line by line, what the city did versus
   * what the pay change did. Without it, a reader comparing two columns at
   * different salaries naturally misreads salary-driven differences in federal
   * tax and FICA as if the location caused them.
   */
  destinationAtOriginSalary: CityResult;
  /** Effect of the city alone, holding salary at the origin level. */
  cityEffect: USD;
  /** Effect of the salary change alone. cityEffect + salaryEffect === delta. */
  salaryEffect: USD;

  /** Destination salary at which delta would be exactly zero. */
  breakEvenSalary: USD;

  /** Sorted by absolute impact, largest first. */
  breakdown: CategoryDelta[];
}
