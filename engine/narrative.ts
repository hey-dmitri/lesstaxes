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
import { formatUSD, formatUSDShort } from './money';
import type { ComparisonResult, USD } from './types';

// ---------------------------------------------------------------------------
// The verdict
// ---------------------------------------------------------------------------

/**
 * Below this share, the site does not call a winner.
 *
 * TWO REASONS, AND THE SECOND ONE IS WHY IT IS 5% RATHER THAN 1.5%.
 *
 * The first is precision. Every figure here describes a whole area rather than
 * a household — a median rent, an average grocery bill, an average number of
 * cars — and real households scatter widely around each one. A difference
 * inside that scatter is not a win.
 *
 * The second is that this is a question about whether to move house, and the
 * threshold has to be worth moving for. At 1.5% a household on $90,000 was
 * told to pack over $1,400 a year — $27 a week, against uprooting a life. That
 * is a difference the arithmetic can see and no one would act on, and a verdict
 * nobody would act on is a verdict that should not be printed. 5% of $90,000 is
 * $4,500, which is a decision.
 *
 * The number stays a SHARE because the same dollars mean different things at
 * different incomes: $3,000 is a fortnight's pay on $80,000 and a rounding
 * error on $400,000.
 */
export const TOO_CLOSE_SHARE = 0.05;

/**
 * ...and never less than this in dollars, however small the salary.
 *
 * A share alone reaches $750 at $15,000, which is back inside the range where
 * a median rent cannot tell two cities apart — the first reason above does not
 * scale with income the way the second one does. The floor is where the two
 * reasons cross: below about $50,000 of salary, precision binds before
 * significance does.
 */
export const TOO_CLOSE_FLOOR: USD = 2_500;

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
  /**
   * The verdict as an instruction, naming the city it points at.
   *
   * "Pack" on its own asks the reader to remember which of the two cities they
   * typed into which box, at the exact moment they are looking for an answer.
   * Naming it costs three words and removes the question.
   */
  headline: string;
  /**
   * The same verdict where there is no room for a city name — the share card
   * and the link preview, which already print both cities beside it.
   */
  word: string;
  /** What follows the verdict, so it can never be read as advice. */
  qualifier: string;
  /** The dollar figure the difference had to clear, for the reader to check. */
  threshold: USD;
}

/**
 * Pack or stay — the question the site is named after, answered in a phrase.
 *
 * The panel led with a signed dollar amount, which is the evidence rather than
 * the conclusion, and left the reader to work out which way it pointed. The
 * answer is money-only by construction and says so: this calculation knows
 * nothing about the job, the people, or the weather.
 */
export function verdict(result: ComparisonResult): Verdict {
  const share = tooCloseScale(result) * TOO_CLOSE_SHARE;
  const threshold = Math.max(TOO_CLOSE_FLOOR, share);
  const from = cityName(result.origin.metroId);
  const to = cityName(result.destination.metroId);

  if (Math.abs(result.delta) < threshold) {
    return {
      kind: 'too-close',
      threshold,
      headline: 'Too close to call',
      word: 'Too close to call',
      /*
       * The sentence has to say which of the two rules produced the number, or
       * a reader on $40,000 does the arithmetic, gets $2,000, and finds the
       * page quoting $2,500 at them.
       */
      qualifier:
        share >= TOO_CLOSE_FLOOR
          ? `The gap is under ${(TOO_CLOSE_SHARE * 100).toFixed(0)}% of your salary ` +
            `(${formatUSD(threshold)} a year) — not enough to move house for, and closer ` +
            `than area medians and averages can really tell apart.`
          : `The gap is under ${formatUSD(threshold)} a year, which is the least this ` +
            `site will call a winner over — closer than area medians and averages can ` +
            `really tell apart.`,
    };
  }
  return result.delta > 0
    ? {
        kind: 'pack',
        threshold,
        headline: `Pack and move to ${to}`,
        word: 'Pack',
        qualifier: 'On money alone, the move comes out ahead.',
      }
    : {
        kind: 'stay',
        threshold,
        headline: `Stay in ${from}`,
        word: 'Stay',
        qualifier: 'On money alone, staying comes out ahead.',
      };
}

/**
 * A LINE OF THE BREAKDOWN, IN THE WORDS SOMEBODY WOULD SAY OUT LOUD.
 *
 * "Taxes on your pay  +$4,055", in green, was read exactly backwards by the
 * first person who looked at it: a plus sign against the word TAXES says you
 * will pay more tax. What it meant was that you keep $4,055 more BECAUSE the
 * tax is lower. Same trap on living expenses, and worse there, because the
 * figure is bigger.
 *
 * The sign convention itself is right and stays — every row is what the move
 * does to your pocket, so they add up to the answer above them. What was
 * missing is that a reader does not translate "+" into "less tax" on sight,
 * and should not have to.
 *
 * So each row says LESS or MORE of its own thing. A cost row that improves
 * says "less" — less tax, less rent — and a pay row that improves says "more".
 * The colour still means better or worse, which now agrees with the word
 * instead of contradicting it.
 */
export interface ChangeInWords {
  /** Unsigned. The word beside it carries the direction. */
  amount: USD;
  /** 'less' | 'more' | '' — empty when nothing moved. */
  word: string;
  /** The whole thing, ready to print: "$4,055 less", or "the same". */
  text: string;
  /** True when this row leaves the household better off in the destination. */
  better: boolean;
  /** Neither better nor worse: the two cities charge the same. */
  unchanged: boolean;
}

export function changeInWords(
  /** Positive means better off in the destination, as everywhere else here. */
  delta: USD,
  /**
   * Whether the line is money going OUT (tax, rent, food), money coming IN
   * (pay), or a total of both. It decides the word, not the colour: a cost
   * that improves gets smaller and a wage that improves gets bigger.
   *
   * 'mixed' exists for a subtotal that adds a pay change to a tax change,
   * where neither "less" nor "more" is true of the whole thing — the share
   * card has one. It says better or worse instead, which is the only honest
   * word for a figure whose parts move in opposite directions.
   */
  kind: 'cost' | 'pay' | 'mixed',
): ChangeInWords {
  // Under a dollar a year is a rounding difference, not a change worth a word.
  if (Math.abs(delta) < 1) {
    return { amount: 0, word: '', text: 'the same', better: false, unchanged: true };
  }
  const better = delta > 0;
  const word =
    kind === 'cost'
      ? better
        ? 'less'
        : 'more'
      : kind === 'pay'
        ? better
          ? 'more'
          : 'less'
        : better
          ? 'better'
          : 'worse';
  const amount = Math.abs(delta);
  return { amount, word, text: `${formatUSD(amount)} ${word}`, better, unchanged: false };
}

/**
 * The city, short enough to sit inside a sentence: the short name without its
 * state suffix. "Albany-Schenectady-Troy, NY" is already shortened to
 * "Albany, NY" in the dataset, and this drops the last two characters too.
 *
 * The hyphen is left alone on purpose. Cutting at it would look right on the
 * Census names and would turn Winston-Salem into Winston.
 */
export function cityName(metroId: string, version?: string): string {
  return metro(metroId, version).shortName.replace(/,.*$/, '');
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

  // Abbreviated, because this clause finishes a sentence that opens with an
  // abbreviated figure — "$5,317 cheaper ... but the pay cut costs $12,152"
  // wrote the same kind of quantity two different ways inside one sentence.
  const amount = formatUSDShort(why.salaryAmount);
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
  return `${to} is ${formatUSDShort(why.cityAmount)} ${direction} a year to live in${whyClause(why)}`;
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

/**
 * What the gap is measured against, named so the reader can check it.
 *
 * Not "the offer": there may not be one. Plenty of people run this before
 * anyone has offered them anything, and the setup screen is careful not to
 * assume otherwise — see the "Moving to" column.
 */
export function breakEvenReference(be: BreakEvenNarrative): string {
  return be.againstIsCurrentPay
    ? 'you earn now'
    : `the ${formatUSDShort(be.against)} you'd be paid there`;
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
 * Why the answer came out the way it did, in one sentence.
 *
 * The card beside the verdict shows the largest single row of the breakdown,
 * which means the label alone has to carry a sentence: "Salary." does not.
 * Written here rather than in the component so the card, the share text and any
 * future surface agree.
 *
 * EVERY SENTENCE NAMES A CITY, and none of them says "the offer".
 *
 * It used to read "The pay on offer is $20,984 lower." Two things wrong with
 * that, and the second is worse than the first. There may be no offer — plenty
 * of people run this before anyone has offered them anything, moving for a
 * partner, for family, for the weather, and the setup screen is careful not to
 * assume one. And "lower" than what? The card sits between two city names and
 * gave neither, so the one line on the page whose job is to say what did this
 * left the reader to work out which of the two places it was talking about.
 *
 * "Lafayette pays $21K less than Raleigh" cannot be misread.
 */
export function biggestReason(
  result: ComparisonResult,
): { delta: USD; sentence: string } | null {
  const row = result.breakdown[0];
  if (!row) return null;

  const from = cityName(result.origin.metroId, result.datasetVersion);
  const to = cityName(result.destination.metroId, result.datasetVersion);
  // The states actually used, not the metros' primary states — for a metro
  // that crosses a state line those can differ, and naming the wrong one in a
  // sentence about state income tax is the whole bug this guards against.
  const toState = result.destination.stateCode;
  const fromState = result.origin.stateCode;
  // Short, because this is a sentence rather than a column: "$21K less" reads
  // in one beat where "$20,984 less" is read digit by digit.
  const amount = formatUSDShort(Math.abs(row.delta));
  const better = row.delta >= 0;
  const sentence = (text: string) => ({ delta: row.delta, sentence: text });

  switch (row.key) {
    case 'salary':
      return sentence(`${to} pays ${amount} ${better ? 'more' : 'less'} than ${from}.`);
    case 'stateTax':
      return sentence(
        result.destination.tax.state === 0
          ? `${fromState} charges income tax and ${toState} does not, which is worth ${amount} a year.`
          : `State income tax is ${amount} a year ${better ? 'lower' : 'higher'} in ${toState} than in ${fromState}.`,
      );
    case 'localTax':
      return sentence(
        `Local income tax is ${amount} a year ${better ? 'lower' : 'higher'} in ${to} than in ${from}.`,
      );
    case 'housing':
      /*
       * The row's own label, not "rent or mortgage".
       *
       * Everywhere else this figure is labelled by `housingLabel()`, which
       * says "Rent + utilities" or "Mortgage + utilities" — because the reader
       * should not have to work out which half applies to them, and because
       * the utility bill is inside the number.
       */
      return sentence(
        `${row.label} in ${to} ${better ? 'costs' : 'costs'} ${amount} a year ${better ? 'less' : 'more'} than in ${from}.`,
      );
    case 'propertyTax':
      return sentence(`Property tax in ${to} is ${amount} a year ${better ? 'lower' : 'higher'} than in ${from}.`);
    case 'transport':
      return sentence(`Cars and transport cost ${amount} a year ${better ? 'less' : 'more'} in ${to}.`);
    default:
      return sentence(`${row.label} costs ${amount} a year ${better ? 'less' : 'more'} in ${to}.`);
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
