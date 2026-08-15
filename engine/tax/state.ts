/**
 * State income tax.
 *
 * Data-driven: every state is described by the same shape, so there is no
 * per-state branching in this file. The nine states with no wage income tax
 * fall out naturally rather than being special-cased.
 */

import type { FilingStatus, USD } from '../types';
import { applyBrackets, type Bracket } from './brackets';

/** The schedules states actually publish. */
export type PublishedStatus = 'single' | 'marriedJointly' | 'headOfHousehold';

export interface StateTaxRules {
  code: string;
  name: string;
  hasWageIncomeTax: boolean;
  /**
   * headOfHousehold is present only where the state genuinely publishes a third
   * schedule. Where it is absent, headOfHouseholdBasis says which of the other
   * two the state itself directs a head of household to use.
   */
  brackets: Partial<Record<PublishedStatus, Bracket[]>> & Record<'single' | 'marriedJointly', Bracket[]>;
  standardDeduction: Partial<Record<PublishedStatus, USD>> &
    Record<'single' | 'marriedJointly', USD>;
  /**
   * Which schedule a head of household actually files on in this state.
   *
   * 'own'            the state publishes a third schedule; use brackets.headOfHousehold
   * 'marriedJointly' the state directs them to the joint schedule (Maryland does)
   * 'single'         the state directs them to the single schedule, verified
   * 'assumed-single' NOT verified against the state's own publication yet
   *
   * The last value is the honest one and it is deliberately not called 'single'.
   * Every graduated state used to be treated as though it were 'single' with
   * nothing recording whether anyone had checked, and in California that
   * overcharged a single parent $2,028 a year.
   */
  headOfHouseholdBasis: 'own' | 'marriedJointly' | 'single' | 'assumed-single';
  personalExemption: {
    single: USD;
    marriedJointly: USD;
    headOfHousehold?: USD;
    /** Per dependent. */
    dependent: USD;
  };
  /** Allowances some states express as a credit against tax rather than income. */
  personalCredit: {
    single: USD;
    marriedJointly: USD;
    headOfHousehold?: USD;
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
 * Which published schedule this filer actually uses in this state.
 *
 * HEAD OF HOUSEHOLD IS NOT SINGLE, AND CALLING IT SINGLE COST REAL MONEY. This
 * used to map every head of household onto the single schedule and describe it
 * as "conservative". California publishes its own Schedule Z, which is far
 * wider than Schedule X: on $120,000 of taxable income California charges
 * $5,570 and this engine charged $7,599. Maryland sends them to the JOINT
 * schedule outright. Those are not roundings, and they land on single parents.
 *
 * Passing no rules keeps the old two-schedule behaviour, which is what a
 * release cut before this carried.
 *
 * Married filing separately still maps to single, which is right in the large
 * majority of states.
 */
export function scheduleFor(
  filingStatus: FilingStatus,
  rules?: Pick<StateTaxRules, 'headOfHouseholdBasis' | 'brackets'>,
): PublishedStatus {
  if (filingStatus === 'marriedJointly') return 'marriedJointly';
  if (filingStatus !== 'headOfHousehold') return 'single';

  switch (rules?.headOfHouseholdBasis) {
    case 'own':
      // Only if the schedule is actually there. A basis of 'own' with no
      // brackets would silently fall back rather than throw, so check.
      return rules.brackets.headOfHousehold ? 'headOfHousehold' : 'single';
    case 'marriedJointly':
      return 'marriedJointly';
    default:
      return 'single';
  }
}

/**
 * Number of adults implied by filing status. Drives the living-cost basket,
 * the bedroom count behind the rent prefill, and the default car count.
 *
 * BOTH married statuses count two. This used to test for marriedJointly alone,
 * which quietly made a couple filing separately a household of one: it fed them
 * a one-adult grocery basket, sized them a smaller home, and gave them half the
 * cars. Whether two spouses file one return or two is a paperwork question. It
 * does not change how many people are eating in the kitchen.
 *
 * A couple who file separately BECAUSE they have separated and live apart are
 * modelled as sharing a home here. The form asks "one of us earns" or "we both
 * earn", which is a question about a household, so that is the reading the rest
 * of the engine is entitled to.
 */
export function adultsIn(filingStatus: FilingStatus): 1 | 2 {
  return filingStatus === 'marriedJointly' || filingStatus === 'marriedSeparately' ? 2 : 1;
}

export function computeStateTax(
  inputs: StateTaxInputs,
  rules: StateTaxRules,
): StateTaxResult {
  const schedule = scheduleFor(inputs.filingStatus, rules);

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

  /*
   * A state can publish its own head-of-household schedule and still not
   * publish its own head-of-household deduction, exemption or credit. Each
   * falls back independently to the schedule the filer would otherwise be on,
   * rather than all three following whichever one happens to exist — that is
   * the same field-by-field fallback the split-metro housing uses, and for the
   * same reason.
   */
  const otherwise: 'single' | 'marriedJointly' =
    schedule === 'marriedJointly' ? 'marriedJointly' : 'single';

  const deductions = rules.standardDeduction[schedule] ?? rules.standardDeduction[otherwise];
  const exemptions =
    (rules.personalExemption[schedule] ?? rules.personalExemption[otherwise]) +
    rules.personalExemption.dependent * children;

  const taxableIncome = Math.max(0, gross - deductions - exemptions);
  const taxBeforeCredits = applyBrackets(
    taxableIncome,
    rules.brackets[schedule] ?? rules.brackets[otherwise],
  );

  const credits =
    (rules.personalCredit[schedule] ?? rules.personalCredit[otherwise]) +
    rules.personalCredit.dependent * children;

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
