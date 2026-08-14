import { describe, expect, it } from 'vitest';

import { computeFederal, earnedIncomeCreditFor } from './federal';
import { computeFica } from './fica';
import { federalRules, ficaRules } from './rules';
import type { FilingStatus } from '../types';

const RULES = federalRules();
const FICA = ficaRules();
const EITC = RULES.earnedIncomeCredit;

/**
 * Every figure here comes from IRS Rev. Proc. 2025-32, section 2.06, page 15 —
 * the same document the brackets and standard deduction are transcribed from.
 * They are repeated as literals on purpose: a test that read them back out of
 * the same JSON would pass however wrong the JSON was.
 */
const PUBLISHED = [
  { children: 0, earnedIncomeAmount: 8_680, maxCredit: 664, mfjThreshold: 18_140, mfjComplete: 26_820, otherThreshold: 10_860, otherComplete: 19_540 },
  { children: 1, earnedIncomeAmount: 13_020, maxCredit: 4_427, mfjThreshold: 31_160, mfjComplete: 58_863, otherThreshold: 23_890, otherComplete: 51_593 },
  { children: 2, earnedIncomeAmount: 18_290, maxCredit: 7_316, mfjThreshold: 31_160, mfjComplete: 65_899, otherThreshold: 23_890, otherComplete: 58_629 },
  { children: 3, earnedIncomeAmount: 18_290, maxCredit: 8_231, mfjThreshold: 31_160, mfjComplete: 70_244, otherThreshold: 23_890, otherComplete: 62_974 },
];

const credit = (income: number, filingStatus: FilingStatus, children: number) =>
  earnedIncomeCreditFor(income, filingStatus, children, EITC);

describe('EITC reproduces the published 2026 table', () => {
  it('is present in the current release at all', () => {
    expect(EITC).toBeDefined();
    expect(EITC!.investmentIncomeLimit).toBe(12_200);
  });

  it('hits the published maximum at the published earned-income amount', () => {
    for (const row of PUBLISHED) {
      expect(credit(row.earnedIncomeAmount, 'headOfHousehold', row.children)).toBeCloseTo(
        row.maxCredit,
        0,
      );
      expect(credit(row.earnedIncomeAmount, 'marriedJointly', row.children)).toBeCloseTo(
        row.maxCredit,
        0,
      );
    }
  });

  it('still pays the maximum right up to the phase-out threshold', () => {
    for (const row of PUBLISHED) {
      expect(credit(row.otherThreshold, 'single', row.children)).toBeCloseTo(row.maxCredit, 0);
      expect(credit(row.mfjThreshold, 'marriedJointly', row.children)).toBeCloseTo(
        row.maxCredit,
        0,
      );
    }
  });

  it('reaches exactly zero at the published completed-phaseout amount', () => {
    for (const row of PUBLISHED) {
      expect(credit(row.otherComplete, 'single', row.children)).toBeCloseTo(0, 0);
      expect(credit(row.mfjComplete, 'marriedJointly', row.children)).toBeCloseTo(0, 0);
      // And stays there.
      expect(credit(row.otherComplete + 10_000, 'single', row.children)).toBe(0);
    }
  });

  it('gives a joint return a longer phase-out than any other status', () => {
    for (const row of PUBLISHED.filter((r) => r.children > 0)) {
      const income = row.otherComplete - 1_000;
      expect(credit(income, 'marriedJointly', row.children)).toBeGreaterThan(
        credit(income, 'headOfHousehold', row.children),
      );
    }
  });

  it('treats four children the same as three', () => {
    // The table stops at "three or more".
    expect(credit(18_290, 'headOfHousehold', 5)).toBeCloseTo(credit(18_290, 'headOfHousehold', 3), 6);
  });

  it('pays nothing at zero income, because it is an EARNED income credit', () => {
    for (const row of PUBLISHED) {
      expect(credit(0, 'headOfHousehold', row.children)).toBe(0);
    }
  });

  it('does not claim it for a separate filer', () => {
    // Barred by section 32(d) outside circumstances this site cannot ask about.
    expect(credit(18_290, 'marriedSeparately', 2)).toBe(0);
  });

  it('is absent, not guessed, on a release that predates it', () => {
    expect(earnedIncomeCreditFor(18_290, 'headOfHousehold', 2, undefined)).toBe(0);
  });
});

describe('EITC in the full federal calculation', () => {
  const renter = (grossSalary: number, filingStatus: FilingStatus, children: number) =>
    computeFederal(
      {
        grossSalary,
        filingStatus,
        children,
        stateAndLocalIncomeTax: 0,
        propertyTax: 0,
        mortgageInterest: 0,
      },
      RULES,
    );

  it('is worth $7,316 to the household the audit named', () => {
    // Head of household, $18,290, two children. The engine used to report a
    // $2,368.50 refund and stop there.
    const result = renter(18_290, 'headOfHousehold', 2);
    expect(result.childTaxCredit).toBeCloseTo(2_368.5, 0);
    expect(result.earnedIncomeCredit).toBeCloseTo(7_316, 0);
    expect(result.tax).toBeCloseTo(-(2_368.5 + 7_316), 0);
  });

  it('leaves ordinary salaries completely alone', () => {
    for (const [salary, status, kids] of [
      [150_000, 'single', 0],
      [150_000, 'marriedJointly', 2],
      [90_000, 'headOfHousehold', 3],
    ] as Array<[number, FilingStatus, number]>) {
      expect(renter(salary, status, kids).earnedIncomeCredit).toBe(0);
    }
  });

  it('never turns a large tax bill into a refund', () => {
    for (const salary of [40_000, 80_000, 200_000]) {
      const result = renter(salary, 'marriedJointly', 2);
      if (result.taxBeforeCredits > 20_000) expect(result.tax).toBeGreaterThan(0);
    }
  });

  it('reconciles: tax is the bracket figure less both credits', () => {
    for (const salary of [0, 15_000, 30_000, 60_000, 150_000]) {
      const r = renter(salary, 'headOfHousehold', 2);
      expect(r.tax).toBeCloseTo(r.taxBeforeCredits - r.childTaxCredit - r.earnedIncomeCredit, 6);
    }
  });
});

describe('Social Security is capped per worker, not per household', () => {
  it('charges two earners more than one on the same household salary', () => {
    // The audit's case: $300,000 married. One earner stops at the wage base;
    // two earners are both under it and pay on the whole amount.
    const one = computeFica(300_000, 'marriedJointly', FICA, 1);
    const two = computeFica(300_000, 'marriedJointly', FICA, 2);

    expect(one.socialSecurity).toBeCloseTo(FICA.socialSecurityWageBase * 0.062, 0);
    expect(two.socialSecurity).toBeCloseTo(300_000 * 0.062, 0);
    expect(two.total - one.total).toBeCloseTo(7_161, 0);
  });

  it('makes no difference when the household is below the wage base anyway', () => {
    const one = computeFica(90_000, 'marriedJointly', FICA, 1);
    const two = computeFica(90_000, 'marriedJointly', FICA, 2);
    expect(one.total).toBeCloseTo(two.total, 6);
  });

  it('keeps the Additional Medicare threshold per return, not per worker', () => {
    // It is a filing-status threshold in the statute, so splitting the wages
    // must not double it.
    const one = computeFica(400_000, 'marriedJointly', FICA, 1);
    const two = computeFica(400_000, 'marriedJointly', FICA, 2);
    expect(one.additionalMedicare).toBeCloseTo(two.additionalMedicare, 6);
    expect(one.medicare).toBeCloseTo(two.medicare, 6);
  });

  it('defaults to one earner, so old links compute as they always did', () => {
    const explicit = computeFica(300_000, 'marriedJointly', FICA, 1);
    const defaulted = computeFica(300_000, 'marriedJointly', FICA);
    expect(defaulted.total).toBeCloseTo(explicit.total, 6);
  });

  it('never lets a nonsense earner count change the answer', () => {
    for (const earners of [0, -3, 0.4]) {
      expect(computeFica(300_000, 'marriedJointly', FICA, earners).total).toBeCloseTo(
        computeFica(300_000, 'marriedJointly', FICA, 1).total,
        6,
      );
    }
  });
});
