/**
 * Money helpers. No framework dependencies.
 *
 * All engine math runs in unrounded floats and rounds only at the boundary,
 * so that rounding error cannot accumulate across ~30 chained operations.
 */

import type { USD } from './types';

const MONTHS_PER_YEAR = 12;

/** Round to whole dollars. Use at display boundaries, not mid-calculation. */
export function toDollars(value: number): USD {
  return Math.round(value);
}

/** Convert an annual amount to its monthly equivalent. */
export function monthly(annual: USD): USD {
  return annual / MONTHS_PER_YEAR;
}

/** Convert a monthly amount to its annual equivalent. */
export function annual(monthlyAmount: USD): USD {
  return monthlyAmount * MONTHS_PER_YEAR;
}

/**
 * Clamp a value to a range. Used to keep user-supplied figures inside
 * defensible bounds before they reach the tax engine.
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export interface FormatOptions {
  /** Prefix positive values with "+". Useful for delta rows. */
  signed?: boolean;
  /** Render as "-$1,234" rather than "$-1,234". */
  currencySymbol?: boolean;
}

/** Format a dollar amount for display: 1234.56 -> "$1,235". */
export function formatUSD(
  value: USD,
  { signed = false, currencySymbol = true }: FormatOptions = {},
): string {
  const rounded = toDollars(value);
  const magnitude = Math.abs(rounded).toLocaleString('en-US');
  const body = currencySymbol ? `$${magnitude}` : magnitude;

  if (rounded < 0) return `-${body}`;
  if (signed && rounded > 0) return `+${body}`;
  return body;
}

/** Format a fractional rate for display: 0.306 -> "30.6%". */
export function formatPercent(rate: number, decimals = 1): string {
  return `${(rate * 100).toFixed(decimals)}%`;
}
