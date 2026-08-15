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
  grossSalary: USD;
  /** Dependants claimed on THIS return. */
  children: number;
  /** Workers whose wages are reported here — the Social Security cap is theirs. */
  earners: number;
  /** Share of deductible housing costs allocated here. Sums to 1 across returns. */
  deductionShare: number;
}

export function taxReturnsFor(household: Household, grossSalary: USD): TaxReturnShare[] {
  const gross = Math.max(0, grossSalary);
  const children = Math.max(0, household.children);
  const earners = Math.max(1, Math.floor(household.earners ?? 1));

  // Two returns only when a couple files separately AND both of them earn. One
  // earner filing separately genuinely is one return on the whole salary, which
  // is what the engine was already doing.
  if (household.filingStatus !== 'marriedSeparately' || earners < 2) {
    return [{ grossSalary: gross, children, earners, deductionShare: 1 }];
  }

  return [
    { grossSalary: gross / 2, children, earners: 1, deductionShare: 0.5 },
    { grossSalary: gross / 2, children: 0, earners: 1, deductionShare: 0.5 },
  ];
}
