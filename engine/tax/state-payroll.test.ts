import { describe, expect, it } from 'vitest';

import { computeStatePayroll } from './state';
import { stateRules, ALL_STATE_CODES } from './rules';
import { compare, defaultCityInputs } from '../compare';
import type { Household } from '../types';

/**
 * Eleven states take a disability or paid-leave contribution off every
 * paycheque by law, and this engine modelled none of them.
 *
 * California's is the one that matters most: 1.3% of ALL wages with no ceiling
 * whatsoever. $1,300 a year at $100,000 and $3,900 at $300,000, shown to every
 * Californian on this site as money they had left to spend.
 *
 * Source: EY's 2026 rate table, cross-checked against state labour departments.
 * California's own EDD publishes the 1.3% and the absence of a cap directly.
 */

const SINGLE: Household = { filingStatus: 'single', children: 0, earners: 1 };
const COUPLE: Household = { filingStatus: 'marriedJointly', children: 0, earners: 2 };

describe('California disability insurance', () => {
  it('takes 1.3% of every dollar, with no ceiling at all', () => {
    const ca = stateRules('CA');
    expect(computeStatePayroll(100_000, ca).total).toBeCloseTo(1_300, 6);
    expect(computeStatePayroll(300_000, ca).total).toBeCloseTo(3_900, 6);
    // The absence of a cap is the point: it keeps rising forever.
    expect(computeStatePayroll(1_000_000, ca).total).toBeCloseTo(13_000, 6);
  });

  it('is deductible against federal tax, as the IRS treats it', () => {
    expect(computeStatePayroll(100_000, stateRules('CA')).deductible).toBeCloseTo(1_300, 6);
  });
});

describe('the caps are per worker', () => {
  /*
   * Every one of these is capped against an individual's wages, so two earners
   * splitting $300,000 pay two lots of a cap that one earner on $300,000 hits
   * once. Handing the household total to a capped rate would repeat the exact
   * mistake the Social Security wage base used to make in this engine.
   */
  it('gives two earners two caps', () => {
    const nj = stateRules('NJ');
    const one = computeStatePayroll(300_000, nj, 1).total;
    const two = computeStatePayroll(300_000, nj, 2).total;
    expect(two).toBeGreaterThan(one);
  });

  it('changes nothing where there is no cap to hit twice', () => {
    const ca = stateRules('CA');
    expect(computeStatePayroll(300_000, ca, 2).total).toBeCloseTo(
      computeStatePayroll(300_000, ca, 1).total,
      6,
    );
  });
});

describe('every state', () => {
  it('charges nothing where no programme exists', () => {
    for (const code of ['TX', 'FL', 'IL', 'GA', 'AZ']) {
      expect(computeStatePayroll(200_000, stateRules(code)).total).toBe(0);
    }
  });

  it('never charges an implausible amount anywhere', () => {
    for (const code of ALL_STATE_CODES) {
      const amount = computeStatePayroll(150_000, stateRules(code)).total;
      expect(amount).toBeGreaterThanOrEqual(0);
      // California's uncapped 1.3% is the largest by far; nothing should beat it.
      expect(amount).toBeLessThanOrEqual(150_000 * 0.013 + 0.01);
    }
  });

  it('claims a deduction only where the IRS allows one', () => {
    // The classic disability funds are deductible; the newer paid-leave
    // programmes have no ruling, so they are charged but not deducted.
    for (const code of ['CA', 'NJ', 'NY', 'RI', 'WA']) {
      expect(computeStatePayroll(150_000, stateRules(code)).deductible).toBeGreaterThan(0);
    }
    for (const code of ['CO', 'CT', 'MA', 'OR', 'MN']) {
      const r = computeStatePayroll(150_000, stateRules(code));
      expect(r.total).toBeGreaterThan(0);
      expect(r.deductible).toBe(0);
    }
  });
});

describe('the whole calculation', () => {
  const at = (metroId: string, version?: string) =>
    compare({
      datasetVersion: version as string,
      household: SINGLE,
      origin: defaultCityInputs(metroId, 150_000, SINGLE, 'rent', 0.068, version),
      destination: defaultCityInputs('12420', 150_000, SINGLE, 'rent', 0.068, version),
    }).origin;

  it('leaves a Californian with less than before', () => {
    const sanJose = at('41940');
    expect(sanJose.tax.statePayroll).toBeCloseTo(150_000 * 0.013, 0);
    expect(sanJose.leftover).toBeLessThan(at('41940', '2026.12').leftover);
  });

  it('leaves a Texan untouched', () => {
    expect(at('19100').tax.statePayroll).toBe(0);
  });

  it('shows up in the breakdown rather than vanishing into the total', () => {
    const r = compare({
      datasetVersion: undefined as unknown as string,
      household: COUPLE,
      origin: defaultCityInputs('41940', 200_000, COUPLE),
      destination: defaultCityInputs('12420', 200_000, COUPLE),
    });
    const row = r.breakdown.find((b) => b.key === 'statePayroll');
    expect(row).toBeDefined();
    expect(row!.label).toBe('State disability & paid leave');
    // And the rows must still add up to the headline.
    expect(r.breakdown.reduce((a, b) => a + b.delta, 0)).toBeCloseTo(r.delta, 0);
  });

  it('leaves links pinned to an older release charging nothing', () => {
    expect(at('41940', '2026.12').tax.statePayroll).toBe(0);
  });
});
