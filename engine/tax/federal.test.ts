import { describe, expect, it } from 'vitest';

import { applyBrackets, validateBrackets } from './brackets';
import {
  childTaxCreditFor,
  computeFederal,
  saltCapFor,
  type FederalInputs,
} from './federal';
import {
  ALL_FILING_STATUSES,
  FEDERAL_RULES_2026 as RULES,
  IRS_GOLDEN_VALUES,
} from './rules';

/** A renter with no deductible costs — the plain-vanilla case. */
function renter(overrides: Partial<FederalInputs> = {}): FederalInputs {
  return {
    grossSalary: 150_000,
    filingStatus: 'single',
    children: 0,
    stateAndLocalIncomeTax: 0,
    propertyTax: 0,
    mortgageInterest: 0,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// The golden tests: our arithmetic vs the IRS's own published figures.
// ---------------------------------------------------------------------------

describe('IRS Rev. Proc. 2025-32 golden values', () => {
  for (const status of ALL_FILING_STATUSES) {
    describe(status, () => {
      it('has a well-formed bracket schedule', () => {
        expect(validateBrackets(RULES.brackets[status])).toEqual([]);
      });

      for (const { taxableIncome, tax } of IRS_GOLDEN_VALUES[status]) {
        it(`taxable $${taxableIncome.toLocaleString()} -> $${tax.toLocaleString()}`, () => {
          // The IRS publishes these cumulative amounts directly in its rate
          // tables. Reproducing them to the cent proves the bracket data was
          // transcribed correctly AND that the arithmetic is right.
          expect(applyBrackets(taxableIncome, RULES.brackets[status])).toBeCloseTo(tax, 2);
        });
      }
    });
  }

  it('married-separately diverges from single only at the top bracket', () => {
    const single = RULES.brackets.single;
    const mfs = RULES.brackets.marriedSeparately;

    // Identical through the 35% bracket...
    for (let i = 0; i < 6; i++) {
      expect(mfs[i]).toEqual(single[i]);
    }
    // ...then MFS hits 37% at half the joint threshold, far earlier.
    expect(mfs[6].from).toBe(384_350);
    expect(single[6].from).toBe(640_600);
  });

  it('head-of-household thresholds are genuinely distinct from single', () => {
    // A $25 difference that no one would reproduce from memory — exactly why
    // these figures are pinned to the published tables.
    expect(RULES.brackets.headOfHousehold[4].from).toBe(201_750);
    expect(RULES.brackets.single[4].from).toBe(201_775);
  });
});

// ---------------------------------------------------------------------------
// Deduction: standard vs itemized
// ---------------------------------------------------------------------------

describe('standard vs itemized deduction', () => {
  it('takes the standard deduction for a renter with no state tax', () => {
    const result = computeFederal(renter(), RULES);
    expect(result.itemized).toBe(false);
    expect(result.deductionTaken).toBe(16_100);
  });

  it('still takes the standard deduction for a typical homeowner', () => {
    // The point from PROJECT.md section 2: most households do NOT itemize, so
    // "the tax benefits of owning" frequently do not exist.
    const result = computeFederal(
      renter({
        stateAndLocalIncomeTax: 4_000,
        propertyTax: 3_500,
        mortgageInterest: 7_000,
      }),
      RULES,
    );
    expect(result.itemizedTotal).toBe(14_500);
    expect(result.itemized).toBe(false);
    expect(result.deductionTaken).toBe(16_100);
  });

  it('itemizes for a high-tax-state homeowner with a large mortgage', () => {
    const result = computeFederal(
      renter({
        grossSalary: 250_000,
        stateAndLocalIncomeTax: 18_000,
        propertyTax: 12_000,
        mortgageInterest: 22_000,
      }),
      RULES,
    );
    expect(result.itemized).toBe(true);
    expect(result.saltDeducted).toBe(30_000);
    expect(result.deductionTaken).toBe(52_000);
  });

  it('caps the SALT deduction', () => {
    const result = computeFederal(
      renter({
        grossSalary: 400_000,
        stateAndLocalIncomeTax: 35_000,
        propertyTax: 20_000,
        mortgageInterest: 5_000,
      }),
      RULES,
    );
    // $55,000 paid, but only $40,400 is deductible.
    expect(result.saltDeducted).toBe(40_400);
    expect(result.itemizedTotal).toBe(45_400);
  });

  it('order matters: state tax changes the federal result', () => {
    const base = renter({ grossSalary: 250_000, mortgageInterest: 22_000, propertyTax: 12_000 });
    const lowTaxState = computeFederal({ ...base, stateAndLocalIncomeTax: 0 }, RULES);
    const highTaxState = computeFederal({ ...base, stateAndLocalIncomeTax: 18_000 }, RULES);

    // Paying more state tax increases the federal deduction and so lowers
    // federal tax. Computing federal first would miss this entirely.
    expect(highTaxState.deductionTaken).toBeGreaterThan(lowTaxState.deductionTaken);
    expect(highTaxState.tax).toBeLessThan(lowTaxState.tax);
  });
});

// ---------------------------------------------------------------------------
// SALT cap phase-down
// ---------------------------------------------------------------------------

describe('saltCapFor', () => {
  it('gives the full cap below the phase-down threshold', () => {
    expect(saltCapFor(400_000, 'marriedJointly', RULES.saltCap)).toBe(40_400);
    expect(saltCapFor(505_000, 'marriedJointly', RULES.saltCap)).toBe(40_400);
  });

  it('phases the cap down at 30 cents per dollar above the threshold', () => {
    // $50,000 over -> $15,000 reduction.
    expect(saltCapFor(555_000, 'marriedJointly', RULES.saltCap)).toBeCloseTo(25_400, 6);
  });

  it('never falls below the floor', () => {
    expect(saltCapFor(5_000_000, 'marriedJointly', RULES.saltCap)).toBe(10_000);
  });

  it('halves the cap and floor for married filing separately', () => {
    expect(saltCapFor(0, 'marriedSeparately', RULES.saltCap)).toBe(20_200);
    expect(saltCapFor(5_000_000, 'marriedSeparately', RULES.saltCap)).toBe(5_000);
  });
});

// ---------------------------------------------------------------------------
// Child Tax Credit
// ---------------------------------------------------------------------------

describe('childTaxCreditFor', () => {
  it('is zero with no children', () => {
    expect(childTaxCreditFor(150_000, 'single', 0, RULES.childTaxCredit)).toBe(0);
  });

  it('gives the full credit below the phase-out', () => {
    expect(childTaxCreditFor(150_000, 'marriedJointly', 2, RULES.childTaxCredit)).toBe(4_400);
  });

  it('phases out by $50 per $1,000 over the threshold', () => {
    // $20,000 over -> 20 x $50 = $1,000 reduction.
    expect(childTaxCreditFor(420_000, 'marriedJointly', 2, RULES.childTaxCredit)).toBe(3_400);
  });

  it('rounds a partial $1,000 upward', () => {
    // $1 over still counts as a full thousand.
    expect(childTaxCreditFor(400_001, 'marriedJointly', 1, RULES.childTaxCredit)).toBe(2_150);
  });

  it('never goes negative', () => {
    expect(childTaxCreditFor(2_000_000, 'marriedJointly', 2, RULES.childTaxCredit)).toBe(0);
  });
});

describe('child tax credit in the full computation', () => {
  it('reduces tax by the full credit for a middle-income family', () => {
    const without = computeFederal(
      renter({ grossSalary: 150_000, filingStatus: 'marriedJointly', children: 0 }),
      RULES,
    );
    const with2 = computeFederal(
      renter({ grossSalary: 150_000, filingStatus: 'marriedJointly', children: 2 }),
      RULES,
    );
    expect(without.tax - with2.tax).toBeCloseTo(4_400, 6);
  });

  it('does not push tax below zero via the non-refundable portion alone', () => {
    // Low earner: tax liability is small, so most of the credit is unusable
    // except through the refundable ACTC.
    const result = computeFederal(
      renter({ grossSalary: 30_000, filingStatus: 'marriedJointly', children: 3 }),
      RULES,
    );
    // Refundable portion is capped at 15% of earned income over $2,500.
    const actcLimit = 0.15 * (30_000 - 2_500);
    expect(result.tax).toBeGreaterThanOrEqual(result.taxBeforeCredits - result.childTaxCredit - 0.01);
    expect(result.childTaxCredit).toBeLessThanOrEqual(
      result.taxBeforeCredits + actcLimit + 0.01,
    );
  });
});

// ---------------------------------------------------------------------------
// Sanity properties
// ---------------------------------------------------------------------------

describe('sanity properties', () => {
  it('married filing jointly never pays more than two singles would... at the same income', () => {
    // The classic marriage bonus at a single-earner household.
    const single = computeFederal(renter({ filingStatus: 'single' }), RULES);
    const joint = computeFederal(renter({ filingStatus: 'marriedJointly' }), RULES);
    expect(joint.tax).toBeLessThan(single.tax);
  });

  it('tax rises monotonically with salary', () => {
    let previous = -Infinity;
    for (let salary = 0; salary <= 900_000; salary += 10_000) {
      const { tax } = computeFederal(renter({ grossSalary: salary }), RULES);
      expect(tax).toBeGreaterThanOrEqual(previous);
      previous = tax;
    }
  });

  it('never taxes more than the top marginal rate of gross income', () => {
    for (const salary of [50_000, 150_000, 400_000, 1_500_000]) {
      const { tax } = computeFederal(renter({ grossSalary: salary }), RULES);
      expect(tax).toBeLessThan(salary * 0.37);
    }
  });

  it('produces zero tax at zero income', () => {
    expect(computeFederal(renter({ grossSalary: 0 }), RULES).tax).toBe(0);
  });
});
