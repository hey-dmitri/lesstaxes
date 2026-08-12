import { describe, expect, it } from 'vitest';

import {
  applyBrackets,
  effectiveRate,
  marginalRate,
  validateBrackets,
  type Bracket,
} from './brackets';

/** A simple synthetic schedule: 10% to 10k, 20% to 50k, 30% above. */
const SCHEDULE: Bracket[] = [
  { from: 0, rate: 0.1 },
  { from: 10_000, rate: 0.2 },
  { from: 50_000, rate: 0.3 },
];

const FLAT: Bracket[] = [{ from: 0, rate: 0.0495 }];

describe('applyBrackets', () => {
  it('returns zero for zero or negative income', () => {
    expect(applyBrackets(0, SCHEDULE)).toBe(0);
    expect(applyBrackets(-5000, SCHEDULE)).toBe(0);
  });

  it('taxes wholly within the first bracket', () => {
    expect(applyBrackets(5_000, SCHEDULE)).toBeCloseTo(500, 6);
  });

  it('taxes exactly at a bracket boundary', () => {
    expect(applyBrackets(10_000, SCHEDULE)).toBeCloseTo(1_000, 6);
  });

  it('applies each rate only to the income inside that bracket', () => {
    // 10k @ 10% = 1,000; next 10k @ 20% = 2,000
    expect(applyBrackets(20_000, SCHEDULE)).toBeCloseTo(3_000, 6);
  });

  it('handles income spanning every bracket', () => {
    // 1,000 + (40k @ 20% = 8,000) + (50k @ 30% = 15,000)
    expect(applyBrackets(100_000, SCHEDULE)).toBeCloseTo(24_000, 6);
  });

  it('does NOT apply the top rate to all income', () => {
    // The classic misconception: 100k at 30% would be 30,000.
    expect(applyBrackets(100_000, SCHEDULE)).not.toBeCloseTo(30_000, 6);
  });

  it('treats a single bracket as a flat tax', () => {
    expect(applyBrackets(150_000, FLAT)).toBeCloseTo(7_425, 6);
  });

  it('returns zero for an empty schedule (states with no wage tax)', () => {
    expect(applyBrackets(150_000, [])).toBe(0);
  });

  it('is monotonic — more income never means less tax', () => {
    let previous = 0;
    for (let income = 0; income <= 200_000; income += 2_500) {
      const tax = applyBrackets(income, SCHEDULE);
      expect(tax).toBeGreaterThanOrEqual(previous);
      previous = tax;
    }
  });

  it('never taxes more than the top marginal rate overall', () => {
    for (const income of [1, 9_999, 10_001, 49_999, 250_000, 1_000_000]) {
      expect(applyBrackets(income, SCHEDULE)).toBeLessThanOrEqual(income * 0.3);
    }
  });
});

describe('marginalRate', () => {
  it('reports the rate on the next dollar', () => {
    expect(marginalRate(5_000, SCHEDULE)).toBe(0.1);
    expect(marginalRate(10_000, SCHEDULE)).toBe(0.2);
    expect(marginalRate(49_999, SCHEDULE)).toBe(0.2);
    expect(marginalRate(50_000, SCHEDULE)).toBe(0.3);
  });

  it('is flat for a flat tax', () => {
    expect(marginalRate(1_000_000, FLAT)).toBe(0.0495);
  });
});

describe('effectiveRate', () => {
  it('is always at or below the marginal rate', () => {
    for (const income of [5_000, 25_000, 100_000, 500_000]) {
      expect(effectiveRate(income, SCHEDULE)).toBeLessThanOrEqual(
        marginalRate(income, SCHEDULE),
      );
    }
  });

  it('is zero at zero income', () => {
    expect(effectiveRate(0, SCHEDULE)).toBe(0);
  });
});

describe('validateBrackets', () => {
  it('accepts a well-formed schedule', () => {
    expect(validateBrackets(SCHEDULE)).toEqual([]);
    expect(validateBrackets(FLAT)).toEqual([]);
  });

  it('rejects an empty schedule', () => {
    expect(validateBrackets([])).toHaveLength(1);
  });

  it('rejects a schedule not starting at zero', () => {
    expect(validateBrackets([{ from: 1_000, rate: 0.1 }])[0]).toMatch(/must start at 0/);
  });

  it('rejects out-of-order bounds', () => {
    const problems = validateBrackets([
      { from: 0, rate: 0.1 },
      { from: 50_000, rate: 0.2 },
      { from: 10_000, rate: 0.3 },
    ]);
    expect(problems.some((p) => /does not exceed previous/.test(p))).toBe(true);
  });

  it('rejects a rate given as a percentage instead of a fraction', () => {
    // 22 instead of 0.22 — the most likely data-entry error in the rules file.
    const problems = validateBrackets([{ from: 0, rate: 22 }]);
    expect(problems.some((p) => /outside 0\.\.1/.test(p))).toBe(true);
  });
});
