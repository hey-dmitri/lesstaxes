/**
 * FICA — Social Security and Medicare payroll tax.
 *
 * Federal, so it is identical in both cities. It does NOT cancel out of the
 * comparison, though, because the salary itself may differ between cities.
 */

import type { FilingStatus, Rate, USD } from '../types';

export interface FicaRules {
  socialSecurityRate: Rate;
  socialSecurityWageBase: USD;
  medicareRate: Rate;
  additionalMedicareRate: Rate;
  additionalMedicareThreshold: Record<FilingStatus, USD>;
}

export interface FicaResult {
  socialSecurity: USD;
  medicare: USD;
  additionalMedicare: USD;
  total: USD;
}

/**
 * Compute the employee share of FICA on wage income.
 *
 * THE SOCIAL SECURITY CAP IS PER WORKER, NOT PER HOUSEHOLD.
 *
 * This engine takes one household salary figure (PROJECT.md D3), and it used
 * to apply the wage-base cap to that figure once, as though a single person
 * had earned all of it. For a couple on $300,000 split between two jobs that
 * understated Social Security tax by $7,161 a year: the model charged $11,439
 * where two earners each below the base owe 6.2% of the whole $300,000, or
 * $18,600.
 *
 * The defence used to be that FICA is federal so the error cancels out of the
 * comparison. That only holds when the salary is the same on both sides, and
 * changing the salary is the central thing this tool is for.
 *
 * So the household now says how many people are earning, and the wage base is
 * applied to each of them. The split is assumed EVEN, which is the strongest
 * assumption here: an uneven split pushes more of the total under one person's
 * cap and owes less. Two equal earners is the case the assumption is exactly
 * right for and the one people mean when they say "we both work".
 *
 * Medicare is unaffected — it has no cap — and the Additional Medicare Tax
 * threshold is a per-RETURN figure, so it stays on the household total.
 */
export function computeFica(
  wages: USD,
  filingStatus: FilingStatus,
  rules: FicaRules,
  earners = 1,
): FicaResult {
  const taxableWages = Math.max(0, wages);
  const workers = Math.max(1, Math.floor(earners));

  const perWorker = taxableWages / workers;
  const socialSecurity =
    Math.min(perWorker, rules.socialSecurityWageBase) * rules.socialSecurityRate * workers;

  // Medicare has no wage cap.
  const medicare = taxableWages * rules.medicareRate;

  // Per RETURN, not per worker — a joint return has one threshold.
  const threshold = rules.additionalMedicareThreshold[filingStatus];
  const additionalMedicare =
    Math.max(0, taxableWages - threshold) * rules.additionalMedicareRate;

  return {
    socialSecurity,
    medicare,
    additionalMedicare,
    total: socialSecurity + medicare + additionalMedicare,
  };
}
