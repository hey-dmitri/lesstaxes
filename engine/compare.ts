/**
 * The whole calculation: one city, then the other, then the difference.
 *
 * ORDER OF OPERATIONS IS LOAD-BEARING. Each step below feeds the next, and
 * getting the sequence wrong is the single most common way a relocation
 * calculator produces a confident wrong answer:
 *
 *   1. Living costs    national basket re-priced by metro, sales tax included
 *   2. Housing         produces property tax and first-year mortgage interest,
 *                      and takes the utility slice step 1 hands it
 *   3. State tax       depends on salary and filing status
 *   4. Local tax       Yonkers levies a surcharge ON the state liability
 *   5. Federal tax     state + local + property tax feed the SALT deduction,
 *                      which decides whether itemising beats the standard
 *                      deduction, which changes federal tax
 *   6. Sales tax       nothing to add — see that step for why it is zero
 *   7. Leftover        salary minus everything above
 *
 * Computing federal tax before state tax would silently ignore the deduction
 * and overstate federal liability in every high-tax state.
 *
 * Living costs lead because of the utility bill: a renter's Census gross rent
 * already contains gas, electricity, water and heating, and an owner's mortgage
 * contains none of them, so the basket has to hand that slice to housing before
 * housing can total itself.
 *
 * Steps 3-5, and FICA with them, run once PER TAX RETURN rather than once per
 * household — a couple filing separately files two. See taxReturnsFor. Housing
 * and living costs are properties of the home, so they are computed once
 * whatever the household does with its paperwork.
 */

import {
  bedroomsFor,
  defaultLocalJurisdictions,
  homePriceDefault,
  housingDefaults,
  metro,
  rentDefault,
  resolveStateCode,
  salesTaxRules,
  spendingIncludesSalesTax,
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
import { taxReturnsFor } from './tax/returns';
import { adultsIn, computeStateTax } from './tax/state';
import type {
  CategoryDelta,
  CategoryKey,
  CityInputs,
  CityResult,
  ComparisonInputs,
  ComparisonResult,
  Household,
  Housing,
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

  // The state the person lives in, not the metro's first.
  const stateCode = resolveStateCode(city.metroId, city.stateCode, version);

  /*
   * 1. Living costs.
   *
   * These come first now, ahead of housing, and the reason is the utility bill.
   * A renter's figure is Census gross rent, which already includes gas,
   * electricity, water and heating. An owner's mortgage includes none of them.
   * So the basket hands that slice to the housing step, which charges it only
   * to owners — and housing needs it before it can total itself.
   *
   * Nothing here depends on tax or on housing, so moving it up costs nothing.
   */
  const living = computeLiving({
    metroId: city.metroId,
    stateCode,
    basketIncome: options.basketIncome ?? gross,
    filingStatus: household.filingStatus,
    householdSize: adultsIn(household.filingStatus) + Math.max(0, household.children),
    cars: city.cars,
    priceParity: m.priceParity,
    datasetVersion: version,
  });

  // 2. Housing — produces the tax inputs the federal step needs, and depends on
  //    none of them, so it is settled before any return is filled in.
  const housing = computeHousing({
    housing: city.housing,
    annualInsurance: options.annualInsurance,
    annualUtilities: living.utilitiesInsideRent,
  });

  const jurisdictions =
    options.localJurisdictions ?? defaultLocalJurisdictions(city.metroId, version, stateCode);
  const stateTaxRules = stateRules(stateCode, version);
  const fedRules = federalRules(version);
  const payrollRules = ficaRules(version);

  // 3-5. Every income tax, once per return. One return for most households,
  //      two when a couple files separately and both of them earn.
  let ficaTotal = 0;
  let stateTotal = 0;
  let localTotal = 0;
  let federalTotal = 0;
  let deductionTaken = 0;
  let itemized = false;

  for (const share of taxReturnsFor(household, gross)) {
    // FICA, per worker on that return
    ficaTotal += computeFica(
      share.grossSalary,
      household.filingStatus,
      payrollRules,
      share.earners,
    ).total;

    // 3. State income tax
    const state = computeStateTax(
      {
        grossSalary: share.grossSalary,
        filingStatus: household.filingStatus,
        children: share.children,
      },
      stateTaxRules,
    );
    stateTotal += state.tax;

    // 4. Local income tax — may be a surcharge on THIS return's state liability
    let local = 0;
    for (const j of jurisdictions) {
      local += computeLocalTax(
        {
          grossSalary: share.grossSalary,
          filingStatus: household.filingStatus,
          children: share.children,
          stateTax: state.tax,
        },
        j,
      ).tax;
    }
    localTotal += local;

    // 5. Federal income tax — needs everything above, and its own share of the
    //    housing deductions, because the SALT cap applies per return.
    const federal = computeFederal(
      {
        grossSalary: share.grossSalary,
        filingStatus: household.filingStatus,
        children: share.children,
        stateAndLocalIncomeTax: state.tax + local,
        propertyTax: housing.propertyTax * share.deductionShare,
        mortgageInterest: housing.mortgageInterest * share.deductionShare,
        // The debt splits with the interest, and the separate filer's limit is
        // half the joint one, so two separate returns reach the same answer as
        // one joint return on the same loan.
        mortgageDebt: housing.mortgageDebt * share.deductionShare,
      },
      fedRules,
    );
    federalTotal += federal.tax;
    deductionTaken += federal.deductionTaken;
    // Two returns can land on different sides of the choice. The flag means
    // "some of this household's deduction was itemised", which is what the
    // breakdown line it drives is telling the reader.
    itemized = itemized || federal.itemized;
  }

  /*
   * 6. Sales tax — ZERO, because the basket already contains it.
   *
   * The living costs above come from the BLS Consumer Expenditure Survey, and
   * BLS defines an expenditure as the transaction cost INCLUDING sales and
   * excise tax. Where a respondent reported a price without tax, BLS adds it
   * before publishing. Every figure in that basket is what the household
   * actually handed over at the till.
   *
   * So the separate line this used to add charged sales tax twice: once inside
   * the grocery bill, once again beside it.
   *
   * What is lost by removing it: the basket carries the sales tax of wherever
   * its households happened to live, which is a national blend. Moving from
   * Oregon, which levies none, to Tennessee, which levies the most, no longer
   * shows any sales tax difference at all. Modelling that properly means
   * stripping the embedded average out and applying the local rate instead,
   * and the survey does not publish the embedded amount per category. An
   * unmodelled difference of a few hundred dollars is a smaller error than a
   * doubled charge, so it waits for data that can support it.
   */
  const salesTax = spendingIncludesSalesTax(version)
    ? 0
    : computeSalesTax({
        scaledCategories: living.scaledCategories,
        rules: salesTaxRules(stateCode, version),
        shares: taxableShares(version),
      }).tax;

  // 7. Leftover
  const taxTotal = federalTotal + stateTotal + localTotal + ficaTotal;
  const takeHome = gross - taxTotal;
  const leftover = takeHome - housing.total - living.total - salesTax;

  return {
    metroId: city.metroId,
    stateCode,
    grossSalary: gross,
    tax: {
      federal: federalTotal,
      state: stateTotal,
      local: localTotal,
      fica: ficaTotal,
      total: taxTotal,
      itemized,
      deductionTaken,
    },
    housing,
    living,
    salesTax,
    takeHome,
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
  stateCode?: string,
): USD {
  const bedrooms = bedroomsFor(adultsIn(household.filingStatus), household.children);
  return rentDefault(metroId, grossSalary, bedrooms, version, stateCode);
}

/**
 * Is this housing figure still the one the site filled in, or did the user
 * type it?
 *
 * Rent and home price both depend on income, so any calculation that moves the
 * salary has to decide what happens to them. A prefill still sitting at its
 * default should move, because that is what a household on the new salary
 * would actually rent or buy. A figure the user typed is theirs and is held.
 *
 * Inferred by comparing against the default rather than stored as a flag. A
 * flag would have to travel in the share link, which means a wire-format
 * change, and the one case inference gets wrong — typing a number that happens
 * to equal the prefill exactly — produces the behaviour you would want anyway.
 */
export function housingIsPrefill(
  metroId: string,
  housing: Housing,
  grossSalary: USD,
  household: Household,
  version?: string,
  stateCode?: string,
): boolean {
  return housing.tenure === 'rent'
    ? housing.monthlyRent === defaultRent(metroId, grossSalary, household, version, stateCode)
    : housing.homePrice === homePriceDefault(metroId, grossSalary, version, stateCode);
}

/**
 * The same housing re-derived for a different salary — but only if it is still
 * a prefill. Everything else about an owned home (deposit, mortgage rate,
 * property tax rate) is a separate choice and is carried through untouched.
 *
 * Three callers need this and all three used to disagree. The break-even
 * solver moved rent but not home price. The middle "city at your current pay"
 * column moved neither, so a rent chosen for the OFFER salary was priced as if
 * the city had caused it: New York to Austin at $150k against a $110k offer
 * reported a $28,543 city effect when $24,319 was the city's doing and $4,224
 * was the salary's. And the form moved rent but left home price stale while
 * the hint underneath said what it should have been.
 */
export function housingAtSalary(
  metroId: string,
  housing: Housing,
  fromSalary: USD,
  toSalary: USD,
  household: Household,
  version?: string,
  stateCode?: string,
): Housing {
  if (!housingIsPrefill(metroId, housing, fromSalary, household, version, stateCode)) {
    return housing;
  }

  return housing.tenure === 'rent'
    ? {
        tenure: 'rent',
        monthlyRent: defaultRent(metroId, toSalary, household, version, stateCode),
      }
    : { ...housing, homePrice: homePriceDefault(metroId, toSalary, version, stateCode) };
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
  const stateCode = metro(metroId, version).primaryState;
  const h = housingDefaults(metroId, version, stateCode);

  return {
    metroId,
    stateCode,
    grossSalary,
    cars: defaultCarCount(metroId, household.filingStatus, version, stateCode),
    housing:
      tenure === 'rent'
        ? {
            tenure: 'rent',
            monthlyRent: defaultRent(metroId, grossSalary, household, version, stateCode),
          }
        : {
            tenure: 'own',
            homePrice: homePriceDefault(metroId, grossSalary, version, stateCode),
            downPayment: 0.2,
            mortgageRate,
            propertyTaxRate: h.effectivePropertyTaxRate,
          },
  };
}

// ---------------------------------------------------------------------------
// Comparison
// ---------------------------------------------------------------------------

const CATEGORY_GROUPS: Record<CategoryKey, 'payAndTax' | 'living'> = {
  salary: 'payAndTax',
  federalTax: 'payAndTax',
  stateTax: 'payAndTax',
  localTax: 'payAndTax',
  fica: 'payAndTax',
  housing: 'living',
  propertyTax: 'living',
  transport: 'living',
  living: 'living',
  salesTax: 'living',
};

const CATEGORY_LABELS: Record<CategoryKey, string> = {
  salary: 'Salary',
  federalTax: 'Federal income tax',
  stateTax: 'State income tax',
  localTax: 'Local income tax',
  fica: 'Social Security & Medicare',
  // Replaced per comparison by housingLabel — the reader either rents or buys,
  // and "rent or mortgage" makes them work out which half applies to them.
  housing: 'Rent or mortgage',
  propertyTax: 'Property tax',
  transport: 'Cars & transport',
  living: 'Food, phone, healthcare, other',
  salesTax: 'Sales tax',
};

/**
 * What to call the housing row, given what each side is doing.
 *
 * It says "plus utilities" in every case because the figure contains them
 * either way — inside the rent for a renter, added on for an owner. Saying so
 * is the difference between a reader thinking the site forgot their power bill
 * and a reader knowing where it went.
 */
export function housingLabel(origin: 'rent' | 'own', destination: 'rent' | 'own'): string {
  if (origin !== destination) return 'Housing + utilities';
  return origin === 'rent' ? 'Rent + utilities' : 'Mortgage + utilities';
}

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
    /*
     * Shelter AND the utility bill, because the label says so and because the
     * breakdown has to reconcile to the headline. A renter's gross rent already
     * contains gas, electricity, water and heating; an owner's mortgage does
     * not, so the engine charges them separately. Leaving that second figure
     * out of this row would drop it out of the breakdown while it stayed in
     * leftover, and every owner's rows would stop adding up.
     */
    [
      'housing',
      origin.housing.shelter +
        origin.housing.utilities -
        (destination.housing.shelter + destination.housing.utilities),
    ],
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
    .map(([key, delta]) => ({
      key,
      label:
        key === 'housing'
          ? housingLabel(origin.housing.tenure, destination.housing.tenure)
          : CATEGORY_LABELS[key],
      group: CATEGORY_GROUPS[key],
      delta,
    }))
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

  /*
   * A salary the solver is testing implies different housing than the one on
   * screen, whenever the figure on screen is still a prefill. Without this,
   * quoting a break-even salary and then entering it produced an answer a few
   * hundred dollars off zero, because the housing shifted underneath.
   *
   * This used to handle rent only, so the same drift survived for buyers.
   */
  const cityAt = (salary: USD): CityInputs => ({
    ...destination,
    grossSalary: salary,
    housing: housingAtSalary(
      destination.metroId,
      destination.housing,
      destination.grossSalary,
      salary,
      inputs.household,
      options.datasetVersion,
      destination.stateCode,
    ),
  });

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
   *
   * Prefilled housing has to move with the salary here too, or the split is
   * wrong in a way that is invisible: a rent the site chose because the OFFER
   * was $110,000 was being priced into a column labelled "at your current pay",
   * so the city got credit for a saving the pay cut had caused.
   */
  const destinationAtOriginSalary = computeCity(
    {
      ...inputs.destination,
      grossSalary: inputs.origin.grossSalary,
      housing: housingAtSalary(
        inputs.destination.metroId,
        inputs.destination.housing,
        inputs.destination.grossSalary,
        inputs.origin.grossSalary,
        inputs.household,
        datasetVersion,
        inputs.destination.stateCode,
      ),
    },
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
