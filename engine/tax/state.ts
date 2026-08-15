/**
 * State income tax.
 *
 * Data-driven: every state is described by the same shape, so there is no
 * per-state branching in this file. The nine states with no wage income tax
 * fall out naturally rather than being special-cased.
 */

import type { FilingStatus, Rate, USD } from '../types';
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
  /**
   * Mandatory employee payroll deductions this state levies — disability and
   * paid-leave contributions. Not income tax and not FICA, and modelled by
   * nothing before: California takes 1.3% of ALL wages with no ceiling, which
   * is $3,900 a year at $300,000 and was being shown to Californians as money
   * they had left to spend.
   */
  payrollContributions: PayrollContribution[];
  /**
   * One of the nine states where a couple filing separately each report half
   * the combined wages, whoever earned them. IRS Publication 555.
   */
  communityProperty: boolean;
  /**
   * How this state treats itemising, where its own rules have been read.
   *
   * Null means the standard deduction is always applied — which is what this
   * engine did everywhere, even though it already knew the reader's property
   * tax and mortgage interest. California and New York both allow itemising on
   * the state return regardless of the federal choice, and California's rules
   * are markedly more generous: no SALT cap, and mortgage interest on $1,000,000
   * of debt rather than $750,000.
   */
  itemizedDeductions: StateItemizedRules | null;
  /** AL, MO, OR allow a deduction for federal income tax paid. Not yet modelled. */
  federalTaxDeductible: boolean;
  hasLocalIncomeTax: boolean;
  notes: string[];
}

export interface PayrollContribution {
  id: string;
  name: string;
  rate: Rate;
  /** Null means the rate applies to every dollar. California is the one. */
  wageCap: USD | null;
  /**
   * True where the IRS treats this as a state income tax on Schedule A, which
   * it does for the California, New Jersey and New York disability funds, Rhode
   * Island's temporary disability fund and Washington's supplemental fund.
   * The newer paid-leave programmes have no such ruling and are left out of
   * the deduction — understating a deduction is the safe direction to be wrong.
   */
  deductible: boolean;
}

export interface PayrollContributionResult {
  total: USD;
  /** The part that counts toward the federal SALT deduction. */
  deductible: USD;
  lines: Array<{ id: string; name: string; amount: USD }>;
}

/**
 * What this state takes off the payslip on top of income tax.
 *
 * PER WORKER, not per household. Every one of these is capped against an
 * individual's own wages, so a couple earning $200,000 between them pay two
 * lots of a cap that a single earner on $200,000 hits once. Handing this the
 * household total would have made the same mistake the Social Security wage
 * base used to make here.
 */
export function computeStatePayroll(
  wages: USD,
  rules: Pick<StateTaxRules, 'payrollContributions'>,
  earners = 1,
): PayrollContributionResult {
  const workers = Math.max(1, Math.floor(earners));
  const perWorker = Math.max(0, wages) / workers;

  let total = 0;
  let deductible = 0;
  const lines: PayrollContributionResult['lines'] = [];

  for (const c of rules.payrollContributions ?? []) {
    const base = c.wageCap === null ? perWorker : Math.min(perWorker, c.wageCap);
    const amount = base * c.rate * workers;
    if (amount <= 0) continue;
    total += amount;
    if (c.deductible) deductible += amount;
    lines.push({ id: c.id, name: c.name, amount });
  }

  return { total, deductible, lines };
}

export interface StateItemizedRules {
  deductPropertyTax: boolean;
  /** False in California: you cannot deduct California tax from California income. */
  deductStateIncomeTax: boolean;
  /** California allows $1,000,000 where the federal limit is $750,000. */
  mortgageDebtLimit: USD | null;
}

export interface StateTaxInputs {
  grossSalary: USD;
  filingStatus: FilingStatus;
  children: number;
  /**
   * Housing costs, for states that let you itemise. Absent means the standard
   * deduction, which is what every caller did before this existed.
   */
  propertyTax?: USD;
  mortgageInterest?: USD;
  /** Average first-year loan balance, for the state's own debt limit. */
  mortgageDebt?: USD;
}

export interface StateTaxResult {
  stateCode: string;
  /** Which published schedule was actually used. */
  scheduleUsed: PublishedStatus;
  /** True when the state's itemised total beat its standard deduction. */
  itemized: boolean;
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
      itemized: false,
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

  const standardDeduction = rules.standardDeduction[schedule] ?? rules.standardDeduction[otherwise];

  /*
   * Itemise where the state allows it and it beats the standard deduction.
   *
   * Only property tax and mortgage interest, because they are the only two
   * figures this engine knows. A real return also carries charitable giving,
   * medical costs and the rest, so this is a floor — a reader with those does
   * better than it says, never worse.
   */
  const itemizedRules = rules.itemizedDeductions;
  let itemizedTotal = 0;
  if (itemizedRules) {
    if (itemizedRules.deductPropertyTax) itemizedTotal += Math.max(0, inputs.propertyTax ?? 0);
    const interest = Math.max(0, inputs.mortgageInterest ?? 0);
    const debt = inputs.mortgageDebt;
    const limit = itemizedRules.mortgageDebtLimit;
    itemizedTotal +=
      limit !== null && debt !== undefined && debt > limit
        ? interest * (limit / debt)
        : interest;
  }

  const itemized = itemizedTotal > standardDeduction;
  const deductions = itemized ? itemizedTotal : standardDeduction;
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
    itemized,
    deductions,
    exemptions,
    taxableIncome,
    taxBeforeCredits,
    credits,
    // Credits are treated as non-refundable: they can zero out tax, not go below.
    tax: Math.max(0, taxBeforeCredits - credits),
  };
}
