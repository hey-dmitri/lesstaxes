/**
 * States that tax a married couple as two single filers on half the income.
 *
 * This engine ran one joint calculation everywhere, which is wrong in six
 * states and — in Missouri — not even an approximation of what the state does.
 * "Missouri law requires a combined return for married couples filing
 * together." It never performs a joint computation at all.
 *
 * The reasons differ by state and none of them are guessable from the rates:
 *
 *   DC, DE, AR   one rate ladder for every filing status, so a couple climbs
 *                it twice as fast unless they split
 *   KY           the standard deduction is not doubled on a joint return
 *   MS           each spouse gets their own $10,000 band at 0%
 *   MO           compulsory
 */

import { describe, expect, it } from 'vitest';

import { computeStateTax } from './state';
import { ALL_STATE_CODES, stateRules } from './rules';

const COUPLE = { filingStatus: 'marriedJointly' as const, children: 0, earners: 2 };

describe('combined separate returns', () => {
  /*
   * Figures independently computed from each state's own form and reproduced
   * here. Delaware, Kentucky and Mississippi come out to the dollar, which is
   * the check that the mechanism is right and not merely directionally right.
   */
  it.each([
    ['DC', 1_500, 1_650],
    ['DE', 1_010, 1_025],
    ['MS', 395, 405],
    ['MO', 170, 195],
    ['KY', 115, 122],
  ])('saves a %s couple the amount the state\'s own form gives', (code, low, high) => {
    const before = computeStateTax({ ...COUPLE, grossSalary: 150_000 }, stateRules(code, '2026.25')).tax;
    const after = computeStateTax({ ...COUPLE, grossSalary: 150_000 }, stateRules(code)).tax;
    expect(before - after).toBeGreaterThan(low);
    expect(before - after).toBeLessThan(high);
  });

  /*
   * A SOLE EARNER GAINS NOTHING, and must not: the second half has no income
   * to shelter. In Delaware it would actively lose them the joint standard
   * deduction, so getting this wrong would undercharge one couple and
   * overcharge another.
   */
  it('does nothing for a couple with one earner', () => {
    /*
     * Compared within one dataset version rather than against the previous
     * one. Arkansas cut its rate in the same release, so a cross-version
     * comparison would show it moving for an unrelated reason — which is
     * exactly the kind of coincidence that makes a green test meaningless.
     */
    for (const code of ['DC', 'DE', 'AR', 'MS', 'MO', 'KY']) {
      const rules = stateRules(code);
      const solo = { ...COUPLE, earners: 1, grossSalary: 150_000 };
      const twoEarner = { ...COUPLE, earners: 2, grossSalary: 150_000 };
      expect(computeStateTax(solo, rules).tax, code).toBeGreaterThan(
        computeStateTax(twoEarner, rules).tax,
      );
    }
  });

  /*
   * Never worse than the joint computation. For the five elective states that
   * is what makes taking the lower of the two correct; for Missouri it is why
   * taking the lower is safe even though the state gives no choice.
   */
  it('is never worse than filing jointly, at any income', () => {
    for (const code of ALL_STATE_CODES) {
      const rules = stateRules(code);
      if (!rules.combinedSeparateReturn) continue;
      for (const salary of [40_000, 90_000, 150_000, 400_000]) {
        const split = computeStateTax({ ...COUPLE, grossSalary: salary }, rules).tax;
        const joint = computeStateTax({ ...COUPLE, grossSalary: salary, earners: 1 }, rules).tax;
        expect(split, `${code} at $${salary}`).toBeLessThanOrEqual(joint + 0.01);
      }
    }
  });

  /*
   * The states checked and deliberately excluded. Each requires the state
   * status to match the federal one and doubles every bracket and allowance,
   * so splitting gains nothing — and recording that is the point, because
   * "checked and gains nothing" looks identical to "never looked".
   */
  it('leaves alone the states that double everything already', () => {
    for (const code of ['IA', 'MT', 'GA', 'OH', 'AL', 'VA']) {
      expect(stateRules(code).combinedSeparateReturn, code).toBe(false);
    }
  });
});
