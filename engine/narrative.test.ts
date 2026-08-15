import { describe, expect, it } from 'vitest';

import { defaultCityInputs, compare } from './compare';
import { CURRENT_DATASET_VERSION } from './datasets';
import {
  breakEvenNarrative,
  federalMovedReason,
  breakEvenSentence,
  percentIsMeaningful,
  shortfalls,
  verdict,
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

describe('verdict', () => {
  it('says pack when the move wins', () => {
    const result = run(CHICAGO, AUSTIN, 150_000);
    expect(result.delta).toBeGreaterThan(0);
    expect(verdict(result).kind).toBe('pack');
  });

  it('says stay when the move loses', () => {
    const result = run(AUSTIN, CHICAGO, 150_000);
    expect(result.delta).toBeLessThan(0);
    expect(verdict(result).kind).toBe('stay');
  });

  it('refuses to call a difference smaller than the data can resolve', () => {
    // Every cost here is a local median that real households scatter around.
    // A difference inside that scatter is not a win, and declaring one would
    // be inventing precision the tables do not have.
    const base = run(CHICAGO, AUSTIN, 150_000);
    const t = verdict(base).threshold;
    for (const delta of [0, t * 0.5, -t * 0.5, t - 1, -(t - 1)]) {
      expect(verdict({ ...base, delta }).kind).toBe('too-close');
    }
  });

  it('calls it the moment the difference clears that threshold', () => {
    const base = run(CHICAGO, AUSTIN, 150_000);
    const t = verdict(base).threshold;
    expect(verdict({ ...base, delta: t + 1 }).kind).toBe('pack');
    expect(verdict({ ...base, delta: -(t + 1) }).kind).toBe('stay');
  });

  it('is 1.5% of gross salary, so the margin grows with the money involved', () => {
    expect(verdict(run(CHICAGO, AUSTIN, 60_000)).threshold).toBeCloseTo(900, 6);
    expect(verdict(run(CHICAGO, AUSTIN, 150_000)).threshold).toBeCloseTo(2_250, 6);
    expect(verdict(run(CHICAGO, AUSTIN, 400_000)).threshold).toBeCloseTo(6_000, 6);
  });

  it('measures against the salary you have now, not the one on offer', () => {
    // Otherwise the bar would move every time the reader edited the number
    // they are negotiating, which is the one input they are there to play with.
    const same = verdict(run(CHICAGO, AUSTIN, 150_000, 150_000)).threshold;
    expect(verdict(run(CHICAGO, AUSTIN, 150_000, 90_000)).threshold).toBeCloseTo(same, 6);
    expect(verdict(run(CHICAGO, AUSTIN, 150_000, 260_000)).threshold).toBeCloseTo(same, 6);
  });

  it('has a usable threshold even when neither city leaves anything over', () => {
    // The obvious base — leftover money — is negative here, which is why the
    // threshold is a share of gross instead. A share of a negative number
    // would have made this case nonsense rather than merely tight.
    const broke = run(CHICAGO, AUSTIN, 60_000, 60_000, family);
    expect(broke.origin.leftover).toBeLessThan(0);
    expect(verdict(broke).threshold).toBeCloseTo(900, 6);
    expect(['pack', 'stay', 'too-close']).toContain(verdict(broke).kind);
  });

  it('never states the verdict without saying it is money only', () => {
    for (const delta of [50_000, -50_000, 0]) {
      const v = verdict({ ...run(CHICAGO, AUSTIN, 150_000), delta });
      expect(v.qualifier.length).toBeGreaterThan(0);
      if (v.kind !== 'too-close') expect(v.qualifier).toContain('money alone');
    }
  });

  it('agrees with the sign of the headline in every case', () => {
    const cases: Array<[string, string, number, number]> = [
      [CHICAGO, AUSTIN, 150_000, 150_000],
      [CHICAGO, AUSTIN, 150_000, 125_000],
      [AUSTIN, NYC, 150_000, 120_000],
      [NYC, AUSTIN, 200_000, 200_000],
    ];
    for (const [from, to, salary, destinationSalary] of cases) {
      const result = run(from, to, salary, destinationSalary);
      const kind = verdict(result).kind;
      if (kind === 'pack') expect(result.delta).toBeGreaterThan(0);
      if (kind === 'stay') expect(result.delta).toBeLessThan(0);
    }
  });
});

describe('why narrative', () => {
  it('reads the same salary case without inventing a pay effect', () => {
    // The amount moved with dataset 2026.5: the Chicago metro is now priced
    // from its ILLINOIS part rather than metro-wide, which is $1,453 rent
    // against $1,430 — the Indiana side of that metro is much cheaper and was
    // dragging the average down for people who do not live in it.
    //
    // It moved again with 2026.6, from $9,099 to $8,835. $150,000 used to sit
    // on the very first dollar of the "$150,000 to $199,999" bracket and was
    // handed that whole bracket's basket, which describes households averaging
    // $171,847. It is now placed between brackets, so the basket is smaller and
    // the gap between two cities pricing it is smaller with it.
    const result = run(CHICAGO, AUSTIN, 150_000);
    expect(whySentence(result)).toBe(
      'Austin, TX is $8,835 cheaper a year to live in at the same salary.',
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

describe('federal tax movement is explained, not left bare', () => {
  const owner: Household = { filingStatus: 'marriedJointly', children: 2 };
  const BOSTON = '14460';

  it('says nothing when federal tax did not move', () => {
    // Renters at the same salary take the standard deduction in both cities,
    // so federal tax is identical and there is nothing to explain.
    const result = run(CHICAGO, AUSTIN, 150_000, 150_000, single, 'rent');
    expect(Math.abs(result.origin.tax.federal - result.destination.tax.federal)).toBeLessThan(1);
    expect(federalMovedReason(result)).toBeNull();
  });

  it('blames the salary when only the salary changed', () => {
    const result = run(CHICAGO, AUSTIN, 150_000, 190_000, single, 'rent');
    expect(federalMovedReason(result)).toContain('only because the pay does');
  });

  it('blames itemising when the cities differ at the same salary', () => {
    // Massachusetts income tax and a pricier house are both deductible, so an
    // owner pays LESS federal tax in Boston than in Texas on identical pay.
    const result = run(BOSTON, AUSTIN, 150_000, 150_000, owner, 'own');
    expect(result.origin.tax.deductionTaken).toBeGreaterThan(
      result.destination.tax.deductionTaken,
    );
    const reason = federalMovedReason(result);
    expect(reason).toContain('you itemise');
    expect(reason).toContain('more deduction');
  });

  it('is the deduction gap that drives it, not the rates', () => {
    const result = run(BOSTON, AUSTIN, 150_000, 150_000, owner, 'own');
    const taxGap = result.destination.tax.federal - result.origin.tax.federal;
    const deductionGap = result.origin.tax.deductionTaken - result.destination.tax.deductionTaken;
    // The federal difference must be a plausible marginal-rate slice of the
    // deduction difference — never larger than it.
    expect(taxGap).toBeGreaterThan(0);
    expect(taxGap).toBeLessThan(deductionGap);
  });
});
