/**
 * The whole calculation: one city, then the other, then the difference.
 *
 * ORDER OF OPERATIONS IS LOAD-BEARING. Each step below feeds the next, and
 * getting the sequence wrong is the single most common way a relocation
 * calculator produces a confident wrong answer:
 *
 *   1. FICA            depends only on salary
 *   2. Housing         produces property tax and first-year mortgage interest
 *   3. State tax       depends on salary and filing status
 *   4. Local tax       Yonkers levies a surcharge ON the state liability
 *   5. Federal tax     state + local + property tax feed the SALT deduction,
 *                      which decides whether itemising beats the standard
 *                      deduction, which changes federal tax
 *   6. Living costs    national basket re-priced by metro
 *   7. Sales tax       applied to the taxable share of that basket
 *   8. Leftover        salary minus everything above
 *
 * Computing federal tax before state tax would silently ignore the deduction
 * and overstate federal liability in every high-tax state.
 */

import {
  bedroomsFor,
  defaultLocalJurisdictions,
  homePriceDefault,
  housingDefaults,
  metro,
  rentDefault,
  salesTaxRules,
  taxableShares,
  transportDefaults,
  DATASET_VERSION,
} from './dataset';
import { computeHousing } from './housing';
import { computeLiving, computeSalesTax, defaultCarCount } from './living';
import { computeFederal } from './tax/federal';
import { computeFica } from './tax/fica';
import { computeLocalTax, type LocalTaxRules } from './tax/local';
import { federalRules, ficaRules, stateRules } from './tax/rules';
import { adultsIn, computeStateTax } from './tax/state';
import type {
  CategoryDelta,
  CategoryKey,
  CityInputs,
  CityResult,
  ComparisonInputs,
  ComparisonResult,
  Household,
  USD,
} from './types';

export interface CityComputeOptions {
  /** Overrides the metro's default local jurisdictions (NYC, Yonkers). */
  localJurisdictions?: LocalTaxRules[];
  annualInsurance?: USD;
  /**
   * Income defining the household's spending BASKET. Must be identical for both
   * cities in a comparison — see LivingInputs.basketIncome. Defaults to the
   * city's own salary when computing a single city in isolation.
   */
  basketIncome?: USD;
  /**
   * Which shipped dataset to compute against. Defaults to the current release.
   *
   * This is what makes PROJECT.md §9.2 true: a shared link carries the version
   * it was made with, and passing it here means the recipient recomputes
   * against that data — and against that release's MODEL, since the accessors
   * fall back to how an older bundle worked when it lacks a newer field.
   */
  datasetVersion?: string;
}

/** Everything about one city. */
export function computeCity(
  city: CityInputs,
  household: Household,
  options: CityComputeOptions = {},
): CityResult {
  const version = options.datasetVersion;
  const m = metro(city.metroId, version);
  const gross = Math.max(0, city.grossSalary);

  // 1. FICA
  const fica = computeFica(gross, household.filingStatus, ficaRules(version));

  // 2. Housing — produces the tax inputs the federal step needs
  const housing = computeHousing({
    housing: city.housing,
    annualInsurance: options.annualInsurance,
  });

  // 3. State income tax
  const state = computeStateTax(
    { grossSalary: gross, filingStatus: household.filingStatus, children: household.children },
    stateRules(m.primaryState, version),
  );

  // 4. Local income tax — may be a surcharge on the state liability
  const jurisdictions =
    options.localJurisdictions ?? defaultLocalJurisdictions(city.metroId, version);
  let localTotal = 0;
  for (const j of jurisdictions) {
    localTotal += computeLocalTax(
      {
        grossSalary: gross,
        filingStatus: household.filingStatus,
        children: household.children,
        stateTax: state.tax,
      },
      j,
    ).tax;
  }

  // 5. Federal income tax — needs everything above
  const federal = computeFederal(
    {
      grossSalary: gross,
      filingStatus: household.filingStatus,
      children: household.children,
      stateAndLocalIncomeTax: state.tax + localTotal,
      propertyTax: housing.propertyTax,
      mortgageInterest: housing.mortgageInterest,
    },
    federalRules(version),
  );

  // 6. Living costs
  const living = computeLiving({
    metroId: city.metroId,
    basketIncome: options.basketIncome ?? gross,
    filingStatus: household.filingStatus,
    householdSize: adultsIn(household.filingStatus) + Math.max(0, household.children),
    cars: city.cars,
    priceParity: m.priceParity,
    datasetVersion: version,
  });

  // 7. Sales tax
  const salesTax = computeSalesTax({
    scaledCategories: living.scaledCategories,
    rules: salesTaxRules(m.primaryState, version),
    shares: taxableShares(version),
  });

  // 8. Leftover
  const taxTotal = federal.tax + state.tax + localTotal + fica.total;
  const leftover = gross - taxTotal - housing.total - living.total - salesTax.tax;

  return {
    metroId: city.metroId,
    grossSalary: gross,
    tax: {
      federal: federal.tax,
      state: state.tax,
      local: localTotal,
      fica: fica.total,
      total: taxTotal,
      itemized: federal.itemized,
      deductionTaken: federal.deductionTaken,
    },
    housing,
    living,
    salesTax: salesTax.tax,
    leftover,
  };
}

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

/**
 * The rent this household is quoted in a metro.
 *
 * Sized from household composition and scaled for income — see bedroomsFor and
 * rentFactorForIncome. Both corrections matter: the raw metro median priced a
 * family of four and a single person identically, and priced a $150,000 earner
 * as though they rented like a household on the metro median income.
 */
export function defaultRent(
  metroId: string,
  grossSalary: USD,
  household: Household,
  version?: string,
): USD {
  const bedrooms = bedroomsFor(adultsIn(household.filingStatus), household.children);
  return rentDefault(metroId, grossSalary, bedrooms, version);
}

/**
 * A sensible starting point for a city, so the form produces a useful answer
 * with zero typing (PROJECT.md D4). Every value is editable.
 */
export function defaultCityInputs(
  metroId: string,
  grossSalary: USD,
  household: Household,
  tenure: 'rent' | 'own' = 'rent',
  mortgageRate = 0.068,
  version?: string,
): CityInputs {
  const h = housingDefaults(metroId, version);

  return {
    metroId,
    grossSalary,
    cars: defaultCarCount(metroId, household.filingStatus, version),
    housing:
      tenure === 'rent'
        ? { tenure: 'rent', monthlyRent: defaultRent(metroId, grossSalary, household, version) }
        : {
            tenure: 'own',
            homePrice: homePriceDefault(metroId, grossSalary, version),
            downPayment: 0.2,
            mortgageRate,
            propertyTaxRate: h.effectivePropertyTaxRate,
          },
  };
}

// ---------------------------------------------------------------------------
// Comparison
// ---------------------------------------------------------------------------

const CATEGORY_LABELS: Record<CategoryKey, string> = {
  salary: 'Salary',
  federalTax: 'Federal income tax',
  stateTax: 'State income tax',
  localTax: 'Local income tax',
  fica: 'Social Security & Medicare',
  housing: 'Rent or mortgage',
  propertyTax: 'Property tax',
  transport: 'Cars & transport',
  living: 'Food, utilities, healthcare, other',
  salesTax: 'Sales tax',
};

/**
 * Build the breakdown, sorted by absolute impact so the big levers dominate
 * visually and small ones cannot masquerade as important.
 *
 * Sign convention: POSITIVE means better off in the destination.
 */
function buildBreakdown(origin: CityResult, destination: CityResult): CategoryDelta[] {
  // More salary is good; more of any cost is bad, hence the inversion.
  const raw: Array<[CategoryKey, number]> = [
    ['salary', destination.grossSalary - origin.grossSalary],
    ['federalTax', origin.tax.federal - destination.tax.federal],
    ['stateTax', origin.tax.state - destination.tax.state],
    ['localTax', origin.tax.local - destination.tax.local],
    ['fica', origin.tax.fica - destination.tax.fica],
    ['housing', origin.housing.shelter - destination.housing.shelter],
    ['propertyTax', origin.housing.propertyTax - destination.housing.propertyTax],
    ['transport', origin.living.transport - destination.living.transport],
    [
      'living',
      origin.living.food + origin.living.utilities + origin.living.healthcare + origin.living.other -
        (destination.living.food + destination.living.utilities + destination.living.healthcare + destination.living.other),
    ],
    ['salesTax', origin.salesTax - destination.salesTax],
  ];

  return raw
    .map(([key, delta]) => ({ key, label: CATEGORY_LABELS[key], delta }))
    .filter((row) => Math.abs(row.delta) >= 1)
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
}

/**
 * Destination salary at which the move breaks even.
 *
 * Binary search rather than algebra: leftover is monotonic in salary but
 * piecewise — tax brackets, the SALT cap, the itemisation threshold and the
 * spending-profile steps all introduce kinks. Sixty iterations converge to
 * well under a dollar and cost nothing.
 *
 * Returns 0 when the destination is already ahead at zero salary — there is no
 * salary you need, which is a real answer and a good one. Returns null only
 * when no salary in a sane range would close the gap. Collapsing those two into
 * one value left the interface unable to say either.
 */
export function breakEvenSalary(
  inputs: ComparisonInputs,
  originLeftover: USD,
  options: CityComputeOptions = {},
): USD | null {
  const destination = inputs.destination;

  /**
   * Rent depends on income now, so a salary the solver is testing implies a
   * different rent than the one on screen. Whether it should follow depends on
   * where the current figure came from: a prefill still sitting at its default
   * should move with the salary, because that is what the household would
   * actually rent; a figure the user typed is their own and is held fixed.
   *
   * Without this, quoting a break-even salary and then entering it produced an
   * answer a few hundred dollars off zero, because the rent shifted underneath.
   */
  const rentTracksSalary =
    destination.housing.tenure === 'rent' &&
    destination.housing.monthlyRent ===
      defaultRent(
        destination.metroId,
        destination.grossSalary,
        inputs.household,
        options.datasetVersion,
      );

  const cityAt = (salary: USD): CityInputs =>
    rentTracksSalary && destination.housing.tenure === 'rent'
      ? {
          ...destination,
          grossSalary: salary,
          housing: {
            tenure: 'rent',
            monthlyRent: defaultRent(
              destination.metroId,
              salary,
              inputs.household,
              options.datasetVersion,
            ),
          },
        }
      : { ...destination, grossSalary: salary };

  const leftoverAt = (salary: USD) =>
    computeCity(cityAt(salary), inputs.household, options).leftover;

  let low = 0;
  let high = Math.max(inputs.origin.grossSalary, inputs.destination.grossSalary) * 4 + 250_000;

  // These two nulls mean opposite things and used to be flattened into the
  // same silent 0 by the caller. Zero is returned for "ahead even on nothing",
  // which is real news; null stays for genuinely unreachable.
  if (leftoverAt(low) >= originLeftover) return 0; // ahead at any salary at all
  if (leftoverAt(high) < originLeftover) return null; // unreachable in any sane range

  for (let i = 0; i < 60; i++) {
    const mid = (low + high) / 2;
    if (leftoverAt(mid) < originLeftover) low = mid;
    else high = mid;
  }
  return (low + high) / 2;
}

export function compare(
  inputs: ComparisonInputs,
  options: { origin?: CityComputeOptions; destination?: CityComputeOptions } = {},
): ComparisonResult {
  // The household's existing lifestyle sets the basket, and it travels with
  // them. Pinning it to the origin salary keeps BLS bracket boundaries out of
  // the answer — see LivingInputs.basketIncome.
  const basketIncome = inputs.origin.grossSalary;
  // The link's version wins over any per-city override, so both halves of a
  // comparison are always priced against the same release.
  const datasetVersion = inputs.datasetVersion || DATASET_VERSION;
  const originOpts = { ...options.origin, basketIncome, datasetVersion };
  const destinationOpts = { ...options.destination, basketIncome, datasetVersion };

  const origin = computeCity(inputs.origin, inputs.household, originOpts);
  const destination = computeCity(inputs.destination, inputs.household, destinationOpts);

  const delta = destination.leftover - origin.leftover;

  /**
   * Split the answer into "the city is cheaper/pricier" and "the salary
   * changed", by re-running the destination at the ORIGIN salary. Without this
   * the headline conflates two very different things — exactly the trap in a
   * move that pairs a cheaper city with a pay cut.
   */
  const destinationAtOriginSalary = computeCity(
    { ...inputs.destination, grossSalary: inputs.origin.grossSalary },
    inputs.household,
    destinationOpts,
  );
  const cityEffect = destinationAtOriginSalary.leftover - origin.leftover;

  return {
    datasetVersion,
    origin,
    destination,
    destinationAtOriginSalary,
    delta,
    deltaPct: origin.leftover !== 0 ? delta / origin.leftover : 0,
    deltaMonthly: delta / 12,
    cityEffect,
    salaryEffect: delta - cityEffect,
    breakEvenSalary: breakEvenSalary(inputs, origin.leftover, destinationOpts) ?? 0,
    breakdown: buildBreakdown(origin, destination),
  };
}

/** Convenience: default everything, for a quick comparison. */
export function quickCompare(
  originMetroId: string,
  destinationMetroId: string,
  grossSalary: USD,
  household: Household,
  destinationSalary = grossSalary,
): ComparisonResult {
  return compare({
    datasetVersion: DATASET_VERSION,
    household,
    origin: defaultCityInputs(originMetroId, grossSalary, household),
    destination: defaultCityInputs(destinationMetroId, destinationSalary, household),
  });
}

export { transportDefaults };
