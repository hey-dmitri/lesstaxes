/**
 * Progressive bracket arithmetic — the primitive every income tax in this
 * engine is built from. No framework dependencies.
 */

import type { Rate, USD } from '../types';

export interface Bracket {
  /**
   * Lower bound of this bracket, inclusive. The first bracket must start at 0.
   * Brackets must be sorted ascending and must not overlap.
   */
  from: USD;
  /** Marginal rate applied to income between `from` and the next bracket's `from`. */
  rate: Rate;
}

/**
 * Apply a progressive bracket schedule to taxable income.
 *
 * Each bracket's rate applies ONLY to the portion of income falling inside it —
 * this is the part people most often get wrong when reasoning about tax by
 * hand ("I moved into the 32% bracket so I pay 32% on everything").
 *
 * A flat tax is expressed as a single bracket starting at 0.
 *
 * @param taxableIncome income after deductions and exemptions
 * @param brackets sorted ascending by `from`, first entry starting at 0
 */
export function applyBrackets(taxableIncome: USD, brackets: Bracket[]): USD {
  if (taxableIncome <= 0 || brackets.length === 0) return 0;

  let tax = 0;

  for (let i = 0; i < brackets.length; i++) {
    const { from, rate } = brackets[i];
    if (taxableIncome <= from) break;

    // The bracket runs to the next bracket's floor, or to infinity if last.
    const ceiling = i + 1 < brackets.length ? brackets[i + 1].from : Infinity;
    const portion = Math.min(taxableIncome, ceiling) - from;

    tax += portion * rate;
  }

  return tax;
}

/**
 * The rate applied to the next dollar earned. Useful for explaining results,
 * and distinct from the effective rate.
 */
export function marginalRate(taxableIncome: USD, brackets: Bracket[]): Rate {
  if (brackets.length === 0) return 0;

  let rate = brackets[0].rate;
  for (const bracket of brackets) {
    if (taxableIncome >= bracket.from) rate = bracket.rate;
    else break;
  }
  return rate;
}

/** Total tax divided by taxable income. Zero when there is no income. */
export function effectiveRate(taxableIncome: USD, brackets: Bracket[]): Rate {
  if (taxableIncome <= 0) return 0;
  return applyBrackets(taxableIncome, brackets) / taxableIncome;
}

/**
 * Validate a bracket schedule. Called by the dataset build so a malformed
 * table fails loudly at build time rather than silently producing wrong tax.
 *
 * @returns a list of problems; empty means valid
 */
export function validateBrackets(brackets: Bracket[]): string[] {
  const problems: string[] = [];
  if (brackets.length === 0) return ['bracket schedule is empty'];

  if (brackets[0].from !== 0) {
    problems.push(`first bracket must start at 0, got ${brackets[0].from}`);
  }

  for (let i = 0; i < brackets.length; i++) {
    const { from, rate } = brackets[i];

    if (!Number.isFinite(from) || from < 0) {
      problems.push(`bracket ${i}: invalid lower bound ${from}`);
    }
    if (!Number.isFinite(rate) || rate < 0 || rate > 1) {
      problems.push(`bracket ${i}: rate ${rate} outside 0..1 (rates are fractions, not percentages)`);
    }
    if (i > 0 && from <= brackets[i - 1].from) {
      problems.push(`bracket ${i}: lower bound ${from} does not exceed previous ${brackets[i - 1].from}`);
    }
  }

  return problems;
}
