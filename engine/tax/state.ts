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
  /**
   * A flat amount added once taxable income passes a threshold, where the
   * state charges one.
   *
   * OHIO IS THE ONLY ONE AND IT CANNOT BE WRITTEN AS A BRACKET. Ohio charges
   * nothing at all up to $26,050 and then "$332.00 plus 2.75% of the amount in
   * excess of $26,050" — a genuine step in the middle of the schedule, not a
   * rate. The statute derives the $332 as a low rate applied to that first
   * band, so it could be written as a bracket of 1.27448%, and above the
   * threshold that gives the identical answer. Below it, it would charge up to
   * $332 where Ohio charges nothing, which is the wrong direction against
   * exactly the people who can least afford it.
   *
   * We had no lump at all, which understated every Ohio bill by about $332.
   */
  lumpSumTax: { above: USD; amount: USD } | null;
  /**
   * Whether a married couple may — or must — be taxed as two single filers on
   * half the income each, rather than as one joint return.
   *
   * MISSOURI IS THE ONE THAT MAKES THIS A CORRECTNESS PROBLEM RATHER THAN AN
   * OPTIMISATION. "Missouri law requires a combined return for married couples
   * filing together." It never does a single joint computation at all, so a
   * one-pass engine overcharges every two-earner couple in the state.
   *
   * Elsewhere it is an election, and one nearly every two-earner couple makes,
   * because in these states the joint brackets are NOT doubled — Delaware,
   * Washington DC and Arkansas all run one rate ladder for every filing status,
   * so a couple climbs it twice as fast unless they split. Kentucky's benefit
   * is different again: the standard deduction is not doubled for a joint
   * return, so splitting is the only way to get two of them.
   *
   * Modelled as two single returns on half the income each, which reproduces
   * every one of them: their single allowances are exactly half the joint ones
   * except in Kentucky, where they are the whole point.
   *
   * Only for couples where BOTH earn. A sole earner gains nothing — the second
   * half has no income to shelter — and in Delaware would lose the joint
   * deduction outright.
   */
  combinedSeparateReturn: boolean;
  /**
   * Flat amounts ADDED to tax once income passes a threshold, in steps.
   *
   * CONNECTICUT HAS TWO OF THEM AND WE HAD NEITHER, which is most of why
   * Connecticut was the worst undercharge in the dataset. A "2% tax rate
   * phase-out add-back" claws back the benefit of its lowest bracket, and a
   * separate "tax recapture" claws back the rest for higher earners. Both are
   * flat steps keyed to Connecticut adjusted gross income, not to taxable
   * income, and both are added after the brackets are applied.
   */
  taxAddBacks: TaxAddBack[];
  /**
   * A credit expressed as a FRACTION OF THE TAX, by income band.
   *
   * Connecticut's personal credit works this way — up to 75% of the whole
   * bill wiped out at low incomes, tapering to nothing in 28 steps. Omitting
   * it overcharged everyone it reaches, which is the opposite direction from
   * the two add-backs above and lands on a different set of people.
   */
  taxCreditFraction: TaxCreditFraction | null;
  /**
   * A deduction for the FEDERAL income tax you paid, where the state gives
   * one — capped, and tapering to nothing as income rises.
   *
   * OREGON'S IS THE LARGEST SINGLE OVERCHARGE LEFT IN THIS DATASET at the
   * incomes it reaches: $8,500 off taxable income, worth about $743 a year to
   * a single filer on $80,000. The `federalTaxDeductible` flag has flagged
   * Oregon, Alabama and Missouri as allowing it since the dataset was built,
   * and has never been anything but a label — nothing read it.
   */
  federalTaxDeduction: FederalTaxDeduction | null;
  /**
   * A CREDIT for itemised deductions, rather than a deduction.
   *
   * WISCONSIN IS THE ONE AND IT IS NOT A DEDUCTION AT ALL: 5% of the amount by
   * which qualifying federal itemised deductions exceed the Wisconsin standard
   * deduction, taken off the tax itself and capped at what is owed.
   *
   * "Qualifying" excludes every section 164 tax — no state income tax, no
   * property tax, no sales tax. Schedule 1 has lines only for medical,
   * interest, charity and casualty losses. So of the two figures this engine
   * knows, only mortgage interest counts, and a Wisconsin homeowner's property
   * tax is worth nothing here.
   *
   * It interacts with the phase-out: as the standard deduction shrinks toward
   * zero the credit base grows, so the two move together.
   */
  itemisedDeductionCredit: { rate: number } | null;
  /**
   * Whether the personal and dependent credits pay out below zero tax.
   *
   * IDAHO'S GROCERY CREDIT IS THE REASON. It is $155 for the filer, the spouse
   * and every dependent, with no income test at all, and it is REFUNDABLE —
   * "if taxes due are less than the total credit allowed, the taxpayer shall
   * be paid a refund". Treating it as an ordinary credit would quietly cap it
   * at whatever tax was owed, which for a family is most of its value.
   */
  personalCreditRefundable: boolean;
  /**
   * A credit for property tax paid, where the state gives one on top of — or
   * instead of — any deduction.
   *
   * Illinois gives 5% of the property tax on your main home, killed outright
   * above $250,000 of income ($500,000 for a couple). A cliff, not a taper.
   */
  propertyTaxCredit: PropertyTaxCredit | null;
  /**
   * A deduction for the Social Security and Medicare tax withheld from pay,
   * capped per person.
   *
   * Massachusetts gives $2,000 EACH — two lines on the form, one per spouse —
   * so a two-earner couple gets $4,000. Per person rather than per return is
   * the whole point, and reading it as per return would halve it.
   */
  payrollTaxDeduction: { capPerPerson: USD } | null;
  /**
   * A deduction for property tax that is NOT itemising, where the state has
   * one.
   *
   * NEW JERSEY IS THE ONE, AND IT IS THE ONLY RELIEF IN THIS ENGINE THAT
   * REACHES A RENTER. New Jersey has no standard deduction, no itemising, and
   * no mortgage interest deduction at all — but it lets you take up to $15,000
   * of property tax off your taxable income, and it counts 18% of a renter's
   * rent as property tax for that purpose. New Jersey has the highest property
   * taxes in the country, so this touches nearly every household there.
   *
   * There is a $50 refundable credit as an alternative, and the return works
   * out both and takes whichever is worth more.
   *
   * It comes off AFTER exemptions and immediately before the rate schedule —
   * the last thing to leave taxable income.
   */
  propertyTaxRelief: PropertyTaxRelief | null;
  /** AL, MO, OR allow a deduction for federal income tax paid. Not yet modelled. */
  federalTaxDeductible: boolean;
  hasLocalIncomeTax: boolean;
  notes: string[];
  /**
   * Rules this state has that we do NOT model, in plain words, each saying
   * which way the error runs.
   *
   * Separate from `notes`, which carries the source table's own footnotes.
   * These are our own admissions, and the methodology page renders them
   * straight from here so the published list cannot drift from the data.
   */
  modellingGaps: string[];
  /**
   * Set where this state's figures are last year's, because the state has not
   * published this year's — real published numbers, just a year old.
   *
   * Inflation means last year's brackets are slightly narrow and last year's
   * allowances slightly small, so the error runs AGAINST the reader: we show
   * marginally more tax than they will owe. Null where everything is 2026.
   */
  priorYearFigures: string | null;
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
  /**
   * Whether the state's own income tax stays in the deduction.
   *
   * THIS FLAG WAS DECLARED AND NEVER READ, which went unnoticed because it was
   * accidentally right nearly everywhere. Most states that let you itemise
   * make you subtract their own income tax back out, so the deduction collapses
   * to property tax plus mortgage interest — exactly what this engine computed
   * by ignoring the flag entirely. Idaho, Montana, New Mexico, Maryland,
   * Virginia and Maine all behave that way.
   *
   * Iowa does not, and that is what exposed it: Iowa abolished its add-back, so
   * the federal deduction flows through with the state income tax still inside.
   */
  deductStateIncomeTax: boolean;
  /** A ceiling on the property tax line alone. North Carolina caps it at $10,000. */
  propertyTaxCap: USD | null;
  /**
   * A ceiling on the whole itemised total. Oklahoma sets $17,000 and Maine
   * $37,100, both with categories that sit outside the cap — charity and
   * medical — which this engine does not ask about and so never adds.
   */
  totalCap: USD | null;
  /**
   * Whether itemising for the state requires having itemised on the federal
   * return.
   *
   * Six states lock the two together and two explicitly do not. It is the
   * difference between a $26,000 deduction and a $3,605 one, decided by a
   * choice made on a different return.
   */
  requiresFederalItemising: boolean;
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
  /**
   * A second reduction that keeps a SHARE of the deductions rather than
   * subtracting cents per dollar of income.
   *
   * NEW YORK NEEDS BOTH AND THEY ARE DIFFERENT SHAPES. Its line 40 is the old
   * federal Pease rule and fits `highIncomeReduction` exactly. Its line 46
   * does not: it takes a fraction OF THE DEDUCTION, scaled by how far through
   * a $50,000 band your income sits, and then steps down again at $475,000,
   * $525,000 and $1,000,000. There is no cents-per-dollar figure that
   * expresses it, because the implied rate moves with the size of the
   * deduction.
   *
   * Above $1,000,000 New York throws the whole deduction away and allows only
   * a fraction of charitable giving — which this engine never asks about, so
   * the deduction becomes nothing.
   */
  shareKeptCurve: ShareKeptCurve | null;
  /**
   * Whether the state lets you deduct the Social Security and Medicare tax
   * withheld from your pay.
   *
   * ALABAMA DOES, AND IT IS THE LARGEST LINE ON ITS SCHEDULE A. At $150,000 it
   * is $11,475 — more than the mortgage interest and the property tax put
   * together — and against an Alabama standard deduction of $2,500 it means
   * almost every wage earner in the state should itemise and almost none of
   * them were.
   *
   * It is not a state or local tax, so no SALT cap touches it.
   */
  deductPayrollTax: boolean;
}

/**
 * How much of the itemised deduction survives, as a share, by income.
 *
 * Points are [income, share kept]. Between two points the share moves in a
 * straight line; below the first and above the last it holds flat. Written as
 * absolute incomes per filing status rather than offsets, because New York's
 * first band starts at a different income for each status while every later
 * step is the same for everyone — offsets would hide that.
 */
export interface ShareKeptCurve {
  points: Partial<Record<PublishedStatus, Array<[number, number]>>> & {
    single: Array<[number, number]>;
  };
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
      /**
       * A floor in dollars rather than a share, by filing status.
       *
       * Alabama's deduction shrinks to a fixed minimum and stops — $2,500 for
       * a single filer, $5,000 for a couple — rather than to a proportion of
       * itself. Those are different fractions of different starting amounts,
       * so a single share cannot express them.
       */
      floor?: Partial<Record<PublishedStatus, number>> & { single: number };
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

/**
 * A flat amount added to tax in steps, once income passes a threshold.
 *
 * Phases run in sequence: each begins where the previous one's cap is reached,
 * and `capAt` is the CUMULATIVE ceiling, not the phase's own contribution.
 * Connecticut's recapture has three, and reading `capAt` as a per-phase amount
 * would understate the top of the table by thousands.
 */
export interface TaxAddBack {
  phases: Partial<Record<PublishedStatus, TaxAddBackPhase[]>> & {
    single: TaxAddBackPhase[];
  };
}

export interface TaxAddBackPhase {
  /** Income above which this phase starts adding. */
  from: USD;
  stepSize: USD;
  perStep: USD;
  /** Cumulative ceiling across this and every earlier phase. */
  capAt: USD;
}

/**
 * A credit that wipes out a share of the tax, by income band.
 *
 * Bands are [income at or below which it applies, share of tax credited], in
 * ascending order. Past the last band nothing is credited.
 */
export interface TaxCreditFraction {
  bands: Partial<Record<PublishedStatus, Array<[number, number]>>> & {
    single: Array<[number, number]>;
  };
  /** A ceiling in dollars. Ohio's joint filing credit stops at $650. */
  max?: USD;
  /**
   * Only where BOTH spouses earn. Ohio's joint filing credit needs $500 of
   * qualifying income each, so a sole earner gets nothing from it — the same
   * shape as the states that tax a couple as two people.
   */
  requiresTwoEarners?: boolean;
}

/**
 * See StateTaxRules.federalTaxDeduction.
 *
 * `caps` are [income at or below which it applies, maximum deduction], in
 * ascending order. Past the last band nothing is deductible — Oregon's is a
 * staircase down from $8,500 to zero across a $20,000 span, not a taper.
 */
export interface FederalTaxDeduction {
  caps: Partial<Record<PublishedStatus, Array<[number, number]>>> & {
    single: Array<[number, number]>;
  };
}

/** See StateTaxRules.propertyTaxCredit. */
export interface PropertyTaxCredit {
  rate: number;
  /** Income above which the credit vanishes entirely. A cliff, not a taper. */
  cliff: Partial<Record<PublishedStatus, number>> & { single: number };
}

/** See StateTaxRules.propertyTaxRelief. */
export interface PropertyTaxRelief {
  cap: USD;
  /** Share of a year's rent that counts as property tax. New Jersey: 18%. */
  renterShareOfRent: number;
  /** Taken instead of the deduction where it is worth more. Refundable. */
  alternativeCredit: USD;
  /** Below this income the relief is unavailable, by filing status. */
  minimumGrossIncome: Partial<Record<PublishedStatus, number>> & { single: number };
}

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
  /**
   * Workers on this return. Only consulted by the states that tax a couple as
   * two single filers, where a sole earner gains nothing. Defaults to two for
   * a joint return, which is the case those states exist for.
   */
  earners?: number;
  /**
   * Social Security and Medicare actually withheld. Only used by states that
   * let you deduct it — Alabama is the one — and ignored everywhere else.
   */
  payrollTaxPaid?: USD;
  /**
   * A year's rent. Only used by New Jersey, which counts 18% of it as property
   * tax — the one relief in this engine that a renter can claim.
   */
  annualRent?: USD;
  /**
   * Federal income tax paid, for the states that let you subtract it. Oregon
   * is the one modelled.
   */
  federalTaxPaid?: USD;
  /**
   * Whether this filer itemised on their federal return. Required by the six
   * states that will not let you itemise for them unless you did.
   */
  itemisedFederally?: boolean;
  /**
   * State income tax paid, for the one state that leaves it inside the
   * deduction. Iowa.
   */
  stateIncomeTaxPaid?: USD;
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
  /** Extra credit carried in when a state's relief is taken as a credit. */
  creditOverride = 0,
): StateTaxResult {
  const schedule = scheduleFor(inputs.filingStatus, rules);

  /*
   * Some states tax a married couple as two single filers on half the income
   * each. Compute it both ways and take the lower, which is right for the
   * states where it is an election and equally right for Missouri, where it is
   * compulsory and never worse.
   *
   * Guarded against recursing forever by handing the halves 'single', which
   * cannot re-enter this branch.
   */
  if (
    rules.combinedSeparateReturn &&
    inputs.filingStatus === 'marriedJointly' &&
    (inputs.earners ?? 2) >= 2
  ) {
    const half: StateTaxInputs = {
      ...inputs,
      filingStatus: 'single',
      grossSalary: Math.max(0, inputs.grossSalary) / 2,
      propertyTax: (inputs.propertyTax ?? 0) / 2,
      mortgageInterest: (inputs.mortgageInterest ?? 0) / 2,
      mortgageDebt: inputs.mortgageDebt === undefined ? undefined : inputs.mortgageDebt / 2,
      payrollTaxPaid: (inputs.payrollTaxPaid ?? 0) / 2,
      // Children ride on one return, exactly as they do federally: you cannot
      // claim half a child, and doubling them would invent an exemption.
      children: 0,
      /*
       * And so does the federal earned income credit, for the same reason. It
       * is claimed once on one federal return, and a state match is a share of
       * that one figure. Copying it into both halves — which spreading the
       * inputs does by default — let Missouri apply its 20% match twice and
       * wipe out a family's whole bill.
       */
      federalEarnedIncomeCredit: 0,
    };
    const first = computeStateTax(
      {
        ...half,
        children: inputs.children,
        federalEarnedIncomeCredit: inputs.federalEarnedIncomeCredit,
      },
      rules,
    );
    const second = computeStateTax(half, rules);
    const combined = first.tax + second.tax;

    const joint = computeStateTax({ ...inputs, earners: 1 }, rules);
    if (combined < joint.tax) {
      return {
        ...joint,
        deductions: first.deductions + second.deductions,
        exemptions: first.exemptions + second.exemptions,
        taxableIncome: first.taxableIncome + second.taxableIncome,
        tax: combined,
      };
    }
    return joint;
  }

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
    const floor = rule.floor
      ? (rule.floor[allowanceKey] ?? rule.floor[otherwise] ?? rule.floor.single)
      : rule.floorFraction
        ? base * rule.floorFraction
        : 0;
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
  /*
   * Where the state requires you to have itemised federally, the state
   * deduction is simply unavailable to a federal standard-deduction filer.
   * Unknown counts as "did not", which withholds the deduction and charges
   * more — the safe direction for a missing input.
   */
  const itemizedRules =
    rules.itemizedDeductions?.requiresFederalItemising && inputs.itemisedFederally !== true
      ? null
      : rules.itemizedDeductions;
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
    // North Carolina caps the property line on its own, before anything else.
    if (itemizedRules.propertyTaxCap !== null) {
      stateAndLocal = Math.min(stateAndLocal, itemizedRules.propertyTaxCap);
    }
    if (itemizedRules.saltCap !== null) {
      stateAndLocal = Math.min(stateAndLocal, itemizedRules.saltCap);
    }
    /*
     * Iowa alone leaves its own income tax inside the deduction, because it
     * abolished the add-back every other state applies. Everywhere else the
     * tax is subtracted back out and the deduction collapses to property tax
     * plus interest, which is why ignoring this flag was invisible for so long.
     */
    if (itemizedRules.deductStateIncomeTax) {
      stateAndLocal += Math.max(0, inputs.stateIncomeTaxPaid ?? 0);
    }
    itemizedTotal += stateAndLocal;

    /*
     * Social Security and Medicare, where the state allows it. Computed from
     * wages rather than taken as an input, because it is a fixed function of
     * pay and asking for it would be asking the reader something they would
     * have to look up.
     */
    if (itemizedRules.deductPayrollTax) {
      itemizedTotal += Math.max(0, inputs.payrollTaxPaid ?? 0);
    }

    const interest = Math.max(0, inputs.mortgageInterest ?? 0);
    const debt = inputs.mortgageDebt;
    /*
     * HALVED ON A SEPARATE RETURN. California's $1,000,000 is $500,000 for
     * married filing separately, and every other state's limit follows the
     * federal rule of halving too.
     *
     * The household's debt is already split across the two returns, so leaving
     * the limit whole gave the couple an effective $2,000,000 ceiling between
     * them — worth about $3,941 of California tax on a San Jose house at
     * $600,000 of combined salary.
     */
    const wholeLimit = itemizedRules.mortgageDebtLimit;
    const limit =
      wholeLimit !== null && inputs.filingStatus === 'marriedSeparately'
        ? wholeLimit / 2
        : wholeLimit;
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
    // Oklahoma's $17,000 and Maine's $37,100 bite before the high-income cut.
    if (itemizedRules.totalCap !== null) {
      itemizedTotal = Math.min(itemizedTotal, itemizedRules.totalCap);
    }

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

    /*
     * Then New York's second cut, which keeps a share rather than subtracting
     * an amount. Applied after the Pease-style one, in the order the form
     * does it.
     */
    const curve = itemizedRules.shareKeptCurve;
    if (curve && itemizedTotal > 0) {
      const points =
        curve.points[allowanceKey] ?? curve.points[otherwise] ?? curve.points.single;
      let share = points[0][1];
      for (let i = 0; i < points.length; i++) {
        const [income, kept] = points[i];
        if (gross <= income) {
          if (i === 0) {
            share = kept;
          } else {
            const [prevIncome, prevKept] = points[i - 1];
            const span = income - prevIncome;
            const t = span > 0 ? (gross - prevIncome) / span : 1;
            share = prevKept + (kept - prevKept) * t;
          }
          break;
        }
        share = kept;
      }
      itemizedTotal *= Math.max(0, Math.min(1, share));
    }
  }

  const itemized = itemizedTotal > standardDeduction;
  const deductions = itemized ? itemizedTotal : standardDeduction;
  const exemptions = phaseOutAllowance(
    (rules.personalExemption[allowanceKey] ?? rules.personalExemption[otherwise]) +
      rules.personalExemption.dependent * children,
    'personalExemption',
  );

  /*
   * New Jersey's property tax relief, which is not itemising and is the only
   * relief here a renter can claim. Comes off after exemptions, immediately
   * before the rate schedule.
   */
  const relief = rules.propertyTaxRelief;
  let propertyTaxDeduction = 0;
  if (relief) {
    const floor =
      relief.minimumGrossIncome[allowanceKey] ??
      relief.minimumGrossIncome[otherwise] ??
      relief.minimumGrossIncome.single;
    if (gross > floor) {
      const asOwner = Math.max(0, inputs.propertyTax ?? 0);
      const asRenter = Math.max(0, inputs.annualRent ?? 0) * relief.renterShareOfRent;
      propertyTaxDeduction = Math.min(Math.max(asOwner, asRenter), relief.cap);
    }
  }

  /*
   * The federal income tax you paid, where the state lets you subtract it.
   * Capped by income band, and never more than the tax actually paid.
   */
  let federalTaxDeducted = 0;
  const fedDeduction = rules.federalTaxDeduction;
  if (fedDeduction) {
    const caps =
      fedDeduction.caps[allowanceKey] ?? fedDeduction.caps[otherwise] ?? fedDeduction.caps.single;
    const band = caps.find(([upper]) => gross <= upper);
    if (band) federalTaxDeducted = Math.min(band[1], Math.max(0, inputs.federalTaxPaid ?? 0));
  }

  /*
   * Social Security and Medicare withheld, where the state lets you deduct it
   * outright rather than through an itemised schedule. Massachusetts gives
   * $2,000 EACH — two lines on the form, one per spouse — so a two-earner
   * couple gets $4,000 and reading it as per return would halve it.
   */
  let payrollDeducted = 0;
  if (rules.payrollTaxDeduction) {
    const people = inputs.filingStatus === 'marriedJointly' ? (inputs.earners ?? 2) : 1;
    payrollDeducted = Math.min(
      Math.max(0, inputs.payrollTaxPaid ?? 0),
      rules.payrollTaxDeduction.capPerPerson * Math.max(1, people),
    );
  }

  const taxableIncome = Math.max(
    0,
    gross - deductions - exemptions - propertyTaxDeduction - federalTaxDeducted - payrollDeducted,
  );
  const lump =
    rules.lumpSumTax && taxableIncome > rules.lumpSumTax.above ? rules.lumpSumTax.amount : 0;

  /*
   * Amounts added on top of the bracket tax. Keyed to GROSS income rather than
   * taxable income, which is what Connecticut's tables do — they run off
   * Connecticut adjusted gross income, before the exemption comes off.
   */
  let addBacks = 0;
  /*
   * Defaulted rather than required, because a share link pinned to an older
   * release replays that release's JSON — which has no such field. A new
   * field must never make an old answer throw.
   */
  for (const addBack of rules.taxAddBacks ?? []) {
    const phases =
      addBack.phases[allowanceKey] ?? addBack.phases[otherwise] ?? addBack.phases.single;
    /*
     * WITHIN one add-back the phases are cumulative, so each phase REPLACES
     * the running figure. ACROSS add-backs they stack, so the result is added.
     *
     * This used to assign straight into the total, which meant Connecticut's
     * recapture silently replaced its 2% phase-out add-back instead of joining
     * it — Connecticut's own schedule prints them as two separate lines that
     * both feed the tax. Worth up to $250 on a single return and $500 on a
     * joint one.
     */
    let amount = 0;
    let previousCap = 0;
    for (const phase of phases) {
      if (gross <= phase.from) break;
      const steps = Math.ceil((gross - phase.from) / phase.stepSize);
      amount = Math.min(phase.capAt, previousCap + steps * phase.perStep);
      previousCap = phase.capAt;
    }
    addBacks += amount;
  }
  const taxBeforeCredits =
    lump +
    addBacks +
    applyBrackets(taxableIncome, rules.brackets[schedule] ?? rules.brackets[otherwise]);

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
  /*
   * The $50 credit is an alternative to the deduction, not an addition. New
   * Jersey's own worksheet computes the tax both ways and takes whichever is
   * better, so the deduction wins only where it saves more than $50.
   */
  let creditsWithRelief = credits;
  if (relief && propertyTaxDeduction > 0) {
    const withoutRelief = applyBrackets(
      Math.max(0, taxableIncome + propertyTaxDeduction),
      rules.brackets[schedule] ?? rules.brackets[otherwise],
    );
    if (withoutRelief - taxBeforeCredits < relief.alternativeCredit) {
      // Take the credit instead: undo the deduction and add the flat amount.
      return computeStateTax(
        { ...inputs, propertyTax: 0, annualRent: 0 },
        { ...rules, propertyTaxRelief: null },
        creditOverride + relief.alternativeCredit,
      );
    }
  }

  /*
   * A credit that is a share of the tax rather than a fixed amount. Applied to
   * everything above — brackets, lump and add-backs — because that is the
   * order Connecticut's own calculation schedule uses.
   */
  const fraction = rules.taxCreditFraction;
  if (fraction) {
    const bands =
      fraction.bands[allowanceKey] ?? fraction.bands[otherwise] ?? fraction.bands.single;
    const band = bands.find(([upper]) => gross <= upper);
    const eligible =
      !fraction.requiresTwoEarners ||
      (inputs.filingStatus === 'marriedJointly' && (inputs.earners ?? 2) >= 2);
    if (band && eligible) {
      const amount = taxBeforeCredits * band[1];
      creditsWithRelief += fraction.max ? Math.min(amount, fraction.max) : amount;
    }
  }

  /*
   * A credit for property tax paid. Illinois gives 5% of it and takes the
   * whole thing away above the income cliff — not a taper, an edge.
   */
  const ptCredit = rules.propertyTaxCredit;
  if (ptCredit) {
    const cliff =
      ptCredit.cliff[allowanceKey] ?? ptCredit.cliff[otherwise] ?? ptCredit.cliff.single;
    if (gross <= cliff) {
      creditsWithRelief += ptCredit.rate * Math.max(0, inputs.propertyTax ?? 0);
    }
  }

  /*
   * Wisconsin's itemised deduction credit. Measured against the standard
   * deduction AFTER its phase-out, because that is the figure the form uses —
   * and it means the credit grows as the deduction shrinks.
   */
  const itemisedCredit = rules.itemisedDeductionCredit;
  if (itemisedCredit) {
    const qualifying = Math.max(0, inputs.mortgageInterest ?? 0);
    creditsWithRelief += itemisedCredit.rate * Math.max(0, qualifying - standardDeduction);
  }

  creditsWithRelief += creditOverride;
  /*
   * Personal and dependent credits normally stop at zero. Idaho's grocery
   * credit does not — "if taxes due are less than the total credit allowed,
   * the taxpayer shall be paid a refund" — and capping it at the tax owed
   * would take most of its value from exactly the households it is for.
   */
  const afterCredits = rules.personalCreditRefundable
    ? taxBeforeCredits - creditsWithRelief
    : Math.max(0, taxBeforeCredits - creditsWithRelief);
  /*
   * The final floor has to respect BOTH kinds of refundability, and it did
   * not. Idaho has no earned income credit, so this line clamped its grocery
   * credit straight back to zero — undoing the refund two lines after granting
   * it. A floor applied at the end silently overrides every decision before it.
   */
  const anythingRefundable = eitcRules?.refundable === true || rules.personalCreditRefundable;
  const tax = anythingRefundable
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
