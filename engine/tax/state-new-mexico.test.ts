/**
 * New Mexico, which was wrong in three places at once and in both directions.
 *
 * An audit reproduced a head of household on $50,000 in Albuquerque with one
 * child and got about $500 of state tax. Three things were behind it:
 *
 *   the child income tax credit  $424 at that income, refundable, not applied
 *   the low- and middle-income   $2,500 a person, tapering, not applied
 *     exemption
 *   the dependent deduction      $4,000 is for all but ONE dependent and only
 *                                on a joint or head-of-household return; we
 *                                gave it for every child to every filer
 *
 * The first two overcharged that family and the third undercharged it, which
 * is why nothing looked obviously wrong. Together they moved the bill from
 * about $500 to about $235.
 */

import { describe, expect, it } from 'vitest';

import { computeStateTax } from './state';
import { stateRules } from './rules';

const NM = stateRules('NM');
/** The release cut before any of this was modelled. */
const BEFORE = stateRules('NM', '2026.26');

const parent = (grossSalary: number, children = 1) => ({
  filingStatus: 'headOfHousehold' as const,
  children,
  grossSalary,
});

describe('the child income tax credit', () => {
  /*
   * The state's published table, by adjusted gross income, one column for
   * every filing status. It does not taper to nothing: a child is still worth
   * $26 above $350,000, so a band list that simply ran out would be wrong.
   */
  it('pays the published amount for each band', () => {
    const bands: Array<[number, number]> = [
      [20_000, 637],
      [50_000, 424],
      [60_000, 212],
      [90_000, 106],
      [150_000, 79],
      [300_000, 53],
      [500_000, 26],
    ];
    for (const [salary, perChild] of bands) {
      const withChild = computeStateTax(parent(salary), NM);
      expect(withChild.childCredit, `$${salary}`).toBeCloseTo(perChild, 2);
    }
  });

  it('pays it for every child', () => {
    expect(computeStateTax(parent(50_000, 3), NM).childCredit).toBeCloseTo(424 * 3, 2);
  });

  it('pays nothing to a household with no children', () => {
    expect(computeStateTax(parent(50_000, 0), NM).childCredit).toBe(0);
  });

  /*
   * REFUNDABLE, which is most of its value to the households it is aimed at.
   * A family whose bill is already near nothing is paid the difference, and an
   * ordinary credit would quietly stop at zero.
   */
  it('pays out below zero tax', () => {
    const tax = computeStateTax(parent(20_000, 2), NM).tax;
    expect(tax).toBeLessThan(0);
  });
});

describe('the low- and middle-income exemption', () => {
  /*
   * $2,500 a person, less ten cents for every dollar above $30,000 on a
   * head-of-household return, and gone at $55,000. Multiplied by everybody on
   * the return, which is what no allowance phase-out here could express.
   */
  it('gives every person on the return a share of it', () => {
    const one = computeStateTax({ filingStatus: 'single', children: 0, grossSalary: 30_000 }, NM);
    // Single: the full $2,500 at $20,000 and below, then fifteen cents a dollar.
    expect(one.exemptions).toBeCloseTo(2_500 - 0.15 * 10_000, 2);

    const family = computeStateTax(
      { filingStatus: 'marriedJointly', children: 2, grossSalary: 40_000, earners: 2 },
      NM,
    );
    const each = 2_500 - 0.1 * 10_000;
    // Two adults and two children, less the $4,000 for the second child.
    expect(family.exemptions).toBeCloseTo(each * 4 + 4_000, 2);
  });

  it('stops dead at the income the state names', () => {
    const under = computeStateTax(parent(54_999, 0), NM).exemptions;
    const over = computeStateTax(parent(55_001, 0), NM).exemptions;
    expect(under).toBeGreaterThan(0);
    expect(over).toBe(0);
  });

  /*
   * A separate return is NOT a single return here. New Mexico halves the joint
   * figures for it — $15,000 and twenty cents — where the single ones are
   * $20,000 and fifteen. Reading it as single would run the exemption $9,167
   * further up the income scale than the statute allows.
   */
  it('uses the separate-return figures for a separate return', () => {
    const separate = computeStateTax(
      { filingStatus: 'marriedSeparately', children: 0, grossSalary: 30_000 },
      NM,
    );
    expect(separate.exemptions).toBe(0);

    const single = computeStateTax(
      { filingStatus: 'single', children: 0, grossSalary: 30_000 },
      NM,
    );
    expect(single.exemptions).toBeGreaterThan(0);
  });
});

describe('the $4,000 dependent deduction', () => {
  /*
   * "In lieu of the suspended personal exemption, New Mexico offers a
   * deduction of $4,000 for all but one of a taxpayer's dependents." The
   * sentence shipped in the state's own notes for months while the build read
   * the $4,000 and ignored the words around it.
   */
  it('ignores the first child', () => {
    const above = 60_000; // above the low-income exemption, so only this moves
    const one = computeStateTax(parent(above, 1), NM).exemptions;
    const two = computeStateTax(parent(above, 2), NM).exemptions;
    expect(one).toBe(0);
    expect(two).toBeCloseTo(4_000, 2);
  });

  it('is not available to a single filer or a separate return', () => {
    for (const filingStatus of ['single', 'marriedSeparately'] as const) {
      const result = computeStateTax({ filingStatus, children: 3, grossSalary: 60_000 }, NM);
      expect(result.exemptions, filingStatus).toBe(0);
    }
  });

  it('was handing out $4,000 the state does not allow', () => {
    const before = computeStateTax(parent(60_000, 1), BEFORE).exemptions;
    expect(before).toBeCloseTo(4_000, 2);
  });
});

describe('the household the audit reproduced', () => {
  const audited = parent(50_000, 1);

  it('charged about $500 and now charges about $235', () => {
    const before = computeStateTax(audited, BEFORE).tax;
    const after = computeStateTax(audited, NM).tax;

    // 8,000 at 1.5% and the rest at 3.2%, on $50,000 less the federal
    // head-of-household deduction of $24,150 and $1,000 of exemption.
    expect(computeStateTax(audited, NM).taxBeforeCredits).toBeCloseTo(659.2, 2);
    expect(before).toBeGreaterThan(490);
    expect(before).toBeLessThan(570);
    expect(after).toBeCloseTo(before - 328, 0);
    expect(after).toBeCloseTo(235.2, 1);
  });

  /*
   * The credit is worth more than the whole change, because the two exemption
   * corrections partly cancel: one gave $4,000 back to the state, the other
   * took $1,000 off the bill.
   */
  it('leaves the state earned income credit alone', () => {
    expect(computeStateTax(audited, NM).earnedIncomeCredit).toBeCloseTo(
      computeStateTax(audited, BEFORE).earnedIncomeCredit,
      2,
    );
  });
});

describe('releases cut before any of this', () => {
  /*
   * A share link pinned to an older release replays that release's JSON, which
   * has none of these fields. A new field must never make an old answer throw,
   * and it must never change one either.
   */
  it('answer exactly as they did', () => {
    /*
     * The two figures are different from each other because 2026.26 is where
     * the head-of-household deduction was corrected from the joint $32,200 to
     * the federal $24,150. Both are pinned, because "unchanged" is the whole
     * promise a pinned link makes.
     */
    for (const [version, tax] of [
      ['2026.25', 305.6],
      ['2026.26', 563.2],
    ] as const) {
      const rules = stateRules('NM', version);
      expect(rules.childCredit ?? null, version).toBeNull();
      expect(rules.perPersonExemption ?? null, version).toBeNull();
      const result = computeStateTax(parent(50_000, 1), rules);
      expect(result.childCredit, version).toBe(0);
      expect(result.tax, version).toBeCloseTo(tax, 2);
    }
  });
});
