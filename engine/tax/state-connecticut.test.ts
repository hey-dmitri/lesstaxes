/**
 * Connecticut, which was wrong in both directions at once.
 *
 * Three mechanisms were missing, and they do not all point the same way. Two
 * add tax at higher incomes — a "2% tax rate phase-out add-back" and a
 * separate recapture, both clawing back the benefit of the lower brackets. The
 * third is a personal credit worth up to 75% of the whole bill at low incomes.
 *
 * So the same state was undercharging one set of households and overcharging
 * another, which is why neither showed up as an obviously wrong number.
 */

import { describe, expect, it } from 'vitest';

import { computeStateTax } from './state';
import { stateRules } from './rules';

const ct = stateRules('CT');
const at = (salary: number, filingStatus: 'single' | 'marriedJointly' = 'single') =>
  computeStateTax({ grossSalary: salary, filingStatus, children: 0 }, ct).tax;

describe('Connecticut add-backs and credit', () => {
  it('carries both add-backs and the credit', () => {
    expect(ct.taxAddBacks).toHaveLength(2);
    expect(ct.taxCreditFraction).not.toBeNull();
  });

  /*
   * The 2% add-back's ceiling is exactly the benefit it claws back: $10,000 of
   * income at 2% instead of 4.5% is $250 for a single filer, and $20,000 at
   * the same spread is $500 for a couple. That the caps reconstruct from the
   * brackets is the check that they were transcribed correctly.
   */
  it('caps the 2% add-back at exactly the benefit it removes', () => {
    const [phaseOut] = ct.taxAddBacks;
    expect(phaseOut.phases.single[0].capAt).toBeCloseTo(10_000 * (0.045 - 0.02), 6);
    expect(phaseOut.phases.marriedJointly?.[0].capAt).toBeCloseTo(20_000 * (0.045 - 0.02), 6);
    expect(phaseOut.phases.headOfHousehold?.[0].capAt).toBeCloseTo(16_000 * (0.045 - 0.02), 6);
  });

  /*
   * The recapture's phase caps are CUMULATIVE. Reading them as separate
   * contributions would understate the top of the table by thousands.
   */
  it('treats the recapture caps as cumulative, not per phase', () => {
    const [, recapture] = ct.taxAddBacks;
    const single = recapture.phases.single;
    expect(single.map((p) => p.capAt)).toEqual([250, 2_950, 3_400]);
    // Each phase's ceiling exceeds the one before it, which only makes sense
    // if they accumulate.
    expect(single[1].capAt).toBeGreaterThan(single[0].capAt);
    expect(single[2].capAt).toBeGreaterThan(single[1].capAt);
  });

  it('adds tax above the thresholds and never below them', () => {
    // Nothing is added below the first threshold of $56,500.
    const below = computeStateTax({ grossSalary: 50_000, filingStatus: 'single', children: 0 }, ct);
    expect(below.tax).toBeCloseTo(
      computeStateTax(
        { grossSalary: 50_000, filingStatus: 'single', children: 0 },
        { ...ct, taxAddBacks: [] },
      ).tax,
      6,
    );

    // And it climbs from there.
    expect(at(150_000)).toBeGreaterThan(at(80_000));
    expect(at(300_000)).toBeGreaterThan(at(150_000));
  });

  /*
   * The credit runs the other way and lands on different people: at $30,000 a
   * single filer keeps most of their bill, and omitting it overcharged them.
   */
  it('wipes out most of the bill at low incomes', () => {
    const withoutCredit = computeStateTax(
      { grossSalary: 30_000, filingStatus: 'single', children: 0 },
      { ...ct, taxCreditFraction: null },
    ).tax;
    expect(at(30_000)).toBeLessThan(withoutCredit);
    // 75% off at the bottom of the table.
    expect(at(30_000)).toBeCloseTo(withoutCredit * 0.85, 0);
  });

  it('gives no credit at all above the top band', () => {
    const bands = ct.taxCreditFraction!.bands.single;
    const top = bands[bands.length - 1][0];
    const justAbove = computeStateTax(
      { grossSalary: top + 1_000, filingStatus: 'single', children: 0 },
      ct,
    ).tax;
    expect(justAbove).toBeCloseTo(
      computeStateTax(
        { grossSalary: top + 1_000, filingStatus: 'single', children: 0 },
        { ...ct, taxCreditFraction: null },
      ).tax,
      6,
    );
  });

  /*
   * A share link pinned to an older release replays that release's data, which
   * has none of these fields. A new field must never make an old answer throw.
   */
  it('leaves an older release computable', () => {
    expect(() =>
      computeStateTax(
        { grossSalary: 150_000, filingStatus: 'single', children: 0 },
        stateRules('CT', '2026.1'),
      ),
    ).not.toThrow();
  });
});

/**
 * Oregon's subtraction for the federal income tax you paid.
 *
 * `federalTaxDeductible` has flagged Alabama, Missouri and Oregon as allowing
 * this since the dataset was built, and was never anything but a label —
 * nothing read it. Oregon's was the largest single overcharge left at the
 * incomes this site serves.
 */
describe('Oregon federal tax subtraction', () => {
  const or = stateRules('OR');
  const at = (salary: number, federalTaxPaid: number) =>
    computeStateTax(
      { grossSalary: salary, filingStatus: 'single', children: 0, federalTaxPaid },
      or,
    );

  it('subtracts the federal bill, capped at $8,500', () => {
    // A federal bill under the cap is taken in full.
    expect(at(80_000, 6_000).taxableIncome).toBeCloseTo(
      at(80_000, 0).taxableIncome - 6_000,
      2,
    );
    // Over the cap, only $8,500 comes off.
    expect(at(80_000, 20_000).taxableIncome).toBeCloseTo(
      at(80_000, 0).taxableIncome - 8_500,
      2,
    );
  });

  /*
   * A staircase, not a taper: the cap holds at $8,500 to $125,000 and then
   * drops in five steps across a $20,000 span. Modelling it as a smooth taper
   * would give the wrong answer everywhere inside that span.
   */
  it('steps the cap down and then stops entirely', () => {
    const deducted = (salary: number) =>
      at(salary, 20_000).taxableIncome === at(salary, 0).taxableIncome
        ? 0
        : at(salary, 0).taxableIncome - at(salary, 20_000).taxableIncome;

    expect(deducted(125_000)).toBeCloseTo(8_500, 2);
    expect(deducted(128_000)).toBeCloseTo(6_800, 2);
    expect(deducted(143_000)).toBeCloseTo(1_700, 2);
    expect(deducted(150_000)).toBe(0);
  });

  /*
   * A head of household uses the JOINT thresholds, not the single ones —
   * Oregon's worksheet puts them under "all others".
   */
  it('puts a head of household on the joint thresholds', () => {
    const caps = or.federalTaxDeduction!.caps;
    expect(caps.headOfHousehold).toEqual(caps.marriedJointly);
    expect(caps.headOfHousehold?.[0][0]).toBe(250_000);
  });

  it('leaves states without the subtraction untouched', () => {
    for (const code of ['CA', 'NY', 'TX']) {
      expect(stateRules(code).federalTaxDeduction, code).toBeNull();
    }
  });
});
