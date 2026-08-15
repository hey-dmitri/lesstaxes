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

  /*
   * This asserted the opposite until the community-property rule landed, and it
   * asserted it in AUSTIN — which is in Texas, one of the nine states where a
   * sole earner filing separately splits the income anyway. The test was
   * pinning the bug rather than catching it.
   *
   * Chicago is the control: Illinois is not a community property state, so one
   * earner filing separately really does put the whole salary on one return.
   */
  it('does not split a one-earner separate filer outside a community property state', () => {
    const chicago = { ...city, metroId: '16980', stateCode: 'IL' };
    const one = computeCity(chicago, household('marriedSeparately', 1));
    const two = computeCity(chicago, household('marriedSeparately', 2));
    expect(one.tax.federal).toBeGreaterThan(two.tax.federal);
  });

  it('splits a one-earner separate filer in Texas, because Texas says so', () => {
    const one = computeCity(city, household('marriedSeparately', 1));
    const two = computeCity(city, household('marriedSeparately', 2));
    // Same income tax either way now: the income halves regardless of who
    // earned it. What differs is payroll tax, which follows the earner — and
    // it is the SOLE earner who pays LESS, because one person on $300,000 hits
    // the Social Security cap once and stops, while two on $150,000 each stay
    // under it and pay on every dollar. That asymmetry is the whole reason the
    // wages cannot simply be halved along with the income.
    expect(one.tax.federal).toBeCloseTo(two.tax.federal, 6);
    expect(one.tax.fica).toBeLessThan(two.tax.fica);
  });
});

/**
 * COMMUNITY PROPERTY. Nine states — Arizona, California, Idaho, Louisiana,
 * Nevada, New Mexico, Texas, Washington and Wisconsin — say a couple filing
 * separately each report half the combined wages, whoever earned them.
 *
 * IRS Publication 555: "A spouse's wages, earnings, and net profits from a sole
 * proprietorship are community income and must be evenly split."
 *
 * This engine split a couple's income when BOTH earned and treated one earner
 * filing separately as a single return on the whole salary. Right in the other
 * 41 states. In Texas at $150,000 it overstated federal tax by $9,394.
 */
describe('community property', () => {
  const CP = { communityProperty: true };

  it('splits a sole earner, which nothing else does', () => {
    const plain = taxReturnsFor(household('marriedSeparately', 1), 150_000);
    const texas = taxReturnsFor(household('marriedSeparately', 1), 150_000, CP);
    expect(plain).toHaveLength(1);
    expect(texas).toHaveLength(2);
    expect(texas.map((r) => r.grossSalary)).toEqual([75_000, 75_000]);
  });

  /*
   * The reported figure, to the dollar. This is the same arithmetic as the
   * two-earner case at the top of this file — which is the point. The rule was
   * already implemented; it was only ever reached when both spouses earned.
   */
  it('bills the reported Texas case as two $75,000 returns', () => {
    const split = taxReturnsFor(household('marriedSeparately', 1), 150_000, CP).reduce(
      (sum, r) => sum + federalOn(r.grossSalary, 'marriedSeparately'),
      0,
    );
    expect(federalOn(150_000, 'marriedSeparately') - split).toBeCloseTo(9_394, 0);
  });

  /*
   * THE PART THAT CANNOT BE FAKED BY PRETENDING THERE ARE TWO EARNERS.
   * Publication 555 puts self-employment tax on the spouse carrying on the
   * business, and Social Security and Medicare follow the same logic: they are
   * levied on whoever did the work, not on whoever reports the income.
   */
  it('leaves the wages with whoever earned them', () => {
    const [first, second] = taxReturnsFor(household('marriedSeparately', 1), 150_000, CP);
    expect(first.grossSalary).toBe(75_000);
    expect(first.wagesEarned).toBe(150_000);
    expect(second.grossSalary).toBe(75_000);
    expect(second.wagesEarned).toBe(0);
    // The wages are never conjured or lost, whatever the income does.
    expect(first.wagesEarned + second.wagesEarned).toBe(150_000);
  });

  it('halves the wages too when both of them really earn', () => {
    const [first, second] = taxReturnsFor(household('marriedSeparately', 2), 150_000, CP);
    expect(first.wagesEarned).toBe(75_000);
    expect(second.wagesEarned).toBe(75_000);
  });

  it('leaves every other filing status alone', () => {
    for (const status of ['single', 'marriedJointly', 'headOfHousehold'] as FilingStatus[]) {
      const returns = taxReturnsFor(household(status, 1), 150_000, CP);
      expect(returns).toHaveLength(1);
      expect(returns[0].grossSalary).toBe(150_000);
      expect(returns[0].wagesEarned).toBe(150_000);
    }
  });
});
