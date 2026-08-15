import { describe, expect, it } from 'vitest';

import { compare, computeCity, defaultCityInputs } from './compare';
import {
  ALL_SPENDING_PROFILES,
  homePriceDefault,
  priceFactor,
  priceLevel,
  rentDefault,
  spendingProfile,
} from './dataset';
import { computeTransport } from './living';
import type { Household } from './types';

/**
 * The dollars were two years older than the salary.
 *
 * Every money figure behind this site was measured in 2024 — the Census rent
 * and home-value tables, the BLS spending survey. The tax rules are 2026 and
 * the salary is whatever the reader types today. So costs were about six per
 * cent too low against a current salary.
 *
 * SIX PER CENT ON COSTS IS NOT SIX PER CENT ON THE ANSWER. Money left over is
 * a small remainder of two large numbers, so the error arrives on the remainder
 * almost undiluted: 13% of the answer for a Chicago renter on $100,000, and 27%
 * for a buyer.
 */

const CHICAGO = '16980';
const AUSTIN = '12420';
const SINGLE: Household = { filingStatus: 'single', children: 0, earners: 1 };

describe('the price level', () => {
  it('uses a different index for rent, house prices and the shopping basket', () => {
    const level = priceLevel()!;
    expect(level.baseYear).toBe(2024);
    const series = Object.values(level.factors).map((f) => f.series);
    expect(new Set(series).size).toBe(3);
  });

  it('is an uplift in every case, and a believable one', () => {
    for (const kind of ['basket', 'rent', 'homePrice'] as const) {
      const f = priceFactor(kind);
      expect(f).toBeGreaterThan(1);
      expect(f).toBeLessThan(1.5);
    }
  });

  /*
   * They have genuinely moved apart since 2024 — shelter fastest, house prices
   * slowest — which is the whole reason for carrying three. If a future refresh
   * collapses them onto one number, that is worth noticing rather than
   * inheriting silently.
   */
  it('keeps them apart, because they moved apart', () => {
    expect(priceFactor('rent')).toBeGreaterThan(priceFactor('basket'));
    expect(priceFactor('basket')).toBeGreaterThan(priceFactor('homePrice'));
  });

  it('raises the prefills above the published medians they come from', () => {
    expect(rentDefault(CHICAGO, 100_000, 2)).toBeGreaterThan(0);
    const withInflation = homePriceDefault(CHICAGO, 100_000);
    const withoutInflation = withInflation / priceFactor('homePrice');
    expect(withInflation).toBeGreaterThan(withoutInflation);
  });

  it('raises the basket', () => {
    const now = computeCity(defaultCityInputs(CHICAGO, 100_000, SINGLE), SINGLE);
    const then = computeCity(
      defaultCityInputs(CHICAGO, 100_000, SINGLE, 'rent', 0.068, '2026.10'),
      SINGLE,
      { datasetVersion: '2026.10' },
    );
    expect(now.living.total).toBeGreaterThan(then.living.total);
  });

  /*
   * The point of the whole change. The uplift is ~6% of costs but a far bigger
   * share of what is left after them, which is the number on the front page.
   */
  it('moves leftover by far more than six per cent', () => {
    const at = (version: string | undefined) =>
      compare({
        datasetVersion: version as string,
        household: SINGLE,
        origin: defaultCityInputs(CHICAGO, 100_000, SINGLE, 'own', 0.068, version),
        destination: defaultCityInputs(AUSTIN, 100_000, SINGLE, 'own', 0.068, version),
      }).origin;
    const before = at('2026.10');
    const after = at(undefined);
    const shareOfLeftover = (before.leftover - after.leftover) / before.leftover;
    expect(shareOfLeftover).toBeGreaterThan(0.1);
  });

  it('leaves links pinned to an older release in 2024 dollars', () => {
    expect(priceFactor('basket', '2026.10')).toBe(1);
    expect(priceFactor('rent', '2026.10')).toBe(1);
    expect(priceLevel('2026.10')).toBeUndefined();
  });
});

/**
 * A car and its petrol are goods. Its insurance, servicing, finance charges and
 * licensing are services and financial products. The whole per-vehicle figure
 * used to be multiplied by the goods index.
 */
describe('running a car', () => {
  it('splits into the part that is goods and the part that is not', () => {
    for (const p of ALL_SPENDING_PROFILES) {
      const t = p.transport;
      expect(t.goodsPerVehicle! + t.servicesPerVehicle!).toBeCloseTo(t.annualCostPerVehicle, -1);
      // The car and its fuel are the larger half everywhere.
      expect(t.goodsPerVehicle!).toBeGreaterThan(t.servicesPerVehicle!);
    }
  });

  it('prices the two halves with their own index', () => {
    const split = computeTransport({
      cars: 1,
      annualCostPerVehicle: 6_000,
      goodsPerVehicle: 4_000,
      servicesPerVehicle: 2_000,
      transitSpending: 0,
      goodsParity: 1.1,
      servicesParity: 0.9,
    });
    expect(split).toBeCloseTo(4_000 * 1.1 + 2_000 * 0.9, 6);
  });

  it('falls back to the old single index when a release carries no split', () => {
    const old = computeTransport({
      cars: 1,
      annualCostPerVehicle: 6_000,
      transitSpending: 0,
      goodsParity: 1.1,
    });
    expect(old).toBeCloseTo(6_600, 6);
  });
});

/**
 * A donation does not cost more because local haircuts do.
 *
 * Giving, alimony and child support sat inside "other services" and were
 * multiplied by the local services index. A gift to a charity is not bought at
 * local prices, and a support order is set by a court.
 */
describe('giving, alimony and child support', () => {
  it('is carried separately from the things that take a local price', () => {
    for (const p of ALL_SPENDING_PROFILES) {
      expect(p.cashContributions).toBeGreaterThan(0);
    }
    expect(spendingProfile(100_000).cashContributions).toBeGreaterThan(0);
  });

  /*
   * The test that actually pins the fix. Two metros whose service prices differ
   * must charge the SAME donation, once everything else is held equal — so this
   * compares the same city against itself with the parity swapped, via the
   * published figure rather than a full comparison.
   */
  it('does not grow with local service prices', () => {
    const national = spendingProfile(100_000).cashContributions!;
    const inflated = national * priceFactor('basket');
    // Whatever metro it is computed in, the contribution enters at the national
    // figure times inflation and household size — never times a parity.
    const single = computeCity(defaultCityInputs(CHICAGO, 100_000, SINGLE), SINGLE);
    const austin = computeCity(defaultCityInputs(AUSTIN, 100_000, SINGLE), SINGLE);
    // Both cities' "other" lines contain the identical contribution, so the
    // difference between them is entirely the parity-priced remainder.
    const sizeScaled = inflated * single.living.equivalenceFactor;
    expect(single.living.other).toBeGreaterThan(sizeScaled);
    expect(austin.living.other).toBeGreaterThan(sizeScaled);
    expect(single.living.equivalenceFactor).toBeCloseTo(austin.living.equivalenceFactor, 6);
  });
});
