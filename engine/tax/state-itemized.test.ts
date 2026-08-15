import { describe, expect, it } from 'vitest';

import { computeStateTax } from './state';
import { stateRules, ALL_STATE_CODES } from './rules';
import { compare, defaultCityInputs } from '../compare';
import type { Household } from '../types';

/**
 * The engine always took the state STANDARD deduction, even though it already
 * knew the reader's property tax and mortgage interest.
 *
 * California lets you itemise on the state return whether or not you itemised
 * federally, and its rules are markedly more generous than the federal ones:
 * no SALT cap — California explicitly does not conform to OBBBA's increased
 * limitation — and mortgage interest on $1,000,000 of debt where the federal
 * limit is $750,000.
 *
 * On a San Jose buyer it is worth $6,643 at $150,000 and $6,845 at $300,000.
 */

const SINGLE: Household = { filingStatus: 'single', children: 0, earners: 1 };
const SAN_JOSE = '41940';
const AUSTIN = '12420';

describe('California itemised deductions', () => {
  const ca = stateRules('CA');
  const base = { grossSalary: 250_000, filingStatus: 'single' as const, children: 0 };

  it('itemises when the housing costs beat the standard deduction', () => {
    const standard = computeStateTax(base, ca);
    const itemising = computeStateTax(
      { ...base, propertyTax: 14_000, mortgageInterest: 55_000, mortgageDebt: 900_000 },
      ca,
    );
    expect(standard.itemized).toBe(false);
    expect(itemising.itemized).toBe(true);
    expect(itemising.tax).toBeLessThan(standard.tax);
  });

  it('keeps the standard deduction when it is the larger of the two', () => {
    const tiny = computeStateTax(
      { ...base, propertyTax: 500, mortgageInterest: 800, mortgageDebt: 20_000 },
      ca,
    );
    expect(tiny.itemized).toBe(false);
    expect(tiny.deductions).toBe(ca.standardDeduction.single);
  });

  /*
   * California's own mortgage limit is $1,000,000, not the federal $750,000.
   * Using the federal figure here would have thrown away real deduction.
   */
  it('uses California\'s own $1,000,000 debt limit, not the federal one', () => {
    const rules = ca.itemizedDeductions!;
    expect(rules.mortgageDebtLimit).toBe(1_000_000);

    const atLimit = computeStateTax(
      { ...base, propertyTax: 0, mortgageInterest: 60_000, mortgageDebt: 1_000_000 },
      ca,
    );
    const overLimit = computeStateTax(
      { ...base, propertyTax: 0, mortgageInterest: 60_000, mortgageDebt: 2_000_000 },
      ca,
    );
    // Twice the limit borrowed, so half the interest counts.
    expect(overLimit.deductions).toBeCloseTo(atLimit.deductions / 2, 0);
  });

  it('does not deduct California tax from California income', () => {
    expect(ca.itemizedDeductions!.deductStateIncomeTax).toBe(false);
  });
});

describe('every other state', () => {
  /*
   * TEN STATES NOW ALLOW ITEMISING, not one. Every other state still keeps the
   * standard deduction until its own rules have been read, and this pins that
   * — a state that quietly grows an itemising block without anyone reading its
   * form is exactly the regression this guards.
   */
  const ITEMISING_STATES = new Set([
    'CA', 'KS', 'AL', 'MN', 'NC', 'VA', 'MD', 'MT', 'NM', 'ID', 'OK', 'NY',
    // New Jersey has no itemising at all, but it does relieve property tax,
    // so housing figures legitimately move its answer.
    'NJ',
  ]);

  it('keeps the standard deduction until its own rules have been read', () => {
    for (const code of ALL_STATE_CODES) {
      if (ITEMISING_STATES.has(code)) continue;
      const rules = stateRules(code);
      expect(rules.itemizedDeductions, code).toBeNull();
      // And housing figures must change nothing where the rules are absent.
      const withHousing = computeStateTax(
        {
          grossSalary: 200_000,
          filingStatus: 'single',
          children: 0,
          propertyTax: 20_000,
          mortgageInterest: 60_000,
          mortgageDebt: 900_000,
        },
        rules,
      );
      const without = computeStateTax(
        { grossSalary: 200_000, filingStatus: 'single', children: 0 },
        rules,
      );
      expect(withHousing.tax, code).toBeCloseTo(without.tax, 6);
    }
  });
});

describe('the whole calculation', () => {
  const at = (tenure: 'rent' | 'own', salary: number, version?: string) =>
    compare({
      datasetVersion: version as string,
      household: SINGLE,
      origin: defaultCityInputs(SAN_JOSE, salary, SINGLE, tenure, 0.068, version),
      destination: defaultCityInputs(AUSTIN, salary, SINGLE, tenure, 0.068, version),
    }).origin;

  it('cuts a San Jose buyer\'s state tax by thousands', () => {
    const saving = at('own', 300_000, '2026.15').tax.state - at('own', 300_000).tax.state;
    expect(saving).toBeGreaterThan(6_000);
    expect(saving).toBeLessThan(8_000);
  });

  it('leaves a renter exactly where they were', () => {
    // No property tax and no mortgage interest, so nothing to itemise.
    expect(at('rent', 300_000).tax.state).toBeCloseTo(at('rent', 300_000, '2026.15').tax.state, 6);
  });

  it('leaves links pinned to an older release on the standard deduction', () => {
    expect(stateRules('CA', '2026.15').itemizedDeductions).toBeUndefined();
  });

  /*
   * CALIFORNIA CUTS ITEMISED DEDUCTIONS FOR HIGH EARNERS and we used to ignore
   * it, with a comment saying so. That ran in the reader's favour — a bigger
   * deduction than they get, and so more money left over than they will have —
   * which is the direction that actually moves someone across the country.
   *
   * The reduction is the LESSER of 6% of income above the threshold and 80% of
   * the deductions themselves.
   */
  it('cuts a high earner\'s California itemised deductions', () => {
    const rules = stateRules('CA');
    const reduce = rules.itemizedDeductions?.highIncomeReduction;
    expect(reduce?.perDollarAbove).toBe(0.06);
    expect(reduce?.maxFractionOfDeductions).toBe(0.8);

    const withHouse = { propertyTax: 12_000, mortgageInterest: 50_000, mortgageDebt: 900_000 };
    const below = computeStateTax(
      { grossSalary: 200_000, filingStatus: 'single', children: 0, ...withHouse },
      rules,
    );
    const above = computeStateTax(
      { grossSalary: 500_000, filingStatus: 'single', children: 0, ...withHouse },
      rules,
    );

    // Under the threshold the whole $62,000 survives.
    expect(below.deductions).toBeCloseTo(62_000, 2);
    // Over it, 6% of the $247,797 excess comes off — $14,868 — which is well
    // short of the 80% floor, so the percentage is what bites.
    expect(above.deductions).toBeCloseTo(62_000 - 0.06 * (500_000 - 252_203), 2);
    expect(above.itemized).toBe(true);
  });

  /*
   * The 80% floor is not decoration. Without it the reduction would eventually
   * exceed the deduction itself and start adding to taxable income.
   */
  it('never lets the reduction take more than four fifths', () => {
    const rules = stateRules('CA');
    const result = computeStateTax(
      {
        grossSalary: 5_000_000,
        filingStatus: 'single',
        children: 0,
        propertyTax: 12_000,
        mortgageInterest: 50_000,
        mortgageDebt: 900_000,
      },
      rules,
    );
    // 6% of the excess would be about $285,000, far more than the $62,000 of
    // deductions. The floor holds it at a fifth of them.
    expect(result.deductions).toBeCloseTo(62_000 * 0.2, 2);
  });

  /*
   * California does NOT conform to the federal cap on state and local tax, so
   * every dollar of property tax is deductible. Copying the federal cap in
   * would have overcharged Californians.
   */
  it('applies no cap to California property tax', () => {
    expect(stateRules('CA').itemizedDeductions?.saltCap).toBeNull();
  });
});

/**
 * New Jersey relieves property tax without itemising at all.
 *
 * New Jersey has no standard deduction, no itemised deductions, and no
 * mortgage interest deduction. What it has is a deduction of up to $15,000 of
 * property tax off taxable income — and it counts 18% of a renter's rent as
 * property tax, which makes it the only relief in this engine a renter can
 * claim. New Jersey has the highest property taxes in the country.
 */
describe('New Jersey property tax relief', () => {
  const nj = stateRules('NJ');
  const SINGLE = { filingStatus: 'single' as const, children: 0 };

  it('is not itemising, and New Jersey still has none', () => {
    expect(nj.itemizedDeductions).toBeNull();
    expect(nj.propertyTaxRelief?.cap).toBe(15_000);
    expect(nj.propertyTaxRelief?.renterShareOfRent).toBe(0.18);
  });

  it('gives a renter relief, which nothing else here does', () => {
    const rent = computeStateTax({ ...SINGLE, grossSalary: 100_000, annualRent: 30_000 }, nj);
    const nothing = computeStateTax({ ...SINGLE, grossSalary: 100_000 }, nj);
    // 18% of $30,000 is $5,400 off taxable income.
    expect(nothing.taxableIncome - rent.taxableIncome).toBeCloseTo(5_400, 2);
    expect(rent.tax).toBeLessThan(nothing.tax);
  });

  it('caps the relief at $15,000 however large the bill', () => {
    const huge = computeStateTax({ ...SINGLE, grossSalary: 200_000, propertyTax: 40_000 }, nj);
    const atCap = computeStateTax({ ...SINGLE, grossSalary: 200_000, propertyTax: 15_000 }, nj);
    expect(huge.tax).toBeCloseTo(atCap.tax, 6);
  });

  /*
   * Mortgage interest is worth exactly nothing in New Jersey. Getting that
   * wrong would be easy — every other state in this file relieves it.
   */
  it('gives nothing at all for mortgage interest', () => {
    const withInterest = computeStateTax(
      { ...SINGLE, grossSalary: 150_000, mortgageInterest: 25_000 },
      nj,
    );
    expect(withInterest.tax).toBeCloseTo(
      computeStateTax({ ...SINGLE, grossSalary: 150_000 }, nj).tax,
      6,
    );
  });

  /*
   * The $50 credit is an alternative, not an addition — New Jersey works out
   * both and takes the better. Below the filing threshold there is no relief
   * at all.
   */
  it('withholds the relief below the filing threshold', () => {
    const low = computeStateTax({ ...SINGLE, grossSalary: 9_000, propertyTax: 6_000 }, nj);
    expect(low.taxableIncome).toBeCloseTo(
      computeStateTax({ ...SINGLE, grossSalary: 9_000 }, nj).taxableIncome,
      6,
    );
  });
});

/**
 * New York's two reductions, which are different shapes.
 */
describe('New York itemised deductions', () => {
  const ny = stateRules('NY');
  const house = { propertyTax: 8_000, mortgageInterest: 18_000, mortgageDebt: 700_000 };
  const single = (salary: number) =>
    computeStateTax({ grossSalary: salary, filingStatus: 'single', children: 0, ...house }, ny);

  it('caps mortgage debt at $1,000,000, not the federal $750,000', () => {
    expect(ny.itemizedDeductions?.mortgageDebtLimit).toBe(1_000_000);
    // And property tax is uncapped: "not subject to this federal limit".
    expect(ny.itemizedDeductions?.saltCap).toBeNull();
  });

  it('gives the whole deduction below the threshold', () => {
    expect(single(80_000).deductions).toBeCloseTo(26_000, 2);
  });

  /*
   * The line 46 cut keeps a SHARE of the deduction, scaled by how far through
   * a $50,000 band the income sits. A single filer at $150,000 is at the very
   * top of that band and loses a flat quarter — $19,500 of $26,000, which is
   * the figure New York's own worked example produces.
   */
  it('keeps three quarters at the top of the phase-in band', () => {
    expect(single(150_000).deductions).toBeCloseTo(19_500, 2);
    expect(single(300_000).deductions).toBeCloseTo(19_500, 2);
  });

  it('throws the deduction away above $1,000,000', () => {
    // Above a million New York allows only a share of charitable giving, which
    // this engine never asks about — so the standard deduction takes over.
    expect(single(1_200_000).deductions).toBe(ny.standardDeduction.single);
  });
});
