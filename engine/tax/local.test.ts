import { describe, expect, it } from 'vitest';

import {
  computeLocalTax,
  NO_LOCAL_TAX,
  type BracketedLocalTax,
  type FlatRateLocalTax,
  type LocalTaxInputs,
  type StateSurchargeLocalTax,
} from './local';

const inputs = (over: Partial<LocalTaxInputs> = {}): LocalTaxInputs => ({
  grossSalary: 150_000,
  filingStatus: 'single',
  children: 0,
  stateTax: 9_000,
  ...over,
});

// Synthetic fixtures — the engine is tested independently of the real dataset
// so these tests stay valid when rates are refreshed.

const FLAT: FlatRateLocalTax = {
  kind: 'flatRate',
  id: 'test-flat',
  name: 'Testville',
  stateCode: 'XX',
  rate: 0.025,
};

const SURCHARGE: StateSurchargeLocalTax = {
  kind: 'stateSurcharge',
  id: 'test-surcharge',
  name: 'Surchargeton',
  stateCode: 'XX',
  rate: 0.1675,
};

const BRACKETED: BracketedLocalTax = {
  kind: 'bracketed',
  id: 'test-bracketed',
  name: 'Bracketburg',
  stateCode: 'XX',
  brackets: {
    single: [
      { from: 0, rate: 0.03078 },
      { from: 12_000, rate: 0.03762 },
      { from: 25_000, rate: 0.03819 },
      { from: 50_000, rate: 0.03876 },
    ],
    marriedJointly: [
      { from: 0, rate: 0.03078 },
      { from: 21_600, rate: 0.03762 },
      { from: 45_000, rate: 0.03819 },
      { from: 90_000, rate: 0.03876 },
    ],
  },
  standardDeduction: { single: 0, marriedJointly: 0 },
  exemptionPerDependent: 1_000,
};

describe('no local tax', () => {
  it('returns zero when the metro has none', () => {
    expect(computeLocalTax(inputs(), null)).toEqual(NO_LOCAL_TAX);
  });

  it('is the common case — most metros pass null', () => {
    expect(NO_LOCAL_TAX.tax).toBe(0);
    expect(NO_LOCAL_TAX.jurisdictionId).toBeNull();
  });
});

describe('flat rate', () => {
  it('applies the rate to gross wages', () => {
    expect(computeLocalTax(inputs(), FLAT).tax).toBeCloseTo(3_750, 6);
  });

  it('ignores filing status and children', () => {
    const a = computeLocalTax(inputs({ filingStatus: 'marriedJointly', children: 3 }), FLAT).tax;
    const b = computeLocalTax(inputs(), FLAT).tax;
    expect(a).toBeCloseTo(b, 6);
  });

  it('is zero at zero income', () => {
    expect(computeLocalTax(inputs({ grossSalary: 0 }), FLAT).tax).toBe(0);
  });
});

describe('state surcharge', () => {
  it('applies to the state liability, not to income', () => {
    // 16.75% of $9,000 state tax.
    expect(computeLocalTax(inputs(), SURCHARGE).tax).toBeCloseTo(1_507.5, 6);
  });

  it('scales with state tax rather than salary', () => {
    const lowStateTax = computeLocalTax(inputs({ stateTax: 1_000 }), SURCHARGE).tax;
    const highStateTax = computeLocalTax(inputs({ stateTax: 20_000 }), SURCHARGE).tax;
    expect(highStateTax).toBeGreaterThan(lowStateTax);

    // Salary alone changes nothing.
    const sameSalaryChange = computeLocalTax(
      inputs({ grossSalary: 500_000, stateTax: 9_000 }),
      SURCHARGE,
    ).tax;
    expect(sameSalaryChange).toBeCloseTo(computeLocalTax(inputs(), SURCHARGE).tax, 6);
  });

  it('is zero in a state with no income tax, since the base is zero', () => {
    expect(computeLocalTax(inputs({ stateTax: 0 }), SURCHARGE).tax).toBe(0);
  });

  it('never goes negative', () => {
    expect(computeLocalTax(inputs({ stateTax: -500 }), SURCHARGE).tax).toBe(0);
  });
});

describe('bracketed', () => {
  it('applies its own progressive schedule', () => {
    const gross = 150_000;
    const { tax } = computeLocalTax(inputs({ grossSalary: gross }), BRACKETED);

    // Hand-computed against the fixture, band by band.
    const expected =
      12_000 * 0.03078 +
      13_000 * 0.03762 +
      25_000 * 0.03819 +
      100_000 * 0.03876;
    expect(tax).toBeCloseTo(expected, 6);

    // The effective rate sits strictly between the bottom and top marginal
    // rates — below the top rate, because the first $50,000 is taxed lower.
    const effective = tax / gross;
    expect(effective).toBeGreaterThan(0.03078);
    expect(effective).toBeLessThan(0.03876);
  });

  it('uses the joint schedule for joint filers', () => {
    const single = computeLocalTax(inputs({ grossSalary: 60_000 }), BRACKETED).tax;
    const joint = computeLocalTax(
      inputs({ grossSalary: 60_000, filingStatus: 'marriedJointly' }),
      BRACKETED,
    ).tax;
    // Joint brackets are wider, so the same income is taxed slightly less.
    expect(joint).toBeLessThan(single);
  });

  it('reduces taxable income for dependents', () => {
    const none = computeLocalTax(inputs({ children: 0 }), BRACKETED);
    const two = computeLocalTax(inputs({ children: 2 }), BRACKETED);
    expect(two.taxableIncome).toBe(none.taxableIncome - 2_000);
    expect(two.tax).toBeLessThan(none.tax);
  });

  it('maps head of household and separate filers to the single schedule', () => {
    const single = computeLocalTax(inputs(), BRACKETED).tax;
    for (const status of ['headOfHousehold', 'marriedSeparately'] as const) {
      expect(computeLocalTax(inputs({ filingStatus: status }), BRACKETED).tax).toBeCloseTo(single, 6);
    }
  });

  it('is zero at zero income', () => {
    expect(computeLocalTax(inputs({ grossSalary: 0 }), BRACKETED).tax).toBe(0);
  });
});

describe('universal properties', () => {
  for (const [label, rules] of [
    ['flatRate', FLAT],
    ['stateSurcharge', SURCHARGE],
    ['bracketed', BRACKETED],
  ] as const) {
    it(`${label}: never negative and rises monotonically`, () => {
      let previous = -Infinity;
      for (let salary = 0; salary <= 400_000; salary += 20_000) {
        const { tax } = computeLocalTax(
          inputs({ grossSalary: salary, stateTax: salary * 0.06 }),
          rules,
        );
        expect(tax).toBeGreaterThanOrEqual(0);
        expect(tax).toBeGreaterThanOrEqual(previous - 1e-9);
        previous = tax;
      }
    });

    it(`${label}: stays a small share of income`, () => {
      const { tax } = computeLocalTax(inputs({ grossSalary: 200_000, stateTax: 14_000 }), rules);
      expect(tax).toBeLessThan(200_000 * 0.05);
    });
  }
});
