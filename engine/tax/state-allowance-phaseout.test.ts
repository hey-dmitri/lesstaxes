/**
 * Allowances that shrink as income rises.
 *
 * This was on the "not modelled" list for months, and the direction is why it
 * mattered: ignoring a phase-out hands the reader an allowance the state takes
 * away, so the site shows more money left over than they will actually have.
 * That is the error that flatters a destination, and a flattering verdict is
 * the one that actually moves somebody across the country.
 */

import { describe, expect, it } from 'vitest';

import { computeStateTax } from './state';
import { stateRules } from './rules';

const SINGLE = { filingStatus: 'single', children: 0 } as const;

describe('South Carolina Act 110 of 2026', () => {
  const sc = stateRules('SC');

  /*
   * South Carolina rewrote its income tax outright — signed 30 March 2026,
   * first applying to tax years beginning after 2025, which is the year this
   * dataset is for. We were still modelling the old three-bracket schedule and
   * the federal standard deduction that no longer exists there.
   */
  it('taxes every filing status on one status-blind schedule', () => {
    expect(sc.brackets.single).toEqual([
      { from: 0, rate: 0.0199 },
      { from: 30_000, rate: 0.0521 },
    ]);
    // No doubling for a couple. South Carolina has never doubled its brackets
    // and Act 110 did not start.
    expect(sc.brackets.marriedJointly).toEqual(sc.brackets.single);
  });

  /*
   * The statute writes the upper band as "5.21% times the amount minus $966".
   * That $966 is not arbitrary: (5.21% - 1.99%) x $30,000 = $966 exactly, so
   * the schedule is continuous at the break rather than jumping. If a future
   * refresh moves the threshold without moving the constant, this catches it.
   */
  it('is continuous where the two rates meet', () => {
    const justBelow = computeStateTax(
      { ...SINGLE, grossSalary: 30_000 + 15_000 - 1 },
      { ...sc, standardDeduction: { ...sc.standardDeduction, single: 15_000 }, allowancePhaseOut: null },
    ).tax;
    const at = computeStateTax(
      { ...SINGLE, grossSalary: 30_000 + 15_000 },
      { ...sc, standardDeduction: { ...sc.standardDeduction, single: 15_000 }, allowancePhaseOut: null },
    ).tax;
    expect(at - justBelow).toBeLessThan(0.06);
    expect(0.0199 * 30_000).toBeCloseTo(0.0521 * 30_000 - 966, 6);
  });

  /*
   * The income adjusted deduction tapers straight to zero. All three statuses
   * taper at exactly 3/11 of a dollar per dollar — 15,000/55,000 =
   * 22,500/82,500 = 30,000/110,000 — which is itself the check that all six
   * numbers were transcribed correctly.
   */
  it('tapers the income adjusted deduction to exactly nothing', () => {
    const deductionAt = (salary: number) =>
      computeStateTax({ ...SINGLE, grossSalary: salary }, sc).deductions;

    expect(deductionAt(40_000)).toBe(15_000); // untouched at the threshold
    expect(deductionAt(95_000)).toBe(0); // gone, precisely
    expect(deductionAt(150_000)).toBe(0); // and stays gone

    // Reductions round DOWN to $10, which leaves a slightly larger deduction:
    // at $60,000 the raw reduction is $5,454.55, rounded to $5,450.
    expect(deductionAt(60_000)).toBe(9_550);
    expect(deductionAt(80_000)).toBe(4_100);
  });

  it('starts the taper later and runs it longer for a head of household', () => {
    const hohAt = (salary: number) =>
      computeStateTax({ grossSalary: salary, filingStatus: 'headOfHousehold', children: 1 }, sc)
        .deductions;

    expect(hohAt(60_000)).toBe(22_500); // full at its own threshold
    expect(hohAt(142_500)).toBe(0); // zero $47,500 later than a single filer
    // A single filer is already down to nothing here.
    expect(computeStateTax({ ...SINGLE, grossSalary: 120_000 }, sc).deductions).toBe(0);
    expect(hohAt(120_000)).toBeGreaterThan(0);
  });

  /*
   * Under the old law "head of household files as single" was defensible,
   * because the brackets ignore filing status and the state used the federal
   * standard deduction. Act 110 made it false.
   */
  it('no longer treats a head of household as a single filer', () => {
    expect(sc.headOfHouseholdBasis).toBe('own');
    expect(sc.standardDeduction.headOfHousehold).toBe(22_500);
    expect(
      computeStateTax({ grossSalary: 80_000, filingStatus: 'headOfHousehold', children: 1 }, sc).tax,
    ).toBeLessThan(computeStateTax({ ...SINGLE, grossSalary: 80_000 }, sc).tax);
  });

  /*
   * Act 110 left the 125% match alone and capped the result at $200. That
   * changes what the credit is: 125% of even a modest federal credit clears
   * $200 at once, so for almost anyone with children this is a flat $200.
   */
  it('caps the earned income credit at $200', () => {
    expect(sc.earnedIncomeCredit?.percentOfFederal).toBe(1.25);
    expect(sc.earnedIncomeCredit?.refundable).toBe(false);
    expect(sc.earnedIncomeCredit?.maxCredit).toBe(200);

    const withBigFederalCredit = computeStateTax(
      { grossSalary: 25_000, filingStatus: 'headOfHousehold', children: 2, federalEarnedIncomeCredit: 6_000 },
      sc,
    );
    // 125% of $6,000 is $7,500. The cap holds it to $200.
    expect(withBigFederalCredit.earnedIncomeCredit).toBe(200);
  });

  /*
   * Two shipped footnotes became false the day Act 110 was signed. A stale
   * note on a page whose whole job is explaining the numbers is worse than no
   * note at all.
   */
  it('drops the footnotes the new law made untrue', () => {
    const joined = sc.notes.join(' ');
    expect(joined).not.toContain('revert to 6.2%');
    expect(joined).not.toContain('include the federal standard deduction in their income starting point');
  });

  it('leaves links pinned to an older release on the old law', () => {
    expect(stateRules('SC', '2026.25').brackets.single).not.toEqual(sc.brackets.single);
  });
});
