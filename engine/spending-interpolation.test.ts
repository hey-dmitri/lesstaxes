import { describe, expect, it } from 'vitest';

import { compare } from './compare';
import {
  ALL_METRO_IDS,
  ALL_SPENDING_PROFILES,
  DATASET_VERSION,
  spendingProfile,
} from './dataset';
import type { CityInputs, ComparisonInputs } from './types';

/**
 * A $1 raise used to cost thousands.
 *
 * Spending was looked up by the FLOOR of the BLS income bracket, so the whole
 * national basket jumped the instant a salary crossed a published boundary.
 * Measured on the shipped model at the time:
 *
 *   $149,999 -> $150,000   Chicago leftover fell $8,300
 *   $199,999 -> $200,000   Chicago leftover fell $14,839
 *
 * The two cities sit at different price levels, so the jumps did not cancel
 * either: the same $1 edit moved the gap between them by $614 and $1,119. That
 * is enough to flip a verdict, and it made disposable income fall as pay rose.
 *
 * Every test here is about the SHAPE of the curve rather than any one number,
 * because the numbers move with each data vintage and the shape must not.
 */

const CHICAGO = '16980';
const AUSTIN = '12420';

const city = (
  metroId: string,
  stateCode: string | undefined,
  grossSalary: number,
): CityInputs => ({
  metroId,
  stateCode,
  grossSalary,
  cars: 1,
  housing: { tenure: 'rent', monthlyRent: 2_500 },
});

const at = (salary: number) =>
  compare({
    datasetVersion: DATASET_VERSION,
    household: { filingStatus: 'single', children: 0, earners: 1 },
    origin: city(CHICAGO, 'IL', salary),
    destination: city(AUSTIN, 'TX', salary),
  } satisfies ComparisonInputs);

/** Every published bracket boundary, which is where the cliffs used to be. */
const BOUNDARIES = [15_000, 30_000, 40_000, 50_000, 70_000, 100_000, 150_000, 200_000];

describe('a $1 raise', () => {
  it('never costs money at a bracket boundary', () => {
    for (const edge of BOUNDARIES) {
      const before = at(edge - 1);
      const after = at(edge);
      expect(after.origin.leftover).toBeGreaterThan(before.origin.leftover);
      // A dollar of pay cannot move leftover by more than a dollar.
      expect(after.origin.leftover - before.origin.leftover).toBeLessThan(1);
    }
  });

  it('barely moves the gap between the two cities at a boundary', () => {
    // This was $614 at $150,000 and $1,119 at $200,000.
    for (const edge of BOUNDARIES) {
      expect(Math.abs(at(edge).delta - at(edge - 1).delta)).toBeLessThan(1);
    }
  });
});

describe('the whole earnings range', () => {
  /*
   * Sampled rather than swept dollar by dollar — a full sweep is 380,000
   * comparisons and this runs on every commit. The samples straddle every
   * boundary and every bracket mean, which is where any discontinuity would
   * have to live.
   */
  const sampled = new Set<number>();
  for (let s = 20_000; s <= 400_000; s += 2_500) sampled.add(s);
  for (const edge of BOUNDARIES) [edge - 1, edge, edge + 1].forEach((s) => sampled.add(s));
  for (const p of ALL_SPENDING_PROFILES) {
    if (p.meanIncome) [p.meanIncome - 1, p.meanIncome, p.meanIncome + 1].forEach((s) => sampled.add(s));
  }
  const salaries = [...sampled].sort((a, b) => a - b);

  it('leaves more in your pocket the more you earn, everywhere', () => {
    let previous = at(salaries[0]);
    for (const salary of salaries.slice(1)) {
      const current = at(salary);
      expect(current.origin.leftover).toBeGreaterThan(previous.origin.leftover);
      previous = current;
    }
  });

  it('never gives back more than the raise itself', () => {
    let previous = at(salaries[0]);
    for (const salary of salaries.slice(1)) {
      const current = at(salary);
      const raise = salary - previous.origin.grossSalary;
      expect(current.origin.leftover - previous.origin.leftover).toBeLessThanOrEqual(raise + 1e-6);
      previous = current;
    }
  });
});

/*
 * The boundaries again, but across the country rather than in one metro. Price
 * parity multiplies the basket, so a cliff that is $8,300 in Chicago is bigger
 * somewhere expensive and smaller somewhere cheap — and it is the DIFFERENCE
 * between two places that decides the verdict.
 *
 * Housing is held fixed on purpose, the way the report that found this did.
 * The suggested rent is rounded to whole dollars, so it ticks over by $1 a
 * month somewhere in every metro; that is $12 a year of prefill rounding and
 * it would drown the thing being measured here.
 */
describe('every kind of place', () => {
  const SAMPLE = ALL_METRO_IDS.filter((_, i) => i % 11 === 0);

  it('has no cliff at any boundary, in any metro', () => {
    let worst = 0;
    let worstWhere = '';
    for (const metroId of SAMPLE) {
      for (const edge of BOUNDARIES) {
        const run = (salary: number) =>
          compare({
            datasetVersion: DATASET_VERSION,
            household: { filingStatus: 'marriedJointly', children: 2, earners: 2 },
            origin: city(metroId, undefined, salary),
            destination: city(AUSTIN, 'TX', salary),
          });
        const step = run(edge).origin.leftover - run(edge - 1).origin.leftover;
        expect(step).toBeGreaterThan(-1e-6);
        if (Math.abs(step) > worst) {
          worst = Math.abs(step);
          worstWhere = `${metroId} at $${edge}`;
        }
      }
    }
    /*
     * The bug's signature was a $1 raise moving leftover by thousands —
     * $14,839 at its worst. A few dollars is legitimate and expected: down at
     * $15,000 with two children the Earned Income Credit is phasing IN at 40
     * cents on the dollar, so a dollar of pay really can be worth more than a
     * dollar in your pocket. That is the law, not a discontinuity.
     */
    expect(worst, `worst step was at ${worstWhere}`).toBeLessThan(3);
  });
});

describe('the interpolation itself', () => {
  it('anchors each published bracket at its own mean income', () => {
    for (const p of ALL_SPENDING_PROFILES) {
      expect(p.meanIncome).toBeGreaterThanOrEqual(p.incomeFloor);
      const exact = spendingProfile(p.meanIncome!);
      expect(exact.livingTotal).toBeCloseTo(p.livingTotal, 6);
      expect(exact.averageHouseholdSize).toBeCloseTo(p.averageHouseholdSize, 6);
    }
  });

  it('never shrinks the basket as income rises', () => {
    let previous = spendingProfile(0);
    for (let income = 500; income <= 500_000; income += 500) {
      const current = spendingProfile(income);
      expect(current.livingTotal).toBeGreaterThanOrEqual(previous.livingTotal - 1e-9);
      previous = current;
    }
  });

  /*
   * Individual categories DO dip, and that is the survey talking, not a bug
   * here. "Other services" is higher for the poorest bracket than the next one
   * up — it carries education and cash contributions, and the bottom bracket
   * holds students and retirees whose spending does not track their income.
   * Food dips very slightly between $34,984 and $44,824 too.
   *
   * Interpolation reproduces the published points faithfully, dips included.
   * Smoothing those away would be inventing data. What must never dip is the
   * total, and the test above pins that.
   */
  it('reproduces the published dips rather than smoothing them away', () => {
    const poorest = ALL_SPENDING_PROFILES[0];
    const nextUp = ALL_SPENDING_PROFILES[1];
    expect(nextUp.categories.otherServices).toBeLessThan(poorest.categories.otherServices);
    expect(spendingProfile(nextUp.meanIncome!).categories.otherServices).toBeLessThan(
      spendingProfile(poorest.meanIncome!).categories.otherServices,
    );
  });

  /*
   * The top bracket is open-ended and its mean income is $322,142 — nothing
   * like its $200,000 floor. Anchoring it at the floor was what made the
   * $200,000 cliff the worst one on the page.
   */
  it('anchors the open top bracket well above its floor', () => {
    const top = ALL_SPENDING_PROFILES.at(-1)!;
    expect(top.incomeFloor).toBe(200_000);
    expect(top.meanIncome).toBeGreaterThan(300_000);
  });

  it('holds flat past the ends rather than extrapolating', () => {
    const top = ALL_SPENDING_PROFILES.at(-1)!;
    expect(spendingProfile(5_000_000).livingTotal).toBeCloseTo(top.livingTotal, 6);
    const bottom = ALL_SPENDING_PROFILES[0];
    expect(spendingProfile(0).livingTotal).toBeCloseTo(bottom.livingTotal, 6);
  });
});

/*
 * PROJECT.md section 9.2: a shared link recomputes against the model it was
 * made with, not only the data. Releases cut before this carry no mean income
 * and must keep stepping, or every link already in the wild silently changes.
 */
describe('links pinned to an older release', () => {
  it('still steps by bracket floor', () => {
    expect(spendingProfile(149_999, '2026.5').bracket).toBe('$100,000 to $149,999');
    expect(spendingProfile(150_000, '2026.5').bracket).toBe('$150,000 to $199,999');
  });

  it('and the current release does not', () => {
    expect(spendingProfile(150_000).bracket).toContain(' to ');
    expect(spendingProfile(149_999).bracket).toBe(spendingProfile(150_000).bracket);
  });
});
