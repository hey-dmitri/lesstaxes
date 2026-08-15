/**
 * WHAT READING EVERY STATE'S FORM ACTUALLY BOUGHT A SINGLE PARENT.
 *
 * The methodology page makes a specific claim: that every state giving a head
 * of household its own treatment was previously charging them too much, and by
 * how much. That sentence drifted twice — it said 17, then 24, and then Iowa,
 * Wisconsin, Nebraska and Vermont were added without it moving again.
 *
 * A claim that UNDERSELLS a fix is still a wrong claim, and it is the harder
 * kind to catch: nobody re-checks a number that flatters them less than the
 * truth would.
 *
 * So the count on the page is now rendered from the data, and the two facts
 * the sentence rests on are checked here against the engine rather than
 * against anyone's memory:
 *
 *   1. Treating a head of household as a single filer never charged them LESS.
 *      This is the direction claim, and it is the one that matters — an error
 *      that undercharges flatters a destination, and a flattering verdict is
 *      what actually moves somebody across the country.
 *
 *   2. The dollar range quoted on the page is real at the extremes.
 */

import { describe, expect, it } from 'vitest';

import { ALL_STATE_CODES, stateRules } from './tax/rules';
import { computeStateTax } from './tax/state';
import type { StateTaxRules } from './tax/state';

/** The old behaviour: no head-of-household anything, so they fall to single. */
const asSingleFiler = (rules: StateTaxRules): StateTaxRules => ({
  ...rules,
  headOfHouseholdBasis: 'single',
  brackets: { ...rules.brackets, headOfHousehold: undefined },
  standardDeduction: { ...rules.standardDeduction, headOfHousehold: undefined },
  personalExemption: rules.personalExemption
    ? { ...rules.personalExemption, headOfHousehold: undefined }
    : rules.personalExemption,
});

const TAXING = ALL_STATE_CODES.map((code) => stateRules(code)).filter((s) => s.hasWageIncomeTax);

const SALARIES = [20_000, 40_000, 60_000, 80_000, 100_000, 150_000, 200_000, 300_000, 400_000];
const CHILDREN = [1, 2, 3];

/** Most a state ever overcharged a single parent, across the whole sweep. */
const worstOvercharge = new Map<string, number>();

for (const rules of TAXING) {
  const old = asSingleFiler(rules);
  for (const grossSalary of SALARIES) {
    for (const children of CHILDREN) {
      const inputs = { grossSalary, filingStatus: 'headOfHousehold' as const, children };
      const overcharge = computeStateTax(inputs, old).tax - computeStateTax(inputs, rules).tax;
      if (Math.abs(overcharge) > 0.5) {
        worstOvercharge.set(rules.code, Math.max(worstOvercharge.get(rules.code) ?? 0, overcharge));
      }
    }
  }
}

describe('taxing a head of household as a single filer', () => {
  it('never charged one of them less than the state actually asks', () => {
    for (const rules of TAXING) {
      const old = asSingleFiler(rules);
      for (const grossSalary of SALARIES) {
        for (const children of CHILDREN) {
          const inputs = { grossSalary, filingStatus: 'headOfHousehold' as const, children };
          const overcharge = computeStateTax(inputs, old).tax - computeStateTax(inputs, rules).tax;
          expect(
            overcharge,
            `${rules.code} at $${grossSalary} with ${children}: the single schedule was CHEAPER ` +
              `by $${(-overcharge).toFixed(2)}, so the old behaviour flattered this state`,
          ).toBeGreaterThan(-0.5);
        }
      }
    }
  });

  it('matches the count the methodology page renders', () => {
    // The page counts states with a head-of-household basis of their own. Every
    // one of those must actually change somebody's bill, or the count is
    // describing paperwork rather than money.
    const withOwnTreatment = TAXING.filter((s) => s.headOfHouseholdBasis !== 'single');
    for (const s of withOwnTreatment) {
      expect(worstOvercharge.has(s.code), `${s.code} has its own basis but changes no bill`).toBe(
        true,
      );
    }
  });

  /*
   * The page quotes "$75 a year in Alabama to $4,046 in Hawaii". Both ends are
   * pinned, loosely enough that an inflation-indexed bracket does not fail the
   * suite every January, tightly enough that a real change does.
   */
  it('keeps the quoted range honest at both ends', () => {
    const amounts = [...worstOvercharge.values()];
    expect(Math.min(...amounts)).toBeGreaterThanOrEqual(50);
    expect(Math.min(...amounts)).toBeLessThan(150);
    expect(Math.max(...amounts)).toBeGreaterThan(3_500);
    expect(Math.max(...amounts)).toBeLessThan(5_000);
  });
});
