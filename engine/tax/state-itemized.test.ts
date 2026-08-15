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
  it('keeps the standard deduction until its own rules have been read', () => {
    for (const code of ALL_STATE_CODES) {
      if (code === 'CA') continue;
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
});
