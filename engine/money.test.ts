import { describe, expect, it } from 'vitest';

import {
  annual,
  clamp,
  formatPercent,
  formatUSD,
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
