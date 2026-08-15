/**
 * How the result is described in words.
 *
 * This lives in the engine, not in a component, because three surfaces have to
 * agree: the results panel, the downloadable share card, and the rich link
 * preview a messaging app renders. When they disagreed, the same move was
 * described three different ways depending on where you read it.
 *
 * These functions decide WHAT is true about a result. Rendering is left to the
 * caller, so the interface can colour and emphasise the parts while the card
 * and the link description stay plain text.
 */

import { metro } from './dataset';
import { formatUSD } from './money';
import type { ComparisonResult, USD } from './types';

// ---------------------------------------------------------------------------
// The verdict
// ---------------------------------------------------------------------------

/**
 * Below this share, the two cities are not distinguishable and the site should
 * not pretend otherwise.
 *
 * Every figure here describes a whole area rather than a household — a median
 * rent, an average grocery bill, an average number of cars — and real
 * households scatter widely around each one. A difference smaller than this is
 * comfortably inside that scatter, so calling a winner would be reading
 * precision into an estimate that does not have any.
 */
export const TOO_CLOSE_SHARE = 0.015;

/**
 * What the threshold is a share OF: the salary you are paid today.
 *
 * Gross, not leftover and not take-home. Leftover is the obvious choice and
 * the wrong one — it is at or below zero for a large share of real households,
 * so a percentage of it is undefined exactly where the answer matters most.
 * Take-home is always positive but it is a computed figure that moves with
 * filing status and state, so the same salary would carry a different
 * threshold in different cities and the rule would stop being one number the
 * reader can check. Gross salary is the figure they typed in.
 *
 * The ORIGIN salary, because it is the fixed point everything else on the page
 * is measured against — using the offer would make the threshold move every
 * time they changed the number they are negotiating.
 */
function tooCloseScale(result: ComparisonResult): USD {
  return Math.max(1, result.origin.grossSalary);
}

export interface Verdict {
  kind: 'pack' | 'stay' | 'too-close';
  /** What follows the word, so it can never be read as advice. */
  qualifier: string;
  /** The dollar figure the difference had to clear, for the reader to check. */
  threshold: USD;
}

/**
 * Pack or stay — the question the site is named after, answered in a word.
 *
 * The panel led with a signed dollar amount, which is the evidence rather than
 * the conclusion, and left the reader to work out which way it pointed. The
 * word is money-only by construction and says so: this calculation knows
 * nothing about the job, the people, or the weather.
 */
export function verdict(result: ComparisonResult): Verdict {
  const threshold = tooCloseScale(result) * TOO_CLOSE_SHARE;

  if (Math.abs(result.delta) < threshold) {
    return {
      kind: 'too-close',
      threshold,
      qualifier:
        `The gap is under ${(TOO_CLOSE_SHARE * 100).toFixed(1)}% of your salary ` +
        `(${formatUSD(threshold)} a year) — closer than area medians and averages can ` +
        `really tell apart.`,
    };
  }
  return result.delta > 0
    ? { kind: 'pack', threshold, qualifier: 'On money alone, the move comes out ahead.' }
    : { kind: 'stay', threshold, qualifier: 'On money alone, staying comes out ahead.' };
}

// ---------------------------------------------------------------------------
// Why the answer came out the way it did
// ---------------------------------------------------------------------------

export interface WhyNarrative {
  /** Always positive. How much the city itself costs more or less. */
  cityAmount: USD;
  cityCheaper: boolean;
  /** False when both salaries match, in which case there is no pay effect. */
  salaryChanged: boolean;
  /** Always positive. What the pay change is worth. */
  salaryAmount: USD;
  paidMore: boolean;
  /**
   * The two effects pull AGAINST each other (a cheaper city with a pay cut, or
   * a pricier city with a rise) rather than compounding.
   *
   * This distinction is the whole point of the type. Describing compounding
   * effects with "but ... outweighs it" is not a wording infelicity, it is
   * false: a pay cut into a pricier city does not partly offset the expense,
   * it adds to it, and the reader is told the opposite.
   */
  opposed: boolean;
  /** The pay change is the larger of the two forces. */
  salaryWins: boolean;
}

export function whyNarrative(result: ComparisonResult): WhyNarrative {
  const cityCheaper = result.cityEffect >= 0;
  const paidMore = result.salaryEffect >= 0;

  return {
    cityAmount: Math.abs(result.cityEffect),
    cityCheaper,
    salaryChanged: result.destination.grossSalary !== result.origin.grossSalary,
    salaryAmount: Math.abs(result.salaryEffect),
    paidMore,
    opposed: cityCheaper !== paidMore,
    salaryWins: Math.abs(result.salaryEffect) > Math.abs(result.cityEffect),
  };
}

/** The clause that follows "<city> is $X cheaper/pricier a year to live in". */
export function whyClause(why: WhyNarrative): string {
  if (!why.salaryChanged) return ' at the same salary.';

  const amount = formatUSD(why.salaryAmount);
  const change = why.paidMore ? 'pay rise' : 'pay cut';

  // Compounding: both forces push the same way, so nothing is being offset.
  if (!why.opposed) {
    return why.paidMore
      ? `, and the ${change} adds another ${amount} on top.`
      : `, and the ${change} costs another ${amount} on top.`;
  }

  // Opposed: one force partly or wholly cancels the other.
  if (why.salaryWins) {
    return why.paidMore
      ? `, but the ${change} is worth ${amount} — more than enough to cover it.`
      : `, but the ${change} costs ${amount} — more than the saving.`;
  }
  return why.paidMore
    ? `, but the ${change} is only worth ${amount} — not enough to cover it.`
    : `, but the ${change} costs ${amount} — not enough to wipe out the saving.`;
}

/** The complete sentence, for surfaces that cannot render rich text. */
export function whySentence(result: ComparisonResult): string {
  const why = whyNarrative(result);
  const to = metro(result.destination.metroId).shortName;
  const direction = why.cityCheaper ? 'cheaper' : 'pricier';
  return `${to} is ${formatUSD(why.cityAmount)} ${direction} a year to live in${whyClause(why)}`;
}

// ---------------------------------------------------------------------------
// Break-even salary
// ---------------------------------------------------------------------------

export interface BreakEvenNarrative {
  salary: USD;
  /** Distance from the destination salary on the table. Negative = headroom. */
  gap: USD;
  /**
   * `wins-at-any-salary` is the case where no break-even salary exists because
   * the destination is ahead even on nothing — the single best piece of news
   * this calculation can produce, and it used to render as no line at all.
   */
  kind: 'needs-more' | 'has-headroom' | 'level' | 'wins-at-any-salary';
  /** The salary the gap is measured against. Zero when no salary is needed. */
  against: USD;
  /** True when that is simply what they earn today, because pay is unchanged. */
  againstIsCurrentPay: boolean;
}

/**
 * Break-even, expressed against the destination salary actually on the table.
 *
 * "You'd need $139,163 in Austin" and "You'd need $161,683 in Chicago" are the
 * same sentence carrying opposite news — one is a pay cut you can absorb, the
 * other is a rise you have to negotiate — and the reader was left to subtract
 * their own salary to find out which. The gap is the actionable part, so it is
 * computed here rather than left implicit.
 *
 * Measuring against the DESTINATION salary rather than today's pay also makes
 * this line incapable of contradicting the headline. Leftover money rises
 * monotonically with salary, so the destination salary sits below break-even
 * exactly when the move loses money — "you'd need more" and "less in your
 * pocket" now always appear together, and never against each other.
 *
 * Null when there is no break-even salary to quote, which happens when the
 * destination wins even at zero income.
 */
export function breakEvenNarrative(result: ComparisonResult): BreakEvenNarrative | null {
  const salary = result.breakEvenSalary;

  // Zero means the destination is ahead at any salary, including none. Saying
  // nothing there threw away the strongest result the tool can return.
  if (salary === 0 && result.delta > 0) {
    return {
      salary: 0,
      gap: -result.destination.grossSalary,
      kind: 'wins-at-any-salary',
      against: result.destination.grossSalary,
      againstIsCurrentPay:
        result.destination.grossSalary === result.origin.grossSalary,
    };
  }
  // Null is "no salary would do it"; a non-positive number is the same news.
  if (salary === null || salary <= 0) return null;

  const against = result.destination.grossSalary;
  const gap = salary - against;
  // Under a rounding error apart is "the same salary", not a $12 pay rise.
  const kind = Math.abs(gap) < 500 ? 'level' : gap > 0 ? 'needs-more' : 'has-headroom';
  return {
    salary,
    gap,
    kind,
    against,
    againstIsCurrentPay: against === result.origin.grossSalary,
  };
}

/**
 * The compact form, for link previews and anywhere else without room to
 * breathe. Messaging apps truncate a description at around 150 characters, so
 * the two directions are kept short and deliberately parallel — the gap and
 * the word before it are the only difference, which is what makes them quick
 * to tell apart. The results panel says the same thing at more length.
 */
export function breakEvenSentence(result: ComparisonResult): string | null {
  const be = breakEvenNarrative(result);
  if (!be) return null;

  const to = metro(result.destination.metroId).shortName;
  const reference = breakEvenReference(be);

  if (be.kind === 'wins-at-any-salary') {
    return `There is no salary you'd need in ${to} — it comes out ahead even on no income at all.`;
  }
  if (be.kind === 'level') return `You'd break even in ${to} at about ${reference}.`;

  const gap = formatUSD(Math.abs(be.gap));
  return be.kind === 'needs-more'
    ? `You'd need ${formatUSD(be.salary)} in ${to} to break even — ${gap} more than ${reference}.`
    : `You'd break even in ${to} at ${formatUSD(be.salary)} — ${gap} less than ${reference}.`;
}

/** What the gap is measured against, named so the reader can check it. */
export function breakEvenReference(be: BreakEvenNarrative): string {
  return be.againstIsCurrentPay
    ? 'you earn now'
    : `the ${formatUSD(be.against)} you'd be paid there`;
}

// ---------------------------------------------------------------------------
// When there is no spare cash to take a percentage of
// ---------------------------------------------------------------------------

/**
 * Whether "X% more spare cash" means anything.
 *
 * The percentage is measured against what is left over in the ORIGIN city. For
 * a large share of real households that figure is at or below zero — typical
 * local costs come to more than the salary — and dividing by it produces
 * garbage: a $964 shortfall turns a $5,688 gain into "589.9% more spare cash",
 * and the ratio flips sign as the denominator crosses zero while the wording
 * keeps taking its direction from the delta.
 *
 * The difference itself stays perfectly valid. Only the ratio is suppressed.
 */
export function percentIsMeaningful(result: ComparisonResult): boolean {
  return result.origin.leftover > 0;
}

export interface Shortfall {
  metroId: string;
  /** Always positive: how far past the salary the yearly costs run. */
  shortBy: USD;
}

/**
 * Cities where modelled costs exceed what the job pays.
 *
 * Not an error and not rare — at the local median rent and average household
 * spending, a family of four on a middling salary comes out short almost
 * everywhere. But "money in your pocket: -$17,786" is meaningless without
 * saying so, and the reader deserves to know which lever to pull.
 */
export function shortfalls(result: ComparisonResult): Shortfall[] {
  const out: Shortfall[] = [];
  for (const city of [result.origin, result.destination]) {
    if (city.leftover <= 0) out.push({ metroId: city.metroId, shortBy: Math.abs(city.leftover) });
  }
  return out;
}

// ---------------------------------------------------------------------------
// The single line doing most of the work
// ---------------------------------------------------------------------------

/**
 * Why the answer came out the way it did, in one clause.
 *
 * The redesign puts the largest breakdown row beside the verdict, which means
 * the label alone has to carry a sentence. "Salary." does not; "The pay on
 * offer is $40,000 higher." does. Written here rather than in the component so
 * the card, the share text and any future surface agree.
 */
export function biggestReason(
  result: ComparisonResult,
): { delta: USD; sentence: string } | null {
  const row = result.breakdown[0];
  if (!row) return null;

  // The states actually used, not the metros' primary states — for a metro
  // that crosses a state line those can differ, and naming the wrong one in a
  // sentence about state income tax is the whole bug this guards against.
  const toState = result.destination.stateCode;
  const fromState = result.origin.stateCode;
  const amount = formatUSD(Math.abs(row.delta));
  const better = row.delta >= 0;

  switch (row.key) {
    case 'salary':
      return {
        delta: row.delta,
        sentence: `The pay on offer is ${amount} ${better ? 'higher' : 'lower'}.`,
      };
    case 'stateTax':
      return {
        delta: row.delta,
        sentence:
          result.destination.tax.state === 0
            ? `${fromState} income tax, which ${toState} doesn’t charge.`
            : `State income tax is ${amount} ${better ? 'lower' : 'higher'} in ${toState}.`,
      };
    case 'localTax':
      return {
        delta: row.delta,
        sentence: `Local income tax is ${amount} ${better ? 'lower' : 'higher'} there.`,
      };
    case 'housing':
      /*
       * The row's own label, not "rent or mortgage".
       *
       * Everywhere else this figure is labelled by `housingLabel()`, which
       * says "Rent + utilities" or "Mortgage + utilities" — because the reader
       * should not have to work out which half applies to them, and because
       * the utility bill is inside the number. The headline card was still
       * using the retired wording, so it and the row three inches below it
       * gave the same figure two different names.
       */
      return {
        delta: row.delta,
        sentence: `${row.label} is ${amount} ${better ? 'cheaper' : 'dearer'} a year.`,
      };
    case 'propertyTax':
      return {
        delta: row.delta,
        sentence: `Property tax is ${amount} ${better ? 'lower' : 'higher'}.`,
      };
    case 'transport':
      return {
        delta: row.delta,
        sentence: `Cars and transport cost ${amount} ${better ? 'less' : 'more'}.`,
      };
    default:
      return {
        delta: row.delta,
        sentence: `${row.label} ${better ? 'costs' : 'costs'} ${amount} ${better ? 'less' : 'more'}.`,
      };
  }
}

/**
 * Why federal tax moved between two cities, when it did.
 *
 * Federal rules are identical in every state, and this site says so — which is
 * exactly why a federal line that differs reads as a bug. There are only two
 * ways it can legitimately move: the salary changed, or the filer itemises and
 * one state hands them a larger deduction through SALT and mortgage interest.
 *
 * Returns null when federal tax did not move, so the caller can stay quiet.
 */
export function federalMovedReason(result: ComparisonResult): string | null {
  const moved = result.origin.tax.federal - result.destination.tax.federal;
  if (Math.abs(moved) < 1) return null;

  const salaryChanged = result.destination.grossSalary !== result.origin.grossSalary;
  // The middle column is the destination at the ORIGIN salary, so a difference
  // that survives it cannot be the salary's doing.
  const cityMoved =
    Math.abs(result.origin.tax.federal - result.destinationAtOriginSalary.tax.federal) >= 1;

  if (!cityMoved && salaryChanged) {
    return 'Federal rules are identical in both cities — this moves only because the pay does.';
  }

  const from = metro(result.origin.metroId).shortName;
  const to = metro(result.destination.metroId).shortName;
  const bigger = result.origin.tax.deductionTaken >= result.destination.tax.deductionTaken;
  const gap = Math.abs(result.origin.tax.deductionTaken - result.destination.tax.deductionTaken);

  return (
    `Federal rates are the same in both, but you itemise: state and property tax and ` +
    `mortgage interest are deductible, and ${bigger ? from : to} gives you ` +
    `${formatUSD(gap)} more deduction${salaryChanged ? '. The pay change moves it too.' : '.'}`
  );
}
