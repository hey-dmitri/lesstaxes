import { describe, expect, it } from 'vitest';

import { compare, defaultCityInputs, defaultRent } from './compare';
import {
  ALL_METRO_IDS,
  bedroomsFor,
  housingDefaults,
  INCOME_RENT_CURVE,
  rentDefault,
  rentFactorForIncome,
} from './dataset';
import type { Household } from './types';

const CHICAGO = '16980';
const AUSTIN = '12420';

const single: Household = { filingStatus: 'single', children: 0 };
const couple: Household = { filingStatus: 'marriedJointly', children: 0 };
const family: Household = { filingStatus: 'marriedJointly', children: 2 };
const bigFamily: Household = { filingStatus: 'marriedJointly', children: 5 };

describe('bedrooms from household', () => {
  it('gives one bedroom to a single person and to a couple', () => {
    expect(bedroomsFor(1, 0)).toBe(1);
    expect(bedroomsFor(2, 0)).toBe(1);
  });

  it('adds a bedroom for every two children', () => {
    expect(bedroomsFor(2, 1)).toBe(2);
    expect(bedroomsFor(2, 2)).toBe(2);
    expect(bedroomsFor(2, 3)).toBe(3);
    expect(bedroomsFor(2, 4)).toBe(3);
  });

  it('never exceeds the largest size the Census publishes', () => {
    expect(bedroomsFor(2, 20)).toBe(5);
  });
});

describe('income curve', () => {
  it('rises with income everywhere', () => {
    let previous = 0;
    for (let income = 5_000; income <= 500_000; income += 2_500) {
      const factor = rentFactorForIncome(income);
      expect(factor).toBeGreaterThanOrEqual(previous);
      previous = factor;
    }
  });

  it('rises more slowly than income does', () => {
    // Housing takes a falling share of income as income rises. If the factor
    // ever went super-linear, a high earner would be quoted absurd rent.
    const low = rentFactorForIncome(50_000);
    const high = rentFactorForIncome(200_000);
    const elasticity = Math.log(high / low) / Math.log(200_000 / 50_000);
    expect(elasticity).toBeGreaterThan(0);
    expect(elasticity).toBeLessThan(1);
  });

  it('crosses 1.0 near the typical renter income, not near zero', () => {
    expect(rentFactorForIncome(30_000)).toBeLessThan(1);
    expect(rentFactorForIncome(90_000)).toBeGreaterThan(1);
  });

  it('is flat below the lowest published point rather than collapsing', () => {
    expect(rentFactorForIncome(1)).toBe(INCOME_RENT_CURVE.points[0].factor);
    expect(rentFactorForIncome(500)).toBe(INCOME_RENT_CURVE.points[0].factor);
  });

  it('keeps extrapolating above the highest published point', () => {
    const top = INCOME_RENT_CURVE.points[INCOME_RENT_CURVE.points.length - 1];
    expect(rentFactorForIncome(400_000)).toBeGreaterThan(top.factor);
  });
});

describe('rent prefill', () => {
  it('no longer quotes a single person and a family the same rent', () => {
    // This was the bug: housingFor() consulted only the metro and the tenure,
    // so a family of four was handed a studio-inclusive metro-wide median.
    const alone = defaultRent(CHICAGO, 150_000, single);
    const withKids = defaultRent(CHICAGO, 150_000, family);
    expect(withKids).toBeGreaterThan(alone);
  });

  it('quotes a bigger family more again', () => {
    expect(defaultRent(CHICAGO, 150_000, bigFamily)).toBeGreaterThan(
      defaultRent(CHICAGO, 150_000, family),
    );
  });

  it('quotes a couple the same as a single person, since they share a room', () => {
    expect(defaultRent(CHICAGO, 150_000, couple)).toBe(defaultRent(CHICAGO, 150_000, single));
  });

  it('rises with salary', () => {
    expect(defaultRent(AUSTIN, 200_000, single)).toBeGreaterThan(
      defaultRent(AUSTIN, 80_000, single),
    );
  });

  it('lands a $150k earner above the raw metro median it used to show', () => {
    for (const id of [CHICAGO, AUSTIN]) {
      expect(defaultRent(id, 150_000, single)).toBeGreaterThan(
        housingDefaults(id).medianRentMonthly,
      );
    }
  });

  it('puts a $150k household in a plausible share of income everywhere', () => {
    // The old figure put Chicago at 11.4% of a $150k salary, which no renter
    // at that income pays. Nothing should now look like a rounding error, and
    // nothing should look like half the salary either.
    for (const id of ALL_METRO_IDS) {
      const share = (defaultRent(id, 150_000, family) * 12) / 150_000;
      expect(share, `${id} rent share`).toBeGreaterThan(0.08);
      expect(share, `${id} rent share`).toBeLessThan(0.45);
    }
  });

  it('never falls when a bedroom is added, in any metro', () => {
    for (const id of ALL_METRO_IDS) {
      let previous = 0;
      for (let bedrooms = 0; bedrooms <= 5; bedrooms++) {
        const rent = rentDefault(id, 100_000, bedrooms);
        expect(rent, `${id} at ${bedrooms}BR`).toBeGreaterThanOrEqual(previous);
        previous = rent;
      }
    }
  });
});

describe('break-even with income-dependent rent', () => {
  it('solves a salary that really does produce a zero difference', () => {
    // Rent follows salary when it is still a prefill, so the solver has to move
    // it too — otherwise the quoted break-even salary, typed back in, lands a
    // few hundred dollars off zero.
    const household = single;
    const result = compare({
      datasetVersion: '2026.2',
      household,
      origin: defaultCityInputs(CHICAGO, 150_000, household),
      destination: defaultCityInputs(AUSTIN, 150_000, household),
    });

    const check = compare({
      datasetVersion: '2026.2',
      household,
      origin: defaultCityInputs(CHICAGO, 150_000, household),
      destination: defaultCityInputs(AUSTIN, result.breakEvenSalary, household),
    });
    expect(check.delta).toBeCloseTo(0, 0);
  });

  it('holds a rent the user typed fixed while solving', () => {
    const household = single;
    const origin = defaultCityInputs(CHICAGO, 150_000, household);
    const destination = defaultCityInputs(AUSTIN, 150_000, household);
    const typed = {
      ...destination,
      housing: { tenure: 'rent' as const, monthlyRent: 3_500 },
    };

    const result = compare({ datasetVersion: '2026.2', household, origin, destination: typed });

    // Re-running at the solved salary with the SAME typed rent must be level.
    const check = compare({
      datasetVersion: '2026.2',
      household,
      origin,
      destination: { ...typed, grossSalary: result.breakEvenSalary },
    });
    expect(check.delta).toBeCloseTo(0, 0);
  });
});
