/**
 * Federal income tax.
 *
 * ORDER MATTERS: this must run AFTER state, local and property tax have been
 * computed, because those feed the SALT deduction and therefore the
 * itemize-versus-standard test. Computing federal tax first is the single most
 * common way a relocation calculator goes wrong. See PROJECT.md section 6.
 */

import type { FilingStatus, Rate, USD } from '../types';
import { applyBrackets, type Bracket } from './brackets';

export interface SaltRules {
  cap: Record<FilingStatus, USD>;
  phaseDownStartMagi: Record<FilingStatus, USD>;
  phaseDownRate: Rate;
  floor: Record<FilingStatus, USD>;
}

export interface ChildTaxCreditRules {
  perChild: USD;
  refundablePerChild: USD;
  phaseOutStart: Record<FilingStatus, USD>;
  phaseOutPerThousand: USD;
}

export interface FederalRules {
  brackets: Record<FilingStatus, Bracket[]>;
  standardDeduction: Record<FilingStatus, USD>;
  saltCap: SaltRules;
  childTaxCredit: ChildTaxCreditRules;
}

export interface FederalInputs {
  grossSalary: USD;
  filingStatus: FilingStatus;
  children: number;
  /** State + local INCOME tax already computed for this city. */
  stateAndLocalIncomeTax: USD;
  /** Property tax already computed for this city. Zero for renters. */
  propertyTax: USD;
  /** First-year mortgage interest. Zero for renters. */
  mortgageInterest: USD;
}

export interface FederalResult {
  /** The SALT cap actually available, after any high-income phase-down. */
  saltCapApplied: USD;
  /** State + local + property tax actually deductible, after the cap. */
  saltDeducted: USD;
  itemizedTotal: USD;
  standardDeduction: USD;
  /** Whichever of the two was larger. */
  deductionTaken: USD;
  itemized: boolean;
  taxableIncome: USD;
  taxBeforeCredits: USD;
  childTaxCredit: USD;
  /** Negative means a net refund. */
  tax: USD;
}

/**
 * The SALT cap is itself phased down for high earners: reduced by 30 cents per
 * dollar of MAGI above the threshold, but never below a floor.
 */
export function saltCapFor(
  magi: USD,
  filingStatus: FilingStatus,
  rules: SaltRules,
): USD {
  const base = rules.cap[filingStatus];
  const start = rules.phaseDownStartMagi[filingStatus];
  const floor = rules.floor[filingStatus];

  if (magi <= start) return base;

  const reduction = (magi - start) * rules.phaseDownRate;
  return Math.max(floor, base - reduction);
}

/**
 * Child Tax Credit before any refundability test. Phases out by $50 for each
 * $1,000 (or fraction thereof) of MAGI above the threshold.
 */
export function childTaxCreditFor(
  magi: USD,
  filingStatus: FilingStatus,
  children: number,
  rules: ChildTaxCreditRules,
): USD {
  if (children <= 0) return 0;

  const full = rules.perChild * children;
  const start = rules.phaseOutStart[filingStatus];
  if (magi <= start) return full;

  // "or fraction thereof" — the excess is rounded UP to the next $1,000.
  const thousandsOver = Math.ceil((magi - start) / 1000);
  const reduction = thousandsOver * rules.phaseOutPerThousand;

  return Math.max(0, full - reduction);
}

export function computeFederal(
  inputs: FederalInputs,
  rules: FederalRules,
): FederalResult {
  const { grossSalary, filingStatus, children } = inputs;

  // With wage income only, MAGI is the salary.
  const magi = Math.max(0, grossSalary);

  // --- Deduction: itemize or take the standard, whichever is larger ---------
  const saltCapApplied = saltCapFor(magi, filingStatus, rules.saltCap);
  const saltPaid = Math.max(
    0,
    inputs.stateAndLocalIncomeTax + inputs.propertyTax,
  );
  const saltDeducted = Math.min(saltPaid, saltCapApplied);

  const itemizedTotal = saltDeducted + Math.max(0, inputs.mortgageInterest);
  const standardDeduction = rules.standardDeduction[filingStatus];

  const itemized = itemizedTotal > standardDeduction;
  const deductionTaken = Math.max(itemizedTotal, standardDeduction);

  // --- Tax on what's left ---------------------------------------------------
  const taxableIncome = Math.max(0, magi - deductionTaken);
  const taxBeforeCredits = applyBrackets(
    taxableIncome,
    rules.brackets[filingStatus],
  );

  // --- Child Tax Credit -----------------------------------------------------
  const creditAvailable = childTaxCreditFor(
    magi,
    filingStatus,
    children,
    rules.childTaxCredit,
  );

  // Non-refundable portion first: it can reduce tax to zero but not below.
  const nonRefundableUsed = Math.min(creditAvailable, taxBeforeCredits);

  // Anything left over may be partly refundable (the Additional Child Tax
  // Credit): capped per child, and limited to 15% of earned income over $2,500.
  const unused = creditAvailable - nonRefundableUsed;
  let refundable = 0;
  if (unused > 0 && children > 0) {
    const perChildCap = rules.childTaxCredit.refundablePerChild * children;
    const earnedIncomeFormula = 0.15 * Math.max(0, magi - 2500);
    refundable = Math.min(unused, perChildCap, earnedIncomeFormula);
  }

  const childTaxCredit = nonRefundableUsed + refundable;

  return {
    saltCapApplied,
    saltDeducted,
    itemizedTotal,
    standardDeduction,
    deductionTaken,
    itemized,
    taxableIncome,
    taxBeforeCredits,
    childTaxCredit,
    tax: taxBeforeCredits - childTaxCredit,
  };
}
