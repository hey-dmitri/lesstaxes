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

/**
 * The point above which a figure is written abbreviated.
 *
 * "$10,860" is six digits and two punctuation marks to say a number nobody is
 * going to quote to the dollar, and at headline size it runs the width of the
 * column. "$10.9K" is read at a glance.
 *
 * A THOUSAND, NOT TEN THOUSAND, and the reason is consistency rather than
 * length. At ten thousand, two figures a reader is asked to compare could come
 * out written differently: Raleigh's leftover was $13.8K beside Lafayette's
 * $7,008, in matching cards laid out for exactly that comparison, and two
 * notations for the same quantity read as two different kinds of thing. One
 * threshold low enough that every four-figure sum crosses it removes the whole
 * class of problem. Below a thousand there is nothing to abbreviate: "$905" is
 * already three digits.
 */
export const SHORT_FROM = 1_000;

/**
 * Format a dollar amount short: 10860 -> "$10.9K", 1234567 -> "$1.2M".
 *
 * FOR FIGURES THAT ARE READ, NOT ADDED. The verdict, the two summary cards and
 * each city's bottom line are all quoted once and compared by eye. The rows of
 * the breakdown are not: they have to sum to the figure at the top, and a
 * reader who checks that sum against rounded rows finds it out by hundreds. So
 * the tables keep formatUSD and everything above them uses this.
 *
 * A trailing ".0" is dropped — "$21K" rather than "$21.0K" — because it is a
 * digit of precision the number does not have.
 */
export function formatUSDShort(
  value: USD,
  { signed = false }: Pick<FormatOptions, 'signed'> = {},
): string {
  const rounded = toDollars(value);
  const magnitude = Math.abs(rounded);
  if (magnitude < SHORT_FROM) return formatUSD(rounded, { signed });

  const scale = (n: number, suffix: string) => {
    const at1dp = Math.round(n * 10) / 10;
    return `$${Number.isInteger(at1dp) ? at1dp.toFixed(0) : at1dp.toFixed(1)}${suffix}`;
  };

  /*
   * Rounded before the unit is chosen, not after. $999,950 is 1000.0K, which
   * is a unit that does not exist — it has to be promoted to $1M rather than
   * printed as written.
   */
  const thousands = Math.round(magnitude / 100) / 10;
  const body = thousands >= 1000 ? scale(magnitude / 1_000_000, 'M') : scale(thousands, 'K');

  if (rounded < 0) return `-${body}`;
  if (signed && rounded > 0) return `+${body}`;
  return body;
}

/** Format a fractional rate for display: 0.306 -> "30.6%". */
export function formatPercent(rate: number, decimals = 1): string {
  return `${(rate * 100).toFixed(decimals)}%`;
}
