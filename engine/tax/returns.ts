/**
 * How many income tax returns this household files, and what goes on each.
 *
 * THE MODEL USED TO ASSUME ONE RETURN PER HOUSEHOLD. That is true for three of
 * the four filing statuses and flatly false for the fourth. "Married filing
 * separately" means, literally, that two people file two returns. The engine
 * took the household's combined salary, ran it once through the separate
 * schedule, and billed the result — which is not a tax anybody in America pays.
 *
 * The separate brackets and standard deduction are each half the joint ones, so
 * putting a couple's whole income on one of them runs it up the schedule at
 * twice the speed:
 *
 *   $150,000 between two earners:  modelled $24,734, actually owed $15,340
 *   $300,000 between two earners:  modelled $68,134, actually owed $49,468
 *
 * Both overstatements, both far past the point where a verdict is safe.
 *
 * THE EVEN SPLIT. This engine collects one household salary (PROJECT.md D3),
 * so when it needs per-spouse income it has to assume how the total divides,
 * and it assumes evenly. That is the same assumption the Social Security wage
 * base already makes and for the same reason: it is exactly right for the case
 * people mean when they tick "we both earn", and an uneven split is not
 * recoverable from the one number the form asks for.
 *
 * Unlike the wage base, the direction of the error here is not one-way. A
 * couple splitting $300,000 as $250,000/$50,000 owes more than two $150,000
 * returns, so the even split understates them; a couple splitting it evenly is
 * modelled exactly. Filing separately is itself rare and usually costs money —
 * people choose it for student-loan repayment plans or to keep liabilities
 * apart, not to save tax — so this is a small population modelled at its
 * midpoint rather than a systematic lean.
 *
 * CHILDREN GO ON ONE RETURN. A child is claimed by one parent or the other,
 * never halved, so the dependants all land on the first return. Where no
 * phase-out is biting this is the same total credit either way; where one is,
 * concentrating the children pushes them against a single return's phase-out
 * sooner, which produces more tax rather than less.
 *
 * DEDUCTIONS SPLIT EVENLY. Property tax and mortgage interest are halved
 * across the two returns, the natural reading for a jointly owned home. Each
 * return then gets its own SALT cap, which is why the published separate cap is
 * half the joint one.
 */

import type { Household, USD } from '../types';

/** One return, and the slice of the household that goes on it. */
export interface TaxReturnShare {
  /** Income reported on THIS return. Half the household's in a split. */
  grossSalary: USD;
  /**
   * Wages actually EARNED by the filer on this return, which is not always the
   * income they report.
   *
   * In a community property state a couple filing separately each report half
   * the combined wages whoever earned them — but Social Security, Medicare and
   * the state disability contributions follow the person who did the work.
   * IRS Publication 555 says so of self-employment tax and the same logic holds
   * for the rest: they are levied on the earner, not on whoever reports it.
   *
   * So a sole earner in Texas filing separately reports $75,000 on each of two
   * returns while paying payroll tax on the whole $150,000, once, as one worker.
   */
  wagesEarned: USD;
  /** Dependants claimed on THIS return. */
  children: number;
  /** Workers whose wages are reported here — the Social Security cap is theirs. */
  earners: number;
  /** Share of deductible housing costs allocated here. Sums to 1 across returns. */
  deductionShare: number;
}

export interface TaxReturnOptions {
  /**
   * True in the nine states where a separate filer reports half the couple's
   * combined wages regardless of who earned them. See COMMUNITY_PROPERTY.
   */
  communityProperty?: boolean;
}

export function taxReturnsFor(
  household: Household,
  grossSalary: USD,
  options: TaxReturnOptions = {},
): TaxReturnShare[] {
  const gross = Math.max(0, grossSalary);
  const children = Math.max(0, household.children);
  const earners = Math.max(1, Math.floor(household.earners ?? 1));

  const separately = household.filingStatus === 'marriedSeparately';

  /*
   * Two returns when a couple files separately and EITHER both of them earn OR
   * they live in a community property state.
   *
   * The community-property half was missing. One earner filing separately is
   * genuinely one return on the whole salary in the other 41 states, and this
   * treated that as the universal rule — overstating federal tax in Texas at
   * $150,000 by $9,394.
   */
  const splits = separately && (earners >= 2 || options.communityProperty === true);

  if (!splits) {
    return [
      { grossSalary: gross, wagesEarned: gross, children, earners, deductionShare: 1 },
    ];
  }

  /*
   * Income halves; the WAGES do not move. With two earners each person earned
   * half anyway. With one earner in a community property state, that one person
   * still earned all of it and still pays payroll tax on all of it, as a single
   * worker against a single Social Security cap — which is why this cannot be
   * done by pretending there are two earners.
   */
  const wagesOnFirst = earners >= 2 ? gross / 2 : gross;
  const wagesOnSecond = earners >= 2 ? gross / 2 : 0;

  return [
    {
      grossSalary: gross / 2,
      wagesEarned: wagesOnFirst,
      children,
      earners: 1,
      deductionShare: 0.5,
    },
    {
      grossSalary: gross / 2,
      wagesEarned: wagesOnSecond,
      children: 0,
      earners: 1,
      deductionShare: 0.5,
    },
  ];
}
