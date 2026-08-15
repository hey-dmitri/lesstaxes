import { describe, expect, it } from 'vitest';

import { taxReturnsFor } from './returns';
import { computeFederal } from './federal';
import { federalRules, ficaRules } from './rules';
import { computeFica } from './fica';
import { computeCity } from '../compare';
import type { FilingStatus, Household } from '../types';

const AUSTIN = '12420';

const household = (filingStatus: FilingStatus, earners: number, children = 0): Household => ({
  filingStatus,
  children,
  earners,
});

// ---------------------------------------------------------------------------
// The split itself
// ---------------------------------------------------------------------------

describe('how many returns a household files', () => {
  it('files one for every status that files one', () => {
    for (const status of ['single', 'marriedJointly', 'headOfHousehold'] as FilingStatus[]) {
      for (const earners of [1, 2]) {
        const returns = taxReturnsFor(household(status, earners), 150_000);
        expect(returns).toHaveLength(1);
        expect(returns[0].grossSalary).toBe(150_000);
        expect(returns[0].earners).toBe(earners);
      }
    }
  });

  it('files two when a couple files separately and both earn', () => {
    const returns = taxReturnsFor(household('marriedSeparately', 2), 150_000);
    expect(returns).toHaveLength(2);
    expect(returns.map((r) => r.grossSalary)).toEqual([75_000, 75_000]);
    // One worker per return, so each gets its own Social Security wage base.
    expect(returns.every((r) => r.earners === 1)).toBe(true);
    // The deductible housing costs are allocated in full, never more.
    expect(returns.reduce((sum, r) => sum + r.deductionShare, 0)).toBe(1);
  });

  it('files one when only one of the two separate filers earns', () => {
    // A single earner filing separately really does put the whole salary on one
    // return. This is the case the old model was accidentally right about.
    const returns = taxReturnsFor(household('marriedSeparately', 1), 150_000);
    expect(returns).toHaveLength(1);
    expect(returns[0].grossSalary).toBe(150_000);
  });

  it('claims each child exactly once', () => {
    const returns = taxReturnsFor(household('marriedSeparately', 2, 3), 150_000);
    expect(returns.reduce((sum, r) => sum + r.children, 0)).toBe(3);
    // Not halved — a child is claimed by one parent or the other.
    expect(returns.map((r) => r.children)).toEqual([3, 0]);
  });
});

// ---------------------------------------------------------------------------
// The money
// ---------------------------------------------------------------------------

const rules = federalRules();

const federalOn = (salary: number, filingStatus: FilingStatus) =>
  computeFederal(
    {
      grossSalary: salary,
      filingStatus,
      children: 0,
      stateAndLocalIncomeTax: 0,
      propertyTax: 0,
      mortgageInterest: 0,
    },
    rules,
  ).tax;

/*
 * The reported bug, to the dollar. The engine ran a couple's combined salary
 * once through the married-filing-separately schedule, whose brackets and
 * standard deduction are each half the joint ones. Two people filing two
 * returns were billed as though one person had earned all of it on half a
 * schedule.
 */
describe('married filing separately, both earning', () => {
  const cases = [
    { combined: 150_000, wasOverstatedBy: 9_394 },
    { combined: 300_000, wasOverstatedBy: 18_666 },
  ];

  for (const { combined, wasOverstatedBy } of cases) {
    it(`bills two returns, not one doubled, at $${combined.toLocaleString()}`, () => {
      const oneReturnOnEverything = federalOn(combined, 'marriedSeparately');
      const twoRealReturns = 2 * federalOn(combined / 2, 'marriedSeparately');

      // The bug, still reproducible from the raw schedule.
      expect(oneReturnOnEverything - twoRealReturns).toBeCloseTo(wasOverstatedBy, 0);

      // What the engine now charges.
      const modelled = taxReturnsFor(household('marriedSeparately', 2), combined)
        .reduce((sum, r) => sum + federalOn(r.grossSalary, 'marriedSeparately'), 0);
      expect(modelled).toBeCloseTo(twoRealReturns, 6);
    });
  }

  /*
   * Two equal earners filing separately owe almost exactly what they would owe
   * jointly, because the separate schedule is the joint one halved. That the
   * two now agree is the strongest single check that the split is right.
   */
  it('lands within a hair of filing jointly on the same income', () => {
    for (const combined of [80_000, 150_000, 300_000]) {
      const separately = 2 * federalOn(combined / 2, 'marriedSeparately');
      expect(separately).toBeCloseTo(federalOn(combined, 'marriedJointly'), 6);
    }
  });

  /*
   * The Additional Medicare threshold is a per-RETURN figure, and the separate
   * threshold ($125,000) is deliberately half the joint one. Charging it once
   * against a couple's combined wages overstated it too.
   */
  it('gives each return its own Additional Medicare threshold', () => {
    const payroll = ficaRules();
    const combined = 300_000;
    const asOneReturn = computeFica(combined, 'marriedSeparately', payroll, 2).additionalMedicare;
    const asTwo = taxReturnsFor(household('marriedSeparately', 2), combined).reduce(
      (sum, r) => sum + computeFica(r.grossSalary, 'marriedSeparately', payroll, r.earners).additionalMedicare,
      0,
    );
    expect(asOneReturn).toBeGreaterThan(asTwo);
    // $150,000 each, $25,000 over the threshold apiece, at 0.9%.
    expect(asTwo).toBeCloseTo(2 * 25_000 * payroll.additionalMedicareRate, 6);
  });
});

// ---------------------------------------------------------------------------
// End to end
// ---------------------------------------------------------------------------

describe('the whole city calculation', () => {
  const city = {
    metroId: AUSTIN,
    grossSalary: 300_000,
    cars: 1,
    housing: { tenure: 'rent', monthlyRent: 2_500 } as const,
  };

  it('leaves a separately-filing couple better off than it used to', () => {
    // Texas has no income tax, so this isolates the federal and payroll fix.
    const separately = computeCity(city, household('marriedSeparately', 2));
    const jointly = computeCity(city, household('marriedJointly', 2));

    expect(separately.tax.federal).toBeCloseTo(jointly.tax.federal, 0);
    expect(separately.tax.fica).toBeCloseTo(jointly.tax.fica, 6);
    // Same two people, same home, same city: the paperwork should not move the
    // living costs either.
    expect(separately.living.total).toBeCloseTo(jointly.living.total, 6);
    expect(separately.leftover).toBeCloseTo(jointly.leftover, 0);
  });

  it('still charges a single filer more than a couple on the same salary', () => {
    const single = computeCity(city, household('single', 1));
    const separately = computeCity(city, household('marriedSeparately', 2));
    expect(single.tax.federal).toBeGreaterThan(separately.tax.federal);
  });

  it('does not split anything for a one-earner separate filer', () => {
    const one = computeCity(city, household('marriedSeparately', 1));
    const two = computeCity(city, household('marriedSeparately', 2));
    expect(one.tax.federal).toBeGreaterThan(two.tax.federal);
  });
});
