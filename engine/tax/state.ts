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
  /**
   * Whether anybody has opened this state's own 2026 rate schedule and compared
   * every bracket and every allowance to what we ship. Null means nobody has.
   *
   * The bracket table behind this dataset is published once a year, in
   * February, and states legislate through the spring — four of them moved
   * underneath it in 2026, all in the direction that overcharges. So "our
   * source is reputable" is not a claim about whether a figure is current, and
   * this field is the one that is.
   *
   * `matched` true means the state's own publication agreed and nothing needed
   * changing. Recorded on purpose: "checked and agreed" and "never looked"
   * produce identical numbers, and only a written record tells them apart.
   */
  ratesCheckedAgainstState: { url: string; checked: string; matched: boolean } | null;
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
  /**
   * The state's own earned income credit, where it has one and where two
   * independent sources agreed on it. Null otherwise.
   *
   * REFUNDABILITY MATTERS MORE THAN THE PERCENTAGE for the households this
   * reaches. A refundable credit pays out below zero tax; a nonrefundable one
   * stops at zero and is worth nothing to a family that already owes nothing —
   * which is exactly the family it is aimed at.
   */
  earnedIncomeCredit: StateEitcRules | null;
  /**
   * A personal credit that shrinks as income rises, where the state has one.
   *
   * UTAH IS THE WHOLE REASON THIS EXISTS, and it could not be modelled without
   * it. Utah has no standard deduction at all: the allowance is a credit worth
   * 6% of the federal deduction, reduced by 1.3 cents for every dollar of
   * income above a threshold that depends on filing status. So the credit is
   * $966 for a single filer at low income, and exactly nothing above $92,521.
   *
   * A flat credit could not express that. Shipping the $966 unconditionally
   * would have understated Utah tax for most people this site is used by,
   * which is the dangerous direction; dropping it — what happened before —
   * overcharges everyone below the threshold.
   */
  creditPhaseOut: CreditPhaseOut | null;
  /**
   * How the standard deduction and/or personal exemption shrink as income
   * rises, where the state does that. Null means they do not.
   */
  allowancePhaseOut: AllowancePhaseOut | null;
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
  /**
   * A cap on deductible state and local tax, where the state applies one.
   *
   * Null means uncapped, which is not an oversight: California explicitly does
   * not conform to the federal SALT limit, so a Californian deducts every
   * dollar of property tax. Copying the federal cap into every state would
   * have quietly overcharged them.
   */
  saltCap: USD | null;
  /**
   * How the state cuts itemised deductions for high earners.
   *
   * THIS RAN THE READER'S WAY AND WAS DOCUMENTED AS SUCH FOR MONTHS. California
   * reduces itemised deductions by the lesser of 6% of income above roughly
   * $252,000 or 80% of the deductions themselves, and we applied neither — so
   * every high-earning Californian homeowner was shown a bigger deduction than
   * they get, and therefore more money left over than they will have.
   *
   * The "lesser of" is the whole shape: the percentage bites first, and the
   * 80% floor stops the reduction ever taking the deduction below a fifth of
   * itself no matter how high income goes.
   */
  highIncomeReduction: ItemizedReduction | null;
}

/** See StateItemizedRules.highIncomeReduction. */
export interface ItemizedReduction {
  /** Dollars of deduction lost per dollar of income above the threshold. */
  perDollarAbove: number;
  /** Where the reduction starts, by published filing status. */
  threshold: Partial<Record<PublishedStatus, number>> & { single: number };
  /** The reduction never exceeds this share of the deductions themselves. */
  maxFractionOfDeductions: number;
}

export interface StateEitcRules {
  /** Flat share of the federal credit, or null when it varies with children. */
  percentOfFederal: number | null;
  /** Share by number of children, indexed 0..3 where 3 means three or more. */
  byChildren: Record<number, number> | null;
  refundable: boolean;
  /**
   * A ceiling on the credit, where the state sets one. Null means none.
   *
   * South Carolina added one in 2026 and it changes what the credit IS: 125%
   * of even a modest federal credit clears the $200 cap immediately, so for
   * almost every claimant with children this is a flat $200 rather than a
   * percentage of anything. Applying the percentage alone would overstate it
   * several times over.
   */
  maxCredit: USD | null;
}

/**
 * How a state's DEDUCTION or EXEMPTION shrinks as income rises.
 *
 * Straight-line: the allowance falls from its full value at `start` to nothing
 * once income is `range` dollars past it. South Carolina's new income adjusted
 * deduction works exactly this way, and so do Wisconsin's and Rhode Island's
 * standard deductions.
 *
 * These were listed for months under "not modelled", and the direction is why
 * they matter: ignoring a phase-out hands the reader an allowance the state
 * takes away, so we show more money left over than they will have. That is the
 * error that flatters a destination, and a flattering verdict is the one that
 * actually moves somebody across the country.
 */
/** One straight line of a taper: the allowance at `start`, falling per dollar. */
export interface PhaseOutSegment {
  /** The allowance at and below `start`. */
  base: USD;
  start: USD;
  /** Dollars of allowance lost per dollar of income above `start`. */
  perDollar: number;
}

export type AllowanceKind = 'standardDeduction' | 'personalExemption';

/**
 * How a state's deduction or exemption shrinks as income rises.
 *
 * These sat under "not modelled" for months and the direction is why they
 * matter: ignoring a phase-out hands the reader an allowance the state takes
 * away, so the site shows more money left over than they will actually have.
 * A flattering verdict is the one that actually moves somebody across country.
 *
 * TWO SHAPES, because states genuinely use two.
 *
 * 'linear' computes the allowance OUTRIGHT from straight lines. Where a status
 * has more than one segment the answer is the LARGEST — Wisconsin tapers a head
 * of household steeply from $18,030 and then, past $58,827, along the same line
 * a single filer follows from $13,960. Those are two lines that cross exactly
 * where the statute switches, so taking the larger reproduces the rule without
 * any special-casing.
 *
 * 'stepped' scales whatever the allowance already is. Rhode Island does not
 * taper at all: it drops the deduction AND every exemption in four twenty-point
 * steps, so a household can lose a fifth of both by earning one dollar more.
 */
export type AllowancePhaseOut =
  | {
      kind: 'linear';
      /**
       * A segment's base is a FIXED amount, so this may only be pointed at an
       * allowance that does not move with the number of children. The build
       * refuses to point it at exemptions in a state that has a dependent
       * exemption, which would silently drop the children's share.
       */
      appliesTo: AllowanceKind[];
      segments: Partial<Record<PublishedStatus, PhaseOutSegment[]>> & {
        single: PhaseOutSegment[];
      };
      /** Round the REDUCTION down to this multiple, where the state says to. */
      roundReductionDownTo?: number;
      /**
       * Which line wins where a status has more than one.
       *
       * 'max' is Wisconsin: two alternative formulas that cross, and the
       * statute switches to whichever gives more. 'min' is Minnesota, where
       * the reduction steepens past a second threshold so the lines stack
       * rather than compete. Defaults to 'max'.
       */
      combine?: 'max' | 'min';
      /** The allowance never falls below this share of itself. Minnesota caps
          its reduction at 80%, leaving a fifth standing however high income
          goes. */
      floorFraction?: number;
    }
  | {
      kind: 'stepped';
      appliesTo: AllowanceKind[];
      /** Income above which the steps begin, by filing status. */
      start: Partial<Record<PublishedStatus, number>> & { single: number };
      /** Width of each step of income. */
      stepSize: number;
      /** Share of the allowance kept at step 1, 2, 3 … Past the last, nothing. */
      factors: number[];
    };

/** How a state's personal credit shrinks as income rises. See creditPhaseOut. */
export interface CreditPhaseOut {
  /**
   * The credit vanishes entirely one dollar past the threshold, rather than
   * tapering. Oregon does this: "If your federal AGI is more than $200,000
   * ($100,000 if single), enter 0." A cliff, not a slope, and modelling it as
   * a slope would hand out a credit Oregon does not give.
   */
  hardCliff?: boolean;
  /** Cents of credit lost per dollar of taxable income above the threshold. */
  perDollar: number;
  /** Where the reduction starts, by published filing status. */
  threshold: Partial<Record<PublishedStatus, number>> & { single: number };
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
  /**
   * The federal earned income credit already computed for this household.
   *
   * Passed in rather than recomputed because most states set theirs as a flat
   * share of it. It depends only on earnings, filing status and children — not
   * on any state figure — so there is no circularity in computing it first.
   */
  federalEarnedIncomeCredit?: USD;
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
  /** The state's own earned income credit, if it has one. */
  earnedIncomeCredit: USD;
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
      /*
       * Returned even where no head-of-household BRACKETS exist, because a
       * state can publish its own deduction without its own schedule. New York
       * is exactly that: $11,200 against a single filer's $8,000, on the same
       * rate schedule. The field-by-field fallback below picks up whichever
       * pieces the state actually publishes and takes the rest from single.
       */
      return 'headOfHousehold';
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
      earnedIncomeCredit: 0,
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

  /*
   * ALLOWANCES ARE LOOKED UP SEPARATELY FROM BRACKETS, because a state can
   * send a head of household to one schedule and give them a deduction that
   * belongs to neither. Oklahoma does exactly that: the rate table is headed
   * "Head of Household, Married Filing Jointly OR Widow(er)", but the standard
   * deduction is $9,350 — its own figure, between the single $6,350 and the
   * joint $12,700.
   *
   * Tying the deduction to the bracket schedule would have handed them the
   * joint $12,700 and undercharged them. So wherever the state publishes a
   * head-of-household allowance, that wins regardless of which brackets apply.
   */
  const allowanceKey: PublishedStatus =
    inputs.filingStatus === 'headOfHousehold' &&
    rules.standardDeduction.headOfHousehold !== undefined
      ? 'headOfHousehold'
      : schedule;

  /*
   * Shrink an allowance for income above the state's threshold. Returns it
   * untouched where the state has no phase-out, or where this is not one of
   * the allowances the state's phase-out reaches.
   *
   * Measured on gross income, this engine's stand-in for the adjusted gross
   * income every one of these statutes is written against.
   */
  const phaseOutAllowance = (amount: number, which: AllowanceKind): number => {
    const rule = rules.allowancePhaseOut;
    if (!rule || amount <= 0 || !rule.appliesTo.includes(which)) return amount;

    if (rule.kind === 'stepped') {
      const start = rule.start[allowanceKey] ?? rule.start[otherwise] ?? rule.start.single;
      const over = gross - start;
      if (over <= 0) return amount;
      // Step 1 begins at the first dollar over, so round the count UP.
      const step = Math.ceil(over / rule.stepSize);
      const factor = rule.factors[step - 1] ?? 0;
      return amount * factor;
    }

    /*
     * Linear. Each segment is a line; the allowance is the highest of them,
     * never below zero. One segment is the ordinary case and two is Wisconsin's
     * head of household.
     */
    const segments =
      rule.segments[allowanceKey] ?? rule.segments[otherwise] ?? rule.segments.single;

    const pick = rule.combine === 'min' ? Math.min : Math.max;
    let best: number | null = null;
    let base = 0;
    for (const seg of segments) {
      /*
       * A segment does not exist below its own threshold. That matters only
       * for 'min': Minnesota's second, steeper reduction starts at $337,800,
       * and counting it below that would apply a reduction the statute has not
       * reached yet. Wisconsin's two segments share a start, so this is a
       * no-op there.
       */
      if (gross <= seg.start) continue;
      /*
       * Round to cents before anything else. A rate like 15,000/55,000 cannot
       * be held exactly in binary, so at the very top of South Carolina's
       * taper the reduction came out as 14,999.999999999998 — which, floored
       * to the next lowest $10, left $10 of deduction standing where the
       * statute leaves none. Money is counted in cents; so is this.
       */
      let reduction = Math.round(Math.max(0, gross - seg.start) * seg.perDollar * 100) / 100;
      if (rule.roundReductionDownTo) {
        reduction =
          Math.floor(reduction / rule.roundReductionDownTo) * rule.roundReductionDownTo;
      }
      base = Math.max(base, seg.base);
      const value = seg.base - reduction;
      best = best === null ? value : pick(best, value);
    }
    const floor = rule.floorFraction ? base * rule.floorFraction : 0;
    return Math.max(floor, best ?? amount, 0);
  };

  const standardDeduction = phaseOutAllowance(
    rules.standardDeduction[allowanceKey] ?? rules.standardDeduction[otherwise],
    'standardDeduction',
  );

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
    /*
     * Property tax first, because it is the part a cap bites on. Where the
     * state caps state and local tax, the cap applies to this line — and where
     * it does not, as in California, every dollar counts.
     */
    let stateAndLocal = itemizedRules.deductPropertyTax
      ? Math.max(0, inputs.propertyTax ?? 0)
      : 0;
    if (itemizedRules.saltCap !== null) {
      stateAndLocal = Math.min(stateAndLocal, itemizedRules.saltCap);
    }
    itemizedTotal += stateAndLocal;

    const interest = Math.max(0, inputs.mortgageInterest ?? 0);
    const debt = inputs.mortgageDebt;
    const limit = itemizedRules.mortgageDebtLimit;
    itemizedTotal +=
      limit !== null && debt !== undefined && debt > limit
        ? interest * (limit / debt)
        : interest;

    /*
     * Then cut it back for high earners, where the state does that. The
     * reduction is the LESSER of a percentage of income above a threshold and
     * a fixed share of the deductions, so it grows with income but never
     * consumes the whole deduction.
     */
    const reduce = itemizedRules.highIncomeReduction;
    if (reduce && itemizedTotal > 0) {
      const over = Math.max(
        0,
        gross - (reduce.threshold[allowanceKey] ?? reduce.threshold[otherwise] ?? reduce.threshold.single),
      );
      itemizedTotal -= Math.min(
        reduce.perDollarAbove * over,
        reduce.maxFractionOfDeductions * itemizedTotal,
      );
    }
  }

  const itemized = itemizedTotal > standardDeduction;
  const deductions = itemized ? itemizedTotal : standardDeduction;
  const exemptions = phaseOutAllowance(
    (rules.personalExemption[allowanceKey] ?? rules.personalExemption[otherwise]) +
      rules.personalExemption.dependent * children,
    'personalExemption',
  );

  const taxableIncome = Math.max(0, gross - deductions - exemptions);
  const taxBeforeCredits = applyBrackets(
    taxableIncome,
    rules.brackets[schedule] ?? rules.brackets[otherwise],
  );

  const creditsBeforePhaseOut =
    (rules.personalCredit[allowanceKey] ?? rules.personalCredit[otherwise]) +
    rules.personalCredit.dependent * children;

  /*
   * Reduce the credit for income above the state's threshold, where the state
   * does that. Utah is the only one so far.
   *
   * The threshold is looked up by ALLOWANCE, not by bracket schedule, for the
   * same reason the deduction is: a state can put a head of household on one
   * schedule and give them their own figure for everything else. Utah's is
   * $27,320, between the single $18,213 and the joint $36,426, so neither
   * fallback would be right.
   *
   * Measured against TAXABLE income because that is what Utah's own form does
   * — TC-40 line 18 subtracts the threshold from line 9, the state taxable
   * income, not from gross pay.
   */
  const phaseOut = rules.creditPhaseOut;
  const creditThreshold = !phaseOut
    ? 0
    : (phaseOut.threshold[allowanceKey] ??
      phaseOut.threshold[otherwise] ??
      phaseOut.threshold.single);
  const credits = !phaseOut
    ? creditsBeforePhaseOut
    : phaseOut.hardCliff
      ? gross > creditThreshold
        ? 0
        : creditsBeforePhaseOut
      : Math.max(
        0,
        creditsBeforePhaseOut -
          phaseOut.perDollar * Math.max(0, taxableIncome - creditThreshold),
      );

  /*
   * The state's own earned income credit, as a share of the federal one.
   *
   * Kept separate from the credits above because refundability differs: these
   * personal and dependent credits stop at zero, and a REFUNDABLE state EITC
   * does not — it pays out. Lumping them together would quietly cap the one
   * credit whose whole purpose is to reach below zero.
   */
  const eitcRules = rules.earnedIncomeCredit;
  const federalEitc = Math.max(0, inputs.federalEarnedIncomeCredit ?? 0);
  const match = !eitcRules
    ? 0
    : eitcRules.byChildren !== null
      ? (eitcRules.byChildren[Math.min(3, Math.floor(children))] ?? 0)
      : (eitcRules.percentOfFederal ?? 0);
  const earnedIncomeCredit = Math.min(
    federalEitc * match,
    eitcRules?.maxCredit ?? Number.POSITIVE_INFINITY,
  );

  /*
   * Personal and dependent credits stop at zero. The state EITC stops at zero
   * too UNLESS the state made it refundable, in which case it keeps going and
   * the household is paid the difference. Four states — Missouri, Ohio, South
   * Carolina and Utah — deliberately did not, which is why the flag exists.
   */
  const afterCredits = Math.max(0, taxBeforeCredits - credits);
  const tax = eitcRules?.refundable
    ? afterCredits - earnedIncomeCredit
    : Math.max(0, afterCredits - earnedIncomeCredit);

  return {
    stateCode: rules.code,
    scheduleUsed: schedule,
    itemized,
    deductions,
    exemptions,
    taxableIncome,
    taxBeforeCredits,
    credits,
    earnedIncomeCredit,
    tax,
  };
}
