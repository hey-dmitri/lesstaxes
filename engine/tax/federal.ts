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

/** One row of the published EITC table, for a given number of children. */
export interface EitcBand {
  children: number;
  /** Earned income at which the credit reaches its maximum. */
  earnedIncomeAmount: USD;
  maxCredit: USD;
  creditRate: Rate;
  phaseOutRate: Rate;
  thresholdPhaseOut: { marriedJointly: USD; other: USD };
  completedPhaseOut: { marriedJointly: USD; other: USD };
}

export interface EitcRules {
  investmentIncomeLimit: USD;
  /** Indexed 0..3, where 3 means "three or more". */
  byChildren: EitcBand[];
}

export interface FederalRules {
  brackets: Record<FilingStatus, Bracket[]>;
  standardDeduction: Record<FilingStatus, USD>;
  saltCap: SaltRules;
  childTaxCredit: ChildTaxCreditRules;
  /** Absent on releases cut before the EITC was modelled. */
  earnedIncomeCredit?: EitcRules;
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
  /** Earned Income Tax Credit. Fully refundable. */
  earnedIncomeCredit: USD;
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

/**
 * The Earned Income Tax Credit.
 *
 * Fully refundable, and for a low-income family with children it is the single
 * largest number in the whole federal calculation — up to $8,231 in 2026. The
 * engine did not model it at all, so a head of household on $18,290 with two
 * children was shown a $2,369 refund when the real figure is that plus $7,316.
 * Leaving out a credit that large does not merely make the estimate imprecise,
 * it inverts what "money left over" means for the households least able to
 * absorb a wrong answer.
 *
 * A trapezoid: it phases IN at creditRate on every dollar earned, sits flat at
 * maxCredit, then phases OUT at phaseOutRate above the threshold. The plateau
 * and the phase-out start at different incomes, which is why both have to be
 * tracked separately rather than derived from one another.
 *
 * ASSUMPTIONS, all of which the methodology page states:
 *   - Wage income only, so earned income and AGI are the same figure. That is
 *     already true of the rest of this engine.
 *   - No investment income, so the $12,200 disqualification never bites.
 *   - The childless credit assumes the filer is 25 to 64, which §32(c)(1)(A)
 *     requires and this site never asks. It is worth at most $664.
 *   - Married filing separately generally cannot claim it, and does not here.
 */
export function earnedIncomeCreditFor(
  earnedIncome: USD,
  filingStatus: FilingStatus,
  children: number,
  rules: EitcRules | undefined,
): USD {
  if (!rules) return 0; // release predates the credit being modelled

  // Separate filers are barred by §32(d) outside narrow circumstances this
  // site cannot ask about, so claiming it for them would be the wrong default.
  if (filingStatus === 'marriedSeparately') return 0;

  const income = Math.max(0, earnedIncome);
  const band = rules.byChildren[Math.min(3, Math.max(0, Math.floor(children)))];
  if (!band) return 0;

  const key = filingStatus === 'marriedJointly' ? 'marriedJointly' : 'other';
  const threshold = band.thresholdPhaseOut[key];

  /*
   * On the plateau, use the PUBLISHED maximum rather than recomputing it.
   * Three or more children is 18,290 x 45% = 8,230.50, which the IRS rounds up
   * to the 8,231 printed in the table and paid by the Form 1040 tables. Half a
   * dollar is nothing; reproducing the published figure exactly is not, because
   * it is the only way a reader can check this against the source.
   */
  const credit =
    income >= band.earnedIncomeAmount
      ? band.maxCredit
      : Math.min(income * band.creditRate, band.maxCredit);

  if (income <= threshold) return credit;

  const reduction = (income - threshold) * band.phaseOutRate;
  return Math.max(0, Math.min(credit, band.maxCredit - reduction));
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

  // --- Earned Income Tax Credit --------------------------------------------
  // Fully refundable, so it comes off the liability whether or not there is
  // any tax left to offset. Wage income only, so earned income is the salary.
  const earnedIncomeCredit = earnedIncomeCreditFor(
    magi,
    filingStatus,
    children,
    rules.earnedIncomeCredit,
  );

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
    earnedIncomeCredit,
    tax: taxBeforeCredits - childTaxCredit - earnedIncomeCredit,
  };
}
