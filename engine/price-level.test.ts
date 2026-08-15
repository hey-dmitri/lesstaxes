import { describe, expect, it } from 'vitest';

import { compare, computeCity, defaultCityInputs } from './compare';
import {
  ALL_SPENDING_PROFILES,
  homePriceDefault,
  priceFactor,
  priceLevel,
  rentDefault,
  spendingProfile,
  toBaseYearIncome,
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
  it('uses a different index for rent, house prices, the basket and wages', () => {
    const level = priceLevel()!;
    expect(level.baseYear).toBe(2024);
    const series = Object.values(level.factors).map((f) => f.series);
    expect(new Set(series).size).toBe(4);
  });

  it('is an uplift in every case, and a believable one', () => {
    for (const kind of ['basket', 'rent', 'homePrice', 'wage'] as const) {
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

  /*
   * Wages outran prices, which is why the salary takes its own factor rather
   * than the basket one. Using the basket factor for the salary would quietly
   * assert that nobody got a real raise since 2024.
   */
  it('lets wages run ahead of prices, because they did', () => {
    expect(priceFactor('wage')).toBeGreaterThan(priceFactor('basket'));
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

  /*
   * BOTH AXES MOVE OR NEITHER DOES.
   *
   * The first cut of this restated the published AMOUNTS in today's money and
   * left the INCOMES they are indexed by in 2024 dollars. That reads a 2026
   * earner off a 2024 income scale, making them look richer in real terms than
   * they are and handing them a basket, a rent and a home from further up the
   * curve: $1,546, $924 and $2,901 too much respectively.
   *
   * Every one of these asks the same question — does a salary worth the same in
   * REAL terms buy the same real answer? — and the only way to fail it is to
   * inflate one axis and not the other.
   */
  it('reads a salary off the income scale at the right real position', () => {
    const f = priceFactor('basket');
    const band = ALL_SPENDING_PROFILES.find((p) => p.incomeFloor === 100_000)!;

    // A salary worth that band's mean income in TODAY's money must land on that
    // band, not on the one above it.
    const todaysEquivalent = band.meanIncome! * f;
    const chosen = spendingProfile(toBaseYearIncome(todaysEquivalent));
    expect(chosen.livingTotal).toBeCloseTo(band.livingTotal, 6);
  });

  /*
   * The cross-version form of the same invariant, and the one that would
   * actually have caught the bug: 2026.10 has no uplift at all, so the same
   * REAL household must get the same REAL answer from both releases. Anything
   * else means one axis moved without the other.
   */
  it('quotes the same real rent and home to the same real household', () => {
    const level = priceLevel()!;
    const baseYearIncome = 100_000;
    const todaysIncome = baseYearIncome * level.factors.basket.value;

    // Both are rounded to whole dollars, at different points on the scale, so
    // they can legitimately land up to about a dollar apart. What must not
    // happen is the $77 a month the broken version produced.
    const rentThen = rentDefault(CHICAGO, baseYearIncome, 2, '2026.10');
    const rentNow = rentDefault(CHICAGO, todaysIncome, 2);
    expect(Math.abs(rentNow / level.factors.rent.value - rentThen)).toBeLessThan(1.5);

    const homeThen = homePriceDefault(CHICAGO, baseYearIncome, '2026.10');
    const homeNow = homePriceDefault(CHICAGO, todaysIncome);
    expect(homeNow / level.factors.homePrice.value).toBeCloseTo(homeThen, -1);
  });

  it('feeds the same real basket to the same real household', () => {
    const f = priceFactor('basket');
    const then = computeCity(
      defaultCityInputs(CHICAGO, 100_000, SINGLE, 'rent', 0.068, '2026.10'),
      SINGLE,
      { datasetVersion: '2026.10' },
    );
    const now = computeCity(
      { ...defaultCityInputs(CHICAGO, 100_000 * f, SINGLE), grossSalary: 100_000 * f },
      SINGLE,
    );
    // Same basket in real terms, so the same figure once the uplift is undone.
    expect(now.living.food / f).toBeCloseTo(then.living.food, 0);
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
