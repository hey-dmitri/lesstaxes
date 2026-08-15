import { describe, expect, it } from 'vitest';

import { deductibleMortgageInterest, computeFederal } from './federal';
import { federalRules } from './rules';
import { compare, defaultCityInputs } from '../compare';
import { firstYearAverageBalance, firstYearInterest } from '../housing';
import type { FilingStatus, Household } from '../types';

/**
 * The interest deduction has a limit, and the engine ignored it.
 *
 * Only the interest attributable to the first $750,000 of a mortgage is
 * deductible — $375,000 filing separately — so a bigger loan at the same rate
 * deducts a smaller SHARE of what it costs. Every dollar of first-year interest
 * used to go straight into itemised deductions.
 *
 * In an expensive metro that was thousands of dollars of tax. On this site's
 * own default home price for San Jose, a single filer on $300,000 borrows
 * $1.30M and was deducting $88,197 of interest instead of about $50,756.
 *
 * IRC 163(h)(3)(F), as amended by OBBBA (PL 119-21), which made the $750,000
 * limit permanent. IRS Publication 936.
 */

const rules = federalRules();
const LIMIT = 750_000;
const SAN_JOSE = '41940';
const CHICAGO = '16980';
const AUSTIN = '12420';
const SINGLE: Household = { filingStatus: 'single', children: 0, earners: 1 };

describe('the acquisition debt limit', () => {
  it('leaves a loan under the limit completely alone', () => {
    for (const debt of [0, 100_000, 500_000, LIMIT]) {
      expect(deductibleMortgageInterest(40_000, debt, 'single', rules.mortgageInterest)).toBe(
        40_000,
      );
    }
  });

  it('deducts only the share of interest the limit reaches', () => {
    // Twice the limit borrowed, so half the interest counts.
    expect(
      deductibleMortgageInterest(80_000, LIMIT * 2, 'single', rules.mortgageInterest),
    ).toBeCloseTo(40_000, 6);
    expect(
      deductibleMortgageInterest(90_000, LIMIT * 3, 'single', rules.mortgageInterest),
    ).toBeCloseTo(30_000, 6);
  });

  it('halves the limit for a separate filer, as the statute does', () => {
    expect(rules.mortgageInterest!.acquisitionDebtLimit.marriedSeparately).toBe(LIMIT / 2);
    expect(rules.mortgageInterest!.acquisitionDebtLimit.marriedJointly).toBe(LIMIT);
    for (const status of ['single', 'marriedJointly', 'headOfHousehold'] as FilingStatus[]) {
      expect(rules.mortgageInterest!.acquisitionDebtLimit[status]).toBe(LIMIT);
    }
  });

  /*
   * A couple filing separately puts half the loan and half the interest on each
   * return, against half the limit. Two halves of a limit reach the same place
   * as one whole limit, which is exactly what the statute intends.
   */
  it('lands separate filers in the same place as joint filers', () => {
    const debt = 1_400_000;
    const interest = 95_000;
    const joint = deductibleMortgageInterest(interest, debt, 'marriedJointly', rules.mortgageInterest);
    const separate =
      2 *
      deductibleMortgageInterest(
        interest / 2,
        debt / 2,
        'marriedSeparately',
        rules.mortgageInterest,
      );
    expect(separate).toBeCloseTo(joint, 6);
  });

  it('does not divide by zero for a renter', () => {
    expect(deductibleMortgageInterest(0, 0, 'single', rules.mortgageInterest)).toBe(0);
  });

  it('deducts everything when the release predates the limit', () => {
    expect(deductibleMortgageInterest(88_000, 1_300_000, 'single', undefined)).toBe(88_000);
  });
});

describe('the reported San Jose case', () => {
  const inputs = defaultCityInputs(SAN_JOSE, 300_000, SINGLE, 'own');
  const housing = inputs.housing as Extract<typeof inputs.housing, { tenure: 'own' }>;
  const principal = housing.homePrice * (1 - housing.downPayment);

  it('borrows well over the limit on the site\'s own default home price', () => {
    expect(principal).toBeGreaterThan(1_200_000);
  });

  it('deducts roughly $50,756 of interest instead of $88,197', () => {
    const interest = firstYearInterest(principal, housing.mortgageRate);
    const debt = firstYearAverageBalance(principal, housing.mortgageRate);
    expect(interest).toBeGreaterThan(85_000);

    const deducted = deductibleMortgageInterest(interest, debt, 'single', rules.mortgageInterest);
    // Interest on $750,000 at this rate, whatever the loan actually is.
    expect(deducted).toBeGreaterThan(48_000);
    expect(deducted).toBeLessThan(53_000);
  });

  it('raises federal tax by about $10,000', () => {
    const interest = firstYearInterest(principal, housing.mortgageRate);
    const debt = firstYearAverageBalance(principal, housing.mortgageRate);
    const city = compare({
      datasetVersion: undefined as unknown as string,
      household: SINGLE,
      origin: inputs,
      destination: defaultCityInputs(AUSTIN, 300_000, SINGLE, 'own'),
    }).origin;

    const federal = (mortgageDebt: number | undefined) =>
      computeFederal(
        {
          grossSalary: 300_000,
          filingStatus: 'single',
          children: 0,
          stateAndLocalIncomeTax: city.tax.state + city.tax.local,
          propertyTax: city.housing.propertyTax,
          mortgageInterest: interest,
          mortgageDebt,
        },
        rules,
      ).tax;

    const understated = federal(debt) - federal(undefined);
    expect(understated).toBeGreaterThan(9_000);
    expect(understated).toBeLessThan(11_000);
  });
});

describe('who it actually touches', () => {
  const at = (metroId: string, salary: number) =>
    compare({
      datasetVersion: undefined as unknown as string,
      household: SINGLE,
      origin: defaultCityInputs(metroId, salary, SINGLE, 'own'),
      destination: defaultCityInputs(AUSTIN, salary, SINGLE, 'own'),
    }).origin;

  it('changes nothing for a normal home in a normal metro', () => {
    // Chicago's default home price stays far under the limit at every salary
    // this site is likely to see, so nothing about that answer moves.
    for (const salary of [100_000, 300_000, 500_000]) {
      expect(at(CHICAGO, salary).housing.mortgageDebt).toBeLessThan(750_000);
    }
  });

  it('bites in the expensive metros, which is where the homes are', () => {
    expect(at(SAN_JOSE, 300_000).housing.mortgageDebt).toBeGreaterThan(750_000);
  });

  it('never lets a renter near it', () => {
    const renting = compare({
      datasetVersion: undefined as unknown as string,
      household: SINGLE,
      origin: defaultCityInputs(SAN_JOSE, 300_000, SINGLE, 'rent'),
      destination: defaultCityInputs(AUSTIN, 300_000, SINGLE, 'rent'),
    }).origin;
    expect(renting.housing.mortgageDebt).toBe(0);
    expect(renting.housing.mortgageInterest).toBe(0);
  });
});

/*
 * PROJECT.md section 9.2. Links shared before this keep the uncapped deduction
 * rather than silently changing under whoever they were sent to.
 */
describe('links pinned to an older release', () => {
  it('still deducts every dollar of interest', () => {
    expect(federalRules('2026.8').mortgageInterest).toBeUndefined();
    const older = compare(
      {
        datasetVersion: '2026.8',
        household: SINGLE,
        origin: defaultCityInputs(SAN_JOSE, 300_000, SINGLE, 'own', 0.068, '2026.8'),
        destination: defaultCityInputs(AUSTIN, 300_000, SINGLE, 'own', 0.068, '2026.8'),
      },
      {},
    ).origin;
    const current = compare({
      datasetVersion: undefined as unknown as string,
      household: SINGLE,
      origin: defaultCityInputs(SAN_JOSE, 300_000, SINGLE, 'own'),
      destination: defaultCityInputs(AUSTIN, 300_000, SINGLE, 'own'),
    }).origin;
    expect(current.tax.federal - older.tax.federal).toBeGreaterThan(9_000);
  });
});
