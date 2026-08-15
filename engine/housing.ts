/**
 * Housing costs — the largest line in most comparisons.
 *
 * Two jobs, and they feed different parts of the engine:
 *
 *   1. CASH OUT     what leaves the bank account each year
 *   2. TAX INPUTS   property tax and first-year mortgage interest, which the
 *                   federal itemisation test needs (see engine/tax/federal.ts)
 *
 * Per PROJECT.md D25, mortgage PRINCIPAL counts as an outflow. It builds
 * equity rather than vanishing, but the headline figure is cash in your pocket,
 * and principal is cash that left your pocket.
 */

import type { HousingBreakdown, Housing, Rate, USD } from './types';

const MONTHS_PER_YEAR = 12;
const DEFAULT_TERM_YEARS = 30;

/**
 * Standard amortising payment. Handles a zero interest rate, which the naive
 * formula divides by zero on.
 */
export function monthlyMortgagePayment(
  principal: USD,
  annualRate: Rate,
  years: number = DEFAULT_TERM_YEARS,
): USD {
  if (principal <= 0) return 0;

  const n = years * MONTHS_PER_YEAR;
  const r = annualRate / MONTHS_PER_YEAR;

  if (r === 0) return principal / n;

  const growth = (1 + r) ** n;
  return (principal * r * growth) / (growth - 1);
}

/**
 * Walk the first twelve payments, month by month rather than as
 * `principal * rate`, because the balance falls a little each month.
 */
function amortiseFirstYear(
  principal: USD,
  annualRate: Rate,
  years: number,
): { interest: USD; endBalance: USD } {
  if (principal <= 0) return { interest: 0, endBalance: 0 };

  const payment = monthlyMortgagePayment(principal, annualRate, years);
  const r = annualRate / MONTHS_PER_YEAR;

  let balance = principal;
  let interest = 0;

  for (let month = 0; month < MONTHS_PER_YEAR && balance > 0; month++) {
    const monthInterest = balance * r;
    interest += monthInterest;
    balance -= payment - monthInterest;
  }

  return { interest, endBalance: Math.max(0, balance) };
}

/**
 * Interest paid during the first twelve months.
 *
 * Only the FIRST year is used: it is the year the comparison is about, and it
 * is the most interest the borrower will ever pay, so using it is the least
 * favourable assumption for itemising.
 */
export function firstYearInterest(
  principal: USD,
  annualRate: Rate,
  years: number = DEFAULT_TERM_YEARS,
): USD {
  if (principal <= 0 || annualRate <= 0) return 0;
  return amortiseFirstYear(principal, annualRate, years).interest;
}

/**
 * Average loan balance across the first year.
 *
 * The mortgage interest deduction is capped by DEBT, not by interest, so the
 * engine has to know how much was owed as well as what it cost. Publication 936
 * offers several ways to average a balance that falls every month; this is the
 * "average of first and last balance" method, which it permits for an
 * amortising loan paid at least monthly.
 */
export function firstYearAverageBalance(
  principal: USD,
  annualRate: Rate,
  years: number = DEFAULT_TERM_YEARS,
): USD {
  if (principal <= 0) return 0;
  const { endBalance } = amortiseFirstYear(principal, annualRate, years);
  return (principal + endBalance) / 2;
}

export interface HousingInputs {
  housing: Housing;
  /**
   * Extra insurance ON TOP of what annualMaintenance already carries.
   *
   * This used to be the home-insurance line, always zero, with a note saying no
   * dataset existed. One did: the published figure for an owned home bundles
   * maintenance, repairs and insurance into a single item, and the engine was
   * throwing all three away together. See annualMaintenance.
   *
   * Nothing in the app passes this. It is left as an override for a caller who
   * knows their premium is unusual — Florida and Louisiana run at a multiple of
   * the national average — and anything passed here ADDS to the baseline rather
   * than replacing it.
   */
  annualInsurance?: USD;
  /**
   * Repairs, upkeep and home insurance for the year. Owners only.
   *
   * Charged here because the engine drops the whole published shelter block and
   * rebuilds it from the reader's own numbers. It used to rebuild only the
   * mortgage payment and the property tax, which left every owner paying
   * nothing to keep the house standing — $4,000 a year at $100,000 of income,
   * and $7,268 above $200,000.
   */
  annualMaintenance?: USD;
  mortgageTermYears?: number;
  /**
   * Gas, electricity, water and heating fuel for this metro and household.
   *
   * Charged to OWNERS only. A renter's figure is Census gross rent, which is
   * contract rent plus exactly these, so adding them again would bill them
   * twice — which is what this engine used to do. A mortgage covers none of
   * them, so for owners they belong here or nowhere.
   */
  annualUtilities?: USD;
}

export function computeHousing(inputs: HousingInputs): HousingBreakdown {
  const insurance = Math.max(0, inputs.annualInsurance ?? 0);
  const h = inputs.housing;

  if (h.tenure === 'rent') {
    const shelter = Math.max(0, h.monthlyRent) * MONTHS_PER_YEAR;
    return {
      tenure: 'rent',
      shelter,
      propertyTax: 0,
      insurance,
      // Already inside the rent above. See annualUtilities.
      utilities: 0,
      // A tenant's landlord pays for the roof.
      maintenance: 0,
      total: shelter + insurance,
      mortgageInterest: 0,
      mortgageDebt: 0,
    };
  }

  const utilities = Math.max(0, inputs.annualUtilities ?? 0);
  const maintenance = Math.max(0, inputs.annualMaintenance ?? 0);

  const homePrice = Math.max(0, h.homePrice);
  const downPayment = Math.min(Math.max(h.downPayment, 0), 1);
  const principal = homePrice * (1 - downPayment);
  const term = inputs.mortgageTermYears ?? DEFAULT_TERM_YEARS;

  const shelter = monthlyMortgagePayment(principal, h.mortgageRate, term) * MONTHS_PER_YEAR;
  const propertyTax = homePrice * Math.max(0, h.propertyTaxRate);
  const mortgageInterest = firstYearInterest(principal, h.mortgageRate, term);
  const mortgageDebt = firstYearAverageBalance(principal, h.mortgageRate, term);

  return {
    tenure: 'own',
    shelter,
    propertyTax,
    insurance,
    utilities,
    maintenance,
    total: shelter + propertyTax + insurance + utilities + maintenance,
    mortgageInterest,
    mortgageDebt,
  };
}
