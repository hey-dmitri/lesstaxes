/**
 * What the salary box is actually asking for.
 *
 * The form asked for "Salary" and left the reader to guess. That guess is not
 * harmless: a couple who both work can read one box four different ways — his
 * pay, her pay, the bigger of the two, or the two added up — and three of those
 * readings put a number into the engine that answers a different question than
 * the one on screen.
 *
 * The engine's own answer is unambiguous. It takes ONE household figure
 * (PROJECT.md D3) and every downstream step reads it as everything the
 * household earns before tax. So the label has to say that, and it has to say
 * it differently depending on how many people the household said were earning.
 *
 * WHERE THE AMBIGUITY ACTUALLY LIVES. Not in the filing status by itself. A
 * single filer and a head of household are each one adult with one income, and
 * "Salary" is already exact for both. It is the two married statuses that can
 * hold two incomes, and only once the reader has ticked "we both earn". That is
 * why this keys on the earner count and mentions the filing status only where
 * the status changes what happens to the number afterwards.
 *
 * FILING SEPARATELY GETS A SENTENCE THE OTHERS DO NOT. Its combined figure is
 * halved and run through two returns, which is a thing the calculator does to
 * the reader's number without being asked. Saying so is the difference between
 * a model and a black box, and it is the assumption most likely to be wrong for
 * a lopsided couple — the one person who should argue with us needs to be able
 * to see it.
 */

import type { FilingStatus } from '@/engine';

export interface SalaryWording {
  /** Label above the box in the "living now" column. */
  here: string;
  /** Label above the box in the "the offer" column. */
  there: string;
  /**
   * Whose pay this is, and what happens to it. Sits under both boxes, and is a
   * complete sentence so callers can put their own after it.
   */
  whose: string;
  /** True when the number covers two people, so callers can adjust their own copy. */
  combined: boolean;
}

export function salaryWording(filingStatus: FilingStatus, earners: number): SalaryWording {
  const married = filingStatus === 'marriedJointly' || filingStatus === 'marriedSeparately';
  const both = married && Math.max(1, Math.floor(earners)) >= 2;

  if (both) {
    return {
      here: 'Both salaries here',
      there: 'Both salaries there',
      whose:
        filingStatus === 'marriedSeparately'
          ? 'Both salaries added together, before tax, a year. We split it in half across your two returns.'
          : 'Both salaries added together, before tax, a year.',
      combined: true,
    };
  }

  return {
    here: 'Salary here',
    there: 'Salary offered',
    whose: married
      ? "Just the earning spouse's pay, before tax, a year."
      : 'Your salary, before tax, a year.',
    combined: false,
  };
}
