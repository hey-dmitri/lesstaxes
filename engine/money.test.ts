import { describe, expect, it } from 'vitest';

import {
  annual,
  clamp,
  formatPercent,
  formatUSD,
  formatUSDShort,
  monthly,
  toDollars,
} from './money';

describe('toDollars', () => {
  it('rounds to whole dollars', () => {
    expect(toDollars(1234.4)).toBe(1234);
    expect(toDollars(1234.5)).toBe(1235);
    expect(toDollars(-1234.6)).toBe(-1235);
  });
});

describe('monthly / annual', () => {
  it('converts between annual and monthly', () => {
    expect(monthly(17004)).toBe(1417);
    expect(annual(1417)).toBe(17004);
  });

  it('round-trips without drift', () => {
    const original = 150_000;
    expect(annual(monthly(original))).toBe(original);
  });
});

describe('clamp', () => {
  it('bounds values to the range', () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(-5, 0, 10)).toBe(0);
    expect(clamp(15, 0, 10)).toBe(10);
  });
});

describe('formatUSD', () => {
  it('formats with thousands separators', () => {
    expect(formatUSD(1234.56)).toBe('$1,235');
    expect(formatUSD(150_000)).toBe('$150,000');
  });

  it('puts the minus sign outside the currency symbol', () => {
    expect(formatUSD(-17_000)).toBe('-$17,000');
  });

  it('adds an explicit plus only when asked', () => {
    expect(formatUSD(7400, { signed: true })).toBe('+$7,400');
    expect(formatUSD(7400)).toBe('$7,400');
    expect(formatUSD(-3100, { signed: true })).toBe('-$3,100');
  });

  it('never renders a signed zero', () => {
    expect(formatUSD(0, { signed: true })).toBe('$0');
    expect(formatUSD(-0.2, { signed: true })).toBe('$0');
  });
});

describe('formatPercent', () => {
  it('renders a fraction as a percentage', () => {
    expect(formatPercent(0.306)).toBe('30.6%');
    expect(formatPercent(-0.306)).toBe('-30.6%');
    expect(formatPercent(0.1125, 2)).toBe('11.25%');
  });
});

/**
 * ABBREVIATED FIGURES, for the places a number is read rather than added.
 *
 * "$10,860" at headline size ran the width of the column and said a number to
 * a precision nobody quotes. The rows of the breakdown still print in full,
 * because they have to add up to the figure above them.
 */
describe('formatUSDShort', () => {
  it('leaves three figures and under alone — there is nothing to shorten', () => {
    expect(formatUSDShort(0)).toBe('$0');
    expect(formatUSDShort(570)).toBe('$570');
    expect(formatUSDShort(905)).toBe('$905');
    expect(formatUSDShort(999)).toBe('$999');
  });

  it('abbreviates every four-figure sum and up', () => {
    /*
     * A THOUSAND IS THE THRESHOLD FOR CONSISTENCY, not brevity. At ten
     * thousand, $13,800 and $7,008 came out "$13.8K" and "$7,008" in matching
     * cards built for comparing them.
     */
    expect(formatUSDShort(1_000)).toBe('$1K');
    expect(formatUSDShort(1_099)).toBe('$1.1K');
    expect(formatUSDShort(7_008)).toBe('$7K');
    expect(formatUSDShort(10_000)).toBe('$10K');
    expect(formatUSDShort(10_860)).toBe('$10.9K');
    expect(formatUSDShort(20_984)).toBe('$21K');
    expect(formatUSDShort(76_544)).toBe('$76.5K');
    expect(formatUSDShort(150_000)).toBe('$150K');
  });

  it('drops a trailing zero rather than claiming a digit it does not have', () => {
    expect(formatUSDShort(21_000)).toBe('$21K');
    expect(formatUSDShort(21_040)).toBe('$21K');
    expect(formatUSDShort(21_060)).toBe('$21.1K');
  });

  it('promotes to millions rather than printing a thousand thousands', () => {
    expect(formatUSDShort(999_949)).toBe('$999.9K');
    // 1000.0K is not a unit. It has to become $1M.
    expect(formatUSDShort(999_950)).toBe('$1M');
    expect(formatUSDShort(1_234_567)).toBe('$1.2M');
  });

  it('keeps the sign in front of the currency symbol', () => {
    expect(formatUSDShort(-10_860)).toBe('-$10.9K');
    expect(formatUSDShort(10_860, { signed: true })).toBe('+$10.9K');
    expect(formatUSDShort(-10_860, { signed: true })).toBe('-$10.9K');
    expect(formatUSDShort(905, { signed: true })).toBe('+$905');
    expect(formatUSDShort(1_099, { signed: true })).toBe('+$1.1K');
  });
});
