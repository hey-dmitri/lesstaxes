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
 * Interest paid during the first twelve months.
 *
 * Computed month by month rather than as `principal * rate`, because the
 * balance falls a little each month. Only the FIRST year is used: it is the
 * year the comparison is about, and it is the most interest the borrower will
 * ever pay, so using it is the least favourable assumption for itemising.
 */
export function firstYearInterest(
  principal: USD,
  annualRate: Rate,
  years: number = DEFAULT_TERM_YEARS,
): USD {
  if (principal <= 0 || annualRate <= 0) return 0;

  const payment = monthlyMortgagePayment(principal, annualRate, years);
  const r = annualRate / MONTHS_PER_YEAR;

  let balance = principal;
  let interest = 0;

  for (let month = 0; month < MONTHS_PER_YEAR && balance > 0; month++) {
    const monthInterest = balance * r;
    interest += monthInterest;
    balance -= payment - monthInterest;
  }

  return interest;
}

export interface HousingInputs {
  housing: Housing;
  /**
   * Annual home or renters insurance.
   *
   * KNOWN DATA GAP: no per-state insurance dataset is loaded yet, so callers
   * currently pass 0 and the figure is absent from results. This understates
   * ownership costs everywhere, and badly in Florida and Louisiana where
   * premiums are a multiple of the national average. Tracked as the top
   * remaining data refinement alongside city-specific local income tax rates.
   */
  annualInsurance?: USD;
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
      total: shelter + insurance,
      mortgageInterest: 0,
    };
  }

  const utilities = Math.max(0, inputs.annualUtilities ?? 0);

  const homePrice = Math.max(0, h.homePrice);
  const downPayment = Math.min(Math.max(h.downPayment, 0), 1);
  const principal = homePrice * (1 - downPayment);
  const term = inputs.mortgageTermYears ?? DEFAULT_TERM_YEARS;

  const shelter = monthlyMortgagePayment(principal, h.mortgageRate, term) * MONTHS_PER_YEAR;
  const propertyTax = homePrice * Math.max(0, h.propertyTaxRate);
  const mortgageInterest = firstYearInterest(principal, h.mortgageRate, term);

  return {
    tenure: 'own',
    shelter,
    propertyTax,
    insurance,
    utilities,
    total: shelter + propertyTax + insurance + utilities,
    mortgageInterest,
  };
}
