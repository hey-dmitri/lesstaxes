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
 * KNOWN LIMITATION — single-earner assumption:
 * The Social Security wage base is a PER-WORKER cap, but this app collects a
 * single household salary figure (PROJECT.md D3) and therefore applies the cap
 * once, as though one person earned it all.
 *
 * For a married couple earning $250,000 split evenly, each spouse is below the
 * base, so real Social Security tax is 6.2% of the full $250,000. Treating it
 * as one earner caps it at the wage base and understates the tax by roughly
 * $4,000.
 *
 * This is accepted because:
 *   - the common case for this tool is one person weighing one job offer;
 *   - FICA is federal, so the error is nearly identical in both cities and
 *     very largely cancels out of the headline comparison.
 *
 * It is disclosed on the methodology page.
 */
export function computeFica(
  wages: USD,
  filingStatus: FilingStatus,
  rules: FicaRules,
): FicaResult {
  const taxableWages = Math.max(0, wages);

  const socialSecurity =
    Math.min(taxableWages, rules.socialSecurityWageBase) * rules.socialSecurityRate;

  // Medicare has no wage cap.
  const medicare = taxableWages * rules.medicareRate;

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
