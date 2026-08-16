import { describe, expect, it } from 'vitest';

import { defaultMortgageRate, mortgageRateSource } from './dataset';
import { computeHousing, firstYearInterest, monthlyMortgagePayment } from './housing';

describe('monthlyMortgagePayment', () => {
  it('matches a hand-checked standard case', () => {
    // $358,400 at 6.8% over 30 years.
    expect(monthlyMortgagePayment(358_400, 0.068)).toBeCloseTo(2336.0, 0);
  });

  it('handles a zero interest rate without dividing by zero', () => {
    expect(monthlyMortgagePayment(360_000, 0, 30)).toBeCloseTo(1_000, 6);
  });

  it('is zero for no principal', () => {
    expect(monthlyMortgagePayment(0, 0.068)).toBe(0);
  });

  it('rises with the rate and falls with the term', () => {
    expect(monthlyMortgagePayment(400_000, 0.08)).toBeGreaterThan(monthlyMortgagePayment(400_000, 0.05));
    expect(monthlyMortgagePayment(400_000, 0.068, 15)).toBeGreaterThan(
      monthlyMortgagePayment(400_000, 0.068, 30),
    );
  });

  it('never repays less than the principal over the full term', () => {
    const total = monthlyMortgagePayment(300_000, 0.06) * 12 * 30;
    expect(total).toBeGreaterThan(300_000);
  });
});

describe('firstYearInterest', () => {
  it('is slightly below principal x rate, because the balance falls', () => {
    const naive = 358_400 * 0.068;
    const actual = firstYearInterest(358_400, 0.068);
    expect(actual).toBeLessThan(naive);
    expect(actual).toBeGreaterThan(naive * 0.97);
  });

  it('is zero at a zero rate', () => {
    expect(firstYearInterest(300_000, 0)).toBe(0);
  });

  it('is less than the total first-year payments', () => {
    const payments = monthlyMortgagePayment(358_400, 0.068) * 12;
    expect(firstYearInterest(358_400, 0.068)).toBeLessThan(payments);
  });
});

describe('computeHousing — renting', () => {
  const rent = { tenure: 'rent' as const, monthlyRent: 1_430 };

  it('annualises the rent', () => {
    const r = computeHousing({ housing: rent });
    expect(r.shelter).toBeCloseTo(17_160, 6);
    expect(r.total).toBeCloseTo(17_160, 6);
  });

  it('has no property tax and no mortgage interest', () => {
    const r = computeHousing({ housing: rent });
    expect(r.propertyTax).toBe(0);
    expect(r.mortgageInterest).toBe(0);
  });

  it('adds renters insurance when supplied', () => {
    const r = computeHousing({ housing: rent, annualInsurance: 240 });
    expect(r.total).toBeCloseTo(17_400, 6);
  });
});

describe('computeHousing — owning', () => {
  const own = {
    tenure: 'own' as const,
    homePrice: 465_000,
    downPayment: 0.2,
    mortgageRate: 0.068,
    propertyTaxRate: 0.0154,
  };

  it('includes principal in the outflow (PROJECT.md D25)', () => {
    const r = computeHousing({ housing: own });
    // Full payment, not interest only.
    expect(r.shelter).toBeGreaterThan(r.mortgageInterest);
  });

  it('computes property tax on the full home price', () => {
    const r = computeHousing({ housing: own });
    expect(r.propertyTax).toBeCloseTo(465_000 * 0.0154, 6);
  });

  it('reports first-year interest for the itemisation test', () => {
    const r = computeHousing({ housing: own });
    expect(r.mortgageInterest).toBeGreaterThan(20_000);
    expect(r.mortgageInterest).toBeLessThan(26_000);
  });

  it('totals its own components', () => {
    const r = computeHousing({ housing: own, annualInsurance: 1_800 });
    expect(r.total).toBeCloseTo(r.shelter + r.propertyTax + r.insurance, 6);
  });

  it('a full cash purchase has no mortgage cost but still owes property tax', () => {
    const r = computeHousing({ housing: { ...own, downPayment: 1 } });
    expect(r.shelter).toBe(0);
    expect(r.mortgageInterest).toBe(0);
    expect(r.propertyTax).toBeGreaterThan(0);
  });

  it('a larger down payment lowers the annual outflow', () => {
    const small = computeHousing({ housing: { ...own, downPayment: 0.05 } });
    const large = computeHousing({ housing: { ...own, downPayment: 0.5 } });
    expect(large.total).toBeLessThan(small.total);
  });
});

/**
 * THE MORTGAGE RATE WAS THE ONE FIGURE ON THIS SITE WITH NO SOURCE.
 *
 * A hard-coded 6.8%, sitting in front of the mortgage payment, the interest
 * deduction and — through that deduction — the federal bill. It is Freddie
 * Mac's weekly national average for a 30-year fixed loan now, averaged over
 * the most recent complete quarter, and it refreshes with everything else.
 */
describe('the mortgage rate the field opens on', () => {
  it('is the published quarter average, not a round number somebody typed', () => {
    const published = mortgageRateSource();
    expect(published).not.toBeNull();
    expect(defaultMortgageRate()).toBe(published!.rate);
    // A quarter holds twelve or thirteen weekly prints; fewer means a
    // part-quarter was averaged and published as a whole one.
    expect(published!.weeks).toBeGreaterThanOrEqual(11);
    expect(published!.quarter).toMatch(/^20\d\d Q[1-4]$/);
  });

  it('is a plausible rate, so a parsing slip cannot ship', () => {
    const rate = defaultMortgageRate();
    expect(rate).toBeGreaterThan(0.02);
    expect(rate).toBeLessThan(0.2);
  });

  /*
   * Releases cut before the series shipped have no rate in them, and a pinned
   * link has to keep answering with the flat figure it was built on.
   */
  it('falls back to the old flat figure on older releases', () => {
    for (const version of ['2026.26', '2026.27', '2026.28']) {
      expect(mortgageRateSource(version), version).toBeNull();
      expect(defaultMortgageRate(version), version).toBe(0.068);
    }
  });
});
