import { describe, expect, it } from 'vitest';

import { defaultCityInputs, compare } from './compare';
import { CURRENT_DATASET_VERSION } from './datasets';
import {
  breakEvenNarrative,
  breakEvenSentence,
  percentIsMeaningful,
  shortfalls,
  whyNarrative,
  whySentence,
} from './narrative';
import type { ComparisonResult, Household } from './types';

const CHICAGO = '16980';
const AUSTIN = '12420';
const NYC = '35620';

const single: Household = { filingStatus: 'single', children: 0 };
const family: Household = { filingStatus: 'marriedJointly', children: 2 };

function run(
  from: string,
  to: string,
  salary: number,
  destinationSalary = salary,
  household: Household = single,
  tenure: 'rent' | 'own' = 'rent',
): ComparisonResult {
  return compare({
    datasetVersion: CURRENT_DATASET_VERSION,
    household,
    origin: defaultCityInputs(from, salary, household, tenure),
    destination: defaultCityInputs(to, destinationSalary, household, tenure),
  });
}

describe('why narrative', () => {
  it('reads the same salary case without inventing a pay effect', () => {
    const result = run(CHICAGO, AUSTIN, 150_000);
    expect(whySentence(result)).toBe(
      'Austin, TX is $8,967 cheaper a year to live in at the same salary.',
    );
  });

  it('treats a cheaper city and a pay rise as COMPOUNDING, not offsetting', () => {
    // The bug this replaces said "but ... which outweighs it" — telling the
    // reader a raise cancelled out a cheaper city. Both are gains.
    const result = run(CHICAGO, AUSTIN, 150_000, 190_000);
    const why = whyNarrative(result);
    expect(why.opposed).toBe(false);
    expect(whySentence(result)).toContain('adds another');
    expect(whySentence(result)).not.toContain('outweigh');
    expect(whySentence(result)).not.toContain('but');
  });

  it('treats a pricier city and a pay cut as COMPOUNDING', () => {
    // Previously: "not enough to outweigh it", implying the cut partly covered
    // the expense. The two losses add up — the real answer is worse than either.
    const result = run(AUSTIN, NYC, 150_000, 120_000);
    const why = whyNarrative(result);
    expect(why.cityCheaper).toBe(false);
    expect(why.paidMore).toBe(false);
    expect(why.opposed).toBe(false);
    expect(whySentence(result)).toContain('costs another');
    expect(result.delta).toBeLessThan(result.cityEffect);
  });

  it('uses opposing language when a pay cut fights a cheaper city', () => {
    const result = run(CHICAGO, AUSTIN, 150_000, 125_000);
    const why = whyNarrative(result);
    expect(why.opposed).toBe(true);
    expect(why.salaryWins).toBe(true);
    expect(whySentence(result)).toContain('but the pay cut costs');
    expect(whySentence(result)).toContain('more than the saving');
  });

  it('says the saving survives when the pay cut is the smaller force', () => {
    const result = run(NYC, AUSTIN, 150_000, 145_000);
    const why = whyNarrative(result);
    expect(why.opposed).toBe(true);
    expect(why.salaryWins).toBe(false);
    expect(whySentence(result)).toContain('not enough to wipe out the saving');
    expect(result.delta).toBeGreaterThan(0);
  });

  it('never claims something is outweighed when the effects agree in sign', () => {
    for (const [from, to, salary, destinationSalary] of [
      [CHICAGO, AUSTIN, 150_000, 190_000],
      [AUSTIN, NYC, 150_000, 120_000],
      [NYC, AUSTIN, 200_000, 260_000],
    ] as Array<[string, string, number, number]>) {
      const sentence = whySentence(run(from, to, salary, destinationSalary));
      expect(sentence).not.toMatch(/outweigh|not enough|more than/);
    }
  });
});

describe('break-even narrative', () => {
  it('flags headroom when you could afford to earn less', () => {
    const result = run(CHICAGO, AUSTIN, 150_000);
    const be = breakEvenNarrative(result);
    expect(be?.kind).toBe('has-headroom');
    expect(be!.gap).toBeLessThan(0);
    expect(breakEvenSentence(result)).toContain('less than you earn now');
  });

  it('flags a required rise when the destination costs more', () => {
    const result = run(AUSTIN, CHICAGO, 150_000);
    const be = breakEvenNarrative(result);
    expect(be?.kind).toBe('needs-more');
    expect(be!.gap).toBeGreaterThan(0);
    expect(breakEvenSentence(result)).toContain('more than you earn now');
  });

  it('distinguishes the two directions, which previously read identically', () => {
    const headroom = breakEvenSentence(run(CHICAGO, AUSTIN, 150_000))!;
    const needsMore = breakEvenSentence(run(AUSTIN, CHICAGO, 150_000))!;
    expect(headroom).not.toBe(needsMore);
    expect(headroom).toContain('less than you earn now');
    expect(headroom).not.toContain('more than you earn now');
    expect(needsMore).toContain('more than you earn now');
    expect(needsMore).not.toContain('less than you earn now');
  });

  it('measures the gap against the destination salary on the table', () => {
    const result = run(CHICAGO, AUSTIN, 150_000, 90_000);
    const be = breakEvenNarrative(result)!;
    expect(be.against).toBe(90_000);
    expect(be.againstIsCurrentPay).toBe(false);
    expect(be.gap).toBeCloseTo(be.salary - 90_000, 6);
    expect(breakEvenSentence(result)).toContain("the $90,000 you'd be paid there");
  });

  it('says "you earn now" when the pay is unchanged', () => {
    const be = breakEvenNarrative(run(CHICAGO, AUSTIN, 150_000))!;
    expect(be.againstIsCurrentPay).toBe(true);
    expect(breakEvenSentence(run(CHICAGO, AUSTIN, 150_000))).toContain('you earn now');
  });

  it('can never contradict the headline', () => {
    // Leftover money rises monotonically with salary, so the destination salary
    // sits below break-even exactly when the move loses money. "You'd need
    // more" and "less in your pocket" must always appear together.
    const cases: Array<[string, string, number, number, Household]> = [
      [CHICAGO, AUSTIN, 150_000, 125_000, single],
      [CHICAGO, AUSTIN, 150_000, 150_000, single],
      [CHICAGO, AUSTIN, 150_000, 190_000, single],
      [AUSTIN, NYC, 150_000, 120_000, single],
      [NYC, AUSTIN, 150_000, 145_000, single],
      [AUSTIN, CHICAGO, 150_000, 150_000, single],
      [CHICAGO, AUSTIN, 60_000, 60_000, family],
      [NYC, AUSTIN, 200_000, 200_000, family],
    ];
    for (const [from, to, salary, destinationSalary, household] of cases) {
      const result = run(from, to, salary, destinationSalary, household);
      const be = breakEvenNarrative(result);
      if (!be || be.kind === 'level') continue;
      expect(be.kind === 'needs-more').toBe(result.delta < 0);
    }
  });

  it('says so when the destination wins at any salary at all', () => {
    // breakEvenSalary of 0 used to render as no line whatsoever, collapsing the
    // best possible result — "ahead even on nothing" — into silence.
    const result = { ...run(CHICAGO, AUSTIN, 150_000), breakEvenSalary: 0 };
    expect(result.delta).toBeGreaterThan(0);
    const be = breakEvenNarrative(result);
    expect(be?.kind).toBe('wins-at-any-salary');
    expect(breakEvenSentence(result)).toContain('no salary you');
    expect(breakEvenSentence(result)).toContain('even on no income');
  });

  it('still returns nothing when break-even is genuinely unreachable', () => {
    // The other zero: the move loses, and no salary in a sane range fixes it.
    const losing = { ...run(AUSTIN, CHICAGO, 150_000), breakEvenSalary: 0 };
    expect(losing.delta).toBeLessThan(0);
    expect(breakEvenNarrative(losing)).toBeNull();
    expect(breakEvenSentence(losing)).toBeNull();
  });
});

describe('percentage suppression', () => {
  it('keeps the percentage when there is leftover money to measure', () => {
    const result = run(CHICAGO, AUSTIN, 150_000);
    expect(result.origin.leftover).toBeGreaterThan(0);
    expect(percentIsMeaningful(result)).toBe(true);
  });

  it('suppresses it when the origin city leaves nothing over', () => {
    // A family of four on $60k comes out short in every metro, which turned a
    // real $2,053 gain into a nonsense percentage of a negative denominator.
    const result = run(CHICAGO, AUSTIN, 60_000, 60_000, family);
    expect(result.origin.leftover).toBeLessThan(0);
    expect(percentIsMeaningful(result)).toBe(false);
    expect(result.delta).toBeGreaterThan(0); // the difference itself still holds
  });

  it('suppresses it rather than reporting a runaway ratio near zero', () => {
    const result = run(CHICAGO, AUSTIN, 90_000, 90_000, family);
    if (result.origin.leftover <= 0) {
      expect(percentIsMeaningful(result)).toBe(false);
    } else {
      expect(Math.abs(result.deltaPct)).toBeLessThan(20);
    }
  });
});

describe('shortfall reporting', () => {
  it('reports nothing when both cities leave money over', () => {
    expect(shortfalls(run(CHICAGO, AUSTIN, 150_000))).toHaveLength(0);
  });

  it('names both cities when both come out short', () => {
    const result = run(CHICAGO, AUSTIN, 60_000, 60_000, family);
    const short = shortfalls(result);
    expect(short).toHaveLength(2);
    expect(short.map((s) => s.metroId)).toEqual([CHICAGO, AUSTIN]);
    for (const s of short) expect(s.shortBy).toBeGreaterThan(0);
  });

  it('reports the amount as a positive number', () => {
    const [first] = shortfalls(run(CHICAGO, AUSTIN, 60_000, 60_000, family));
    expect(first.shortBy).toBeCloseTo(-run(CHICAGO, AUSTIN, 60_000, 60_000, family).origin.leftover, 6);
  });
});
