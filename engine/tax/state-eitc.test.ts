import { describe, expect, it } from 'vitest';

import { computeStateTax } from './state';
import { stateRules, ALL_STATE_CODES } from './rules';
import { earnedIncomeCreditFor } from './federal';
import { federalRules } from './rules';
import { compare, defaultCityInputs } from '../compare';
import type { Household } from '../types';

/**
 * Around thirty states add their own earned income credit on top of the
 * federal one. None of it was modelled, so the households least able to absorb
 * a wrong answer were the ones getting one.
 *
 * REFUNDABILITY MATTERS MORE THAN THE PERCENTAGE here. A refundable credit pays
 * out below zero tax. A nonrefundable one stops at zero and is worth nothing to
 * a family that already owes nothing — which is exactly the family it is aimed
 * at. Missouri, Ohio, South Carolina and Utah made theirs nonrefundable.
 */

const FAMILY: Household = { filingStatus: 'headOfHousehold', children: 2, earners: 1 };
const LOW = 22_000;

const federal = (salary: number, children: number) =>
  earnedIncomeCreditFor(salary, 'headOfHousehold', children, federalRules().earnedIncomeCredit);

describe('the state credit', () => {
  const inputs = (salary: number, children: number) => ({
    grossSalary: salary,
    filingStatus: 'headOfHousehold' as const,
    children,
    federalEarnedIncomeCredit: federal(salary, children),
  });

  it('is the stated share of the federal credit', () => {
    const fed = federal(LOW, 2);
    expect(fed).toBeGreaterThan(0);
    // New Jersey matches 40%.
    expect(computeStateTax(inputs(LOW, 2), stateRules('NJ')).earnedIncomeCredit).toBeCloseTo(
      fed * 0.4,
      6,
    );
    // Louisiana matches 5%.
    expect(computeStateTax(inputs(LOW, 2), stateRules('LA')).earnedIncomeCredit).toBeCloseTo(
      fed * 0.05,
      6,
    );
  });

  it('varies with the number of children where the state says so', () => {
    // Wisconsin: nothing without children, 4% with one, 11% with two, 34% with three.
    const wi = stateRules('WI');
    expect(computeStateTax(inputs(LOW, 0), wi).earnedIncomeCredit).toBe(0);
    expect(computeStateTax(inputs(LOW, 1), wi).earnedIncomeCredit).toBeCloseTo(
      federal(LOW, 1) * 0.04,
      6,
    );
    expect(computeStateTax(inputs(LOW, 3), wi).earnedIncomeCredit).toBeCloseTo(
      federal(LOW, 3) * 0.34,
      6,
    );
  });

  /*
   * The distinction that matters. A refundable credit takes the bill below zero
   * and the household is paid; a nonrefundable one stops at zero.
   */
  it('pays out below zero where the state made it refundable', () => {
    const nj = computeStateTax(inputs(LOW, 2), stateRules('NJ'));
    expect(nj.earnedIncomeCredit).toBeGreaterThan(0);
    expect(nj.tax).toBeLessThan(0);
  });

  it('stops at zero where the state did not', () => {
    for (const code of ['MO', 'OH', 'SC', 'UT']) {
      const r = computeStateTax(inputs(LOW, 2), stateRules(code));
      expect(r.earnedIncomeCredit, code).toBeGreaterThan(0);
      expect(r.tax, code).toBeGreaterThanOrEqual(0);
    }
  });

  it('is absent, and changes nothing, where no credit is modelled', () => {
    for (const code of ALL_STATE_CODES) {
      const rules = stateRules(code);
      if (rules.earnedIncomeCredit) continue;
      const withFed = computeStateTax(inputs(LOW, 2), rules);
      const withoutFed = computeStateTax(
        { grossSalary: LOW, filingStatus: 'headOfHousehold', children: 2 },
        rules,
      );
      expect(withFed.earnedIncomeCredit, code).toBe(0);
      expect(withFed.tax, code).toBeCloseTo(withoutFed.tax, 6);
    }
  });

  it('never exceeds the federal credit it is a share of, except where the state says so', () => {
    for (const code of ALL_STATE_CODES) {
      const rules = stateRules(code);
      if (!rules.earnedIncomeCredit) continue;
      const r = computeStateTax(inputs(LOW, 2), rules);
      // South Carolina matches 125%; nobody exceeds that.
      expect(r.earnedIncomeCredit, code).toBeLessThanOrEqual(federal(LOW, 2) * 1.25 + 0.01);
    }
  });
});

describe('the whole calculation', () => {
  const at = (metroId: string, stateCode: string, version?: string) =>
    compare({
      datasetVersion: version as string,
      household: FAMILY,
      origin: {
        ...defaultCityInputs(metroId, LOW, FAMILY, 'rent', 0.068, version),
        stateCode,
      },
      destination: defaultCityInputs('12420', LOW, FAMILY, 'rent', 0.068, version),
    }).origin;

  it('leaves a low-income family in New Jersey better off', () => {
    // The New York metro crosses into New Jersey, which matches 40% refundably.
    expect(at('35620', 'NJ').leftover).toBeGreaterThan(at('35620', 'NJ', '2026.16').leftover);
  });

  /*
   * Measured on STATE TAX, not on leftover. 2026.17 carries two changes — this
   * credit and the restoration of hotel spending — so a Texan's leftover moves
   * for a reason that has nothing to do with the credit. A cross-version test
   * that spans two changes tests neither, which has bitten this suite before.
   */
  it('leaves a Texan family with no state credit, because Texas has none', () => {
    expect(at('12420', 'TX').tax.state).toBe(0);
    expect(at('12420', 'TX', '2026.16').tax.state).toBe(0);
  });
});
