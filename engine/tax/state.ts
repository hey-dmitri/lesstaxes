/**
 * State income tax.
 *
 * Data-driven: every state is described by the same shape, so there is no
 * per-state branching in this file. The nine states with no wage income tax
 * fall out naturally rather than being special-cased.
 */

import type { FilingStatus, USD } from '../types';
import { applyBrackets, type Bracket } from './brackets';

/** The two schedules states actually publish. */
export type PublishedStatus = 'single' | 'marriedJointly';

export interface StateTaxRules {
  code: string;
  name: string;
  hasWageIncomeTax: boolean;
  brackets: Record<PublishedStatus, Bracket[]>;
  standardDeduction: Record<PublishedStatus, USD>;
  personalExemption: {
    single: USD;
    marriedJointly: USD;
    /** Per dependent. */
    dependent: USD;
  };
  /** Allowances some states express as a credit against tax rather than income. */
  personalCredit: {
    single: USD;
    marriedJointly: USD;
    dependent: USD;
  };
  /** AL, MO, OR allow a deduction for federal income tax paid. Not yet modelled. */
  federalTaxDeductible: boolean;
  hasLocalIncomeTax: boolean;
  notes: string[];
}

export interface StateTaxInputs {
  grossSalary: USD;
  filingStatus: FilingStatus;
  children: number;
}

export interface StateTaxResult {
  stateCode: string;
  /** Which published schedule was actually used. */
  scheduleUsed: PublishedStatus;
  deductions: USD;
  exemptions: USD;
  taxableIncome: USD;
  taxBeforeCredits: USD;
  credits: USD;
  tax: USD;
}

/**
 * States publish single and married-filing-jointly schedules. Map the four
 * federal filing statuses onto those two.
 *
 * Married filing separately -> single: correct in the large majority of states.
 * Head of household -> single: a documented approximation. Some states publish
 * a distinct head-of-household schedule; using single is conservative (it
 * generally produces slightly more tax, never a spuriously good result).
 */
export function scheduleFor(filingStatus: FilingStatus): PublishedStatus {
  return filingStatus === 'marriedJointly' ? 'marriedJointly' : 'single';
}

/** Number of adults implied by filing status. Also used for car defaults. */
export function adultsIn(filingStatus: FilingStatus): 1 | 2 {
  return filingStatus === 'marriedJointly' ? 2 : 1;
}

export function computeStateTax(
  inputs: StateTaxInputs,
  rules: StateTaxRules,
): StateTaxResult {
  const schedule = scheduleFor(inputs.filingStatus);

  if (!rules.hasWageIncomeTax) {
    return {
      stateCode: rules.code,
      scheduleUsed: schedule,
      deductions: 0,
      exemptions: 0,
      taxableIncome: 0,
      taxBeforeCredits: 0,
      credits: 0,
      tax: 0,
    };
  }

  const gross = Math.max(0, inputs.grossSalary);
  const children = Math.max(0, inputs.children);

  const deductions = rules.standardDeduction[schedule];
  const exemptions =
    rules.personalExemption[schedule] + rules.personalExemption.dependent * children;

  const taxableIncome = Math.max(0, gross - deductions - exemptions);
  const taxBeforeCredits = applyBrackets(taxableIncome, rules.brackets[schedule]);

  const credits =
    rules.personalCredit[schedule] + rules.personalCredit.dependent * children;

  return {
    stateCode: rules.code,
    scheduleUsed: schedule,
    deductions,
    exemptions,
    taxableIncome,
    taxBeforeCredits,
    credits,
    // Credits are treated as non-refundable: they can zero out tax, not go below.
    tax: Math.max(0, taxBeforeCredits - credits),
  };
}
