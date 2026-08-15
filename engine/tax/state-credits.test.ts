/**
 * Credits and deductions that sit outside the bracket arithmetic.
 *
 * Each of these was missing, and all but one ran the same way — we charged too
 * much, because a credit nobody applied is money the reader does not get back.
 */

import { describe, expect, it } from 'vitest';

import { computeStateTax } from './state';
import { stateRules } from './rules';

const SINGLE = { filingStatus: 'single' as const, children: 0 };
const FAMILY = { filingStatus: 'marriedJointly' as const, children: 2, earners: 2 };

describe('Idaho grocery credit', () => {
  const id = stateRules('ID');

  /*
   * $155 for the filer, the spouse and every dependent, with NO income test of
   * any kind — and refundable. A family of four gets $620 whether they owe
   * anything or not, which is the part an ordinary credit would silently cap.
   */
  it('gives every person $155 at every income', () => {
    for (const salary of [30_000, 80_000, 150_000, 400_000]) {
      const before = computeStateTax({ ...SINGLE, grossSalary: salary }, stateRules('ID', '2026.25')).tax;
      const after = computeStateTax({ ...SINGLE, grossSalary: salary }, id).tax;
      expect(before - after, `$${salary}`).toBeCloseTo(155, 2);
    }
  });

  it('counts the spouse and the children', () => {
    const before = computeStateTax({ ...FAMILY, grossSalary: 80_000 }, stateRules('ID', '2026.25')).tax;
    const after = computeStateTax({ ...FAMILY, grossSalary: 80_000 }, id).tax;
    expect(before - after).toBeCloseTo(155 * 4, 2);
  });

  /*
   * Refundable, so it keeps going past zero. Capping it at the tax owed would
   * take most of its value from exactly the households it exists for.
   */
  it('pays out below zero tax', () => {
    expect(id.personalCreditRefundable).toBe(true);
    expect(computeStateTax({ ...FAMILY, grossSalary: 20_000 }, id).tax).toBeLessThan(0);
  });
});

describe('Massachusetts payroll tax deduction', () => {
  const ma = stateRules('MA');
  const at = (h: typeof SINGLE | typeof FAMILY, payrollTaxPaid: number) =>
    computeStateTax({ ...h, grossSalary: 150_000, payrollTaxPaid }, ma).tax;

  /*
   * $2,000 EACH, on two separate lines of the form — one per spouse. Reading
   * it as per return would halve it for every couple in the state.
   */
  it('gives $2,000 per person, not per return', () => {
    expect(ma.payrollTaxDeduction?.capPerPerson).toBe(2_000);
    const singleSaving = at(SINGLE, 0) - at(SINGLE, 11_475);
    const coupleSaving = at(FAMILY, 0) - at(FAMILY, 11_475);
    expect(coupleSaving).toBeCloseTo(singleSaving * 2, 2);
    expect(singleSaving).toBeCloseTo(2_000 * 0.05, 2);
  });

  it('never exceeds what was actually withheld', () => {
    expect(at(SINGLE, 0) - at(SINGLE, 500)).toBeCloseTo(500 * 0.05, 2);
  });
});

describe('Illinois property tax credit', () => {
  const il = stateRules('IL');
  const at = (salary: number, propertyTax: number) =>
    computeStateTax({ ...SINGLE, grossSalary: salary, propertyTax }, il).tax;

  it('credits 5% of the property tax', () => {
    expect(at(150_000, 0) - at(150_000, 7_000)).toBeCloseTo(7_000 * 0.05, 2);
  });

  /*
   * A cliff, not a taper: one dollar over $250,000 and the whole credit is
   * gone. Modelling it as a taper would give money away across a range where
   * Illinois gives none.
   */
  it('vanishes entirely one dollar over the cliff', () => {
    expect(at(250_000, 7_000)).toBeLessThan(at(250_000, 0));
    expect(at(250_001, 7_000)).toBeCloseTo(at(250_001, 0), 2);
  });
});

describe('Ohio joint filing credit', () => {
  const oh = stateRules('OH');

  /*
   * The only credit here with an earners condition: both spouses need $500 of
   * qualifying income, so a sole earner gets nothing at all.
   */
  it('reaches only couples where both work', () => {
    const both = computeStateTax({ ...FAMILY, grossSalary: 150_000 }, oh).tax;
    const sole = computeStateTax({ ...FAMILY, earners: 1, grossSalary: 150_000 }, oh).tax;
    expect(both).toBeLessThan(sole);
    expect(computeStateTax({ ...SINGLE, grossSalary: 150_000 }, oh).tax).toBeGreaterThan(0);
  });

  it('stops at $650 however large the bill', () => {
    expect(oh.taxCreditFraction?.max).toBe(650);
    const rich = computeStateTax({ ...FAMILY, grossSalary: 700_000 }, oh);
    const richNoCredit = computeStateTax(
      { ...FAMILY, grossSalary: 700_000 },
      { ...oh, taxCreditFraction: null },
    );
    expect(richNoCredit.tax - rich.tax).toBeCloseTo(650, 2);
  });
});
