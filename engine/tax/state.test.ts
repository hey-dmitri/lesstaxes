import { describe, expect, it } from 'vitest';

import { validateBrackets } from './brackets';
import {
  ALL_FILING_STATUSES,
  ALL_STATE_CODES,
  NO_WAGE_TAX_STATES,
  STATE_RULES_2026,
  stateRules,
} from './rules';
import { adultsIn, computeStateTax, scheduleFor } from './state';

const tax = (code: string, grossSalary: number, opts: Partial<{ filingStatus: typeof ALL_FILING_STATUSES[number]; children: number }> = {}) =>
  computeStateTax(
    { grossSalary, filingStatus: opts.filingStatus ?? 'single', children: opts.children ?? 0 },
    stateRules(code),
  ).tax;

// ---------------------------------------------------------------------------
// Dataset integrity
// ---------------------------------------------------------------------------

describe('state dataset', () => {
  it('covers 50 states plus DC', () => {
    expect(ALL_STATE_CODES).toHaveLength(51);
    expect(ALL_STATE_CODES).toContain('DC');
  });

  it('has exactly the nine no-wage-tax states', () => {
    expect([...NO_WAGE_TAX_STATES]).toEqual(['AK', 'FL', 'NH', 'NV', 'SD', 'TN', 'TX', 'WA', 'WY']);
  });

  it('treats Washington as having no WAGE tax despite its capital gains tax', () => {
    // The source table lists 7%/9% for Washington, but footnote (tt) says it
    // applies to capital gains only. Taking that table at face value would tell
    // every Seattle mover they owe 7% state tax on salary.
    const wa = stateRules('WA');
    expect(wa.hasWageIncomeTax).toBe(false);
    expect(tax('WA', 250_000)).toBe(0);
    expect(wa.notes.join(' ')).toMatch(/capital gains/i);
  });

  it.each(ALL_STATE_CODES)('%s has well-formed bracket schedules', (code) => {
    const rules = stateRules(code);
    if (!rules.hasWageIncomeTax) return;
    expect(validateBrackets(rules.brackets.single)).toEqual([]);
    expect(validateBrackets(rules.brackets.marriedJointly)).toEqual([]);
  });

  it.each(ALL_STATE_CODES)('%s has plausible rates and allowances', (code) => {
    const rules = stateRules(code);
    for (const schedule of ['single', 'marriedJointly'] as const) {
      for (const b of rules.brackets[schedule]) {
        // No US state exceeds 13.3% (California's top rate).
        expect(b.rate).toBeGreaterThanOrEqual(0);
        expect(b.rate).toBeLessThanOrEqual(0.133);
      }
      expect(rules.standardDeduction[schedule]).toBeGreaterThanOrEqual(0);
      expect(rules.standardDeduction[schedule]).toBeLessThan(50_000);
    }
  });
});

// ---------------------------------------------------------------------------
// Filing status mapping
// ---------------------------------------------------------------------------

describe('scheduleFor', () => {
  it('maps joint filers to the joint schedule', () => {
    expect(scheduleFor('marriedJointly')).toBe('marriedJointly');
  });

  it('maps everything else to the single schedule', () => {
    expect(scheduleFor('single')).toBe('single');
    expect(scheduleFor('marriedSeparately')).toBe('single');
    expect(scheduleFor('headOfHousehold')).toBe('single');
  });
});

/**
 * A head of household is not a single filer, and calling them one cost money.
 *
 * scheduleFor mapped every head of household onto the single schedule and the
 * comment called it "conservative". California publishes its own Schedule Z:
 * on $120,000 of taxable income California charges $5,570 and this engine
 * charged $7,599. Maryland puts them on the JOINT table in so many words.
 * Neither is a rounding, and both land on single parents.
 */
describe('head of household', () => {
  const HOH = { grossSalary: 120_000, filingStatus: 'headOfHousehold' as const, children: 2 };

  it('uses the state schedule the state says to use', () => {
    expect(computeStateTax(HOH, stateRules('CA')).scheduleUsed).toBe('headOfHousehold');
    expect(computeStateTax(HOH, stateRules('MD')).scheduleUsed).toBe('marriedJointly');
  });

  /*
   * A state can publish its own head-of-household DEDUCTION without its own
   * rate schedule. New York is exactly that — $11,200 against a single filer's
   * $8,000, on brackets shared with single filers — and an earlier version of
   * scheduleFor would not select the head-of-household schedule at all unless
   * brackets existed, so the deduction was unreachable.
   */
  /*
   * A state can send a head of household to one bracket schedule and give them
   * a deduction belonging to NEITHER schedule. Oklahoma does: the rate table is
   * headed "Head of Household, Married Filing Jointly OR Widow(er)", but the
   * standard deduction is $9,350, between the single $6,350 and joint $12,700.
   * Tying the deduction to the brackets would hand them $12,700.
   */
  it('takes a state deduction that matches neither bracket schedule', () => {
    const ok = stateRules('OK');
    expect(ok.headOfHouseholdBasis).toBe('marriedJointly');
    expect(computeStateTax(HOH, ok).scheduleUsed).toBe('marriedJointly');
    expect(computeStateTax(HOH, ok).deductions).toBe(9_350);
    expect(ok.standardDeduction.marriedJointly).not.toBe(9_350);
    expect(ok.standardDeduction.single).not.toBe(9_350);
  });

  /*
   * THIS TEST USED NEW YORK AND THE PREMISE WAS WRONG. It asserted that New
   * York "publishes no separate head-of-household RATE schedule". New York
   * does publish one — we simply carried none, so the engine fell back to the
   * single schedule while the data claimed basis 'own'. That is the quietest
   * way for a rule to go missing: a state marked as having its own treatment,
   * with nothing of its own to apply.
   *
   * Missouri is the real example of the shape. One rate chart for everybody,
   * and a much larger deduction: it conforms to the FEDERAL figure, $24,150
   * for a head of household against $16,100 single.
   */
  it('takes a state deduction even where the brackets are shared', () => {
    const mo = stateRules('MO');
    expect(mo.brackets.headOfHousehold).toBeUndefined();
    expect(mo.standardDeduction.headOfHousehold).toBe(24_150);

    const asHoh = computeStateTax(HOH, mo);
    const asSingle = computeStateTax({ ...HOH, filingStatus: 'single' }, mo);
    expect(asHoh.deductions).toBe(24_150);
    expect(asSingle.deductions).toBe(mo.standardDeduction.single);
    expect(asHoh.tax).toBeLessThan(asSingle.tax);
  });

  it('gives New York the head-of-household schedule it actually publishes', () => {
    const ny = stateRules('NY');
    // The 5.4% band runs to $107,650 rather than a single filer's $80,650.
    expect(ny.brackets.headOfHousehold?.map((b) => b.from)).toContain(107_650);
    expect(computeStateTax(HOH, ny).scheduleUsed).toBe('headOfHousehold');
    expect(ny.standardDeduction.headOfHousehold).toBe(11_200);
  });

  it('never charges a head of household more than a single filer', () => {
    for (const code of ALL_STATE_CODES) {
      const rules = stateRules(code);
      if (!rules.hasWageIncomeTax) continue;
      for (const salary of [40_000, 80_000, 150_000, 400_000]) {
        const hoh = computeStateTax({ ...HOH, grossSalary: salary }, rules).tax;
        const single = computeStateTax(
          { grossSalary: salary, filingStatus: 'single', children: 2 },
          rules,
        ).tax;
        expect(hoh, `${code} at $${salary}`).toBeLessThanOrEqual(single + 0.01);
      }
    }
  });

  it('records whether each state was actually checked, rather than assuming', () => {
    // "assumed-single" is deliberately not spelled "single". The difference is
    // the difference between a decision and an oversight, and every graduated
    // state used to be the second one.
    /*
     * EVERY taxing state, not just the ones with more than one bracket.
     *
     * This test used to filter to graduated states, matching a coverage report
     * that did the same, because the question began as "which rate schedule
     * does a head of household use". Twelve flat-rate states were therefore
     * never asked — and five of them give a head of household a different
     * ALLOWANCE, Louisiana the entire joint amount. Being flat says nothing
     * about the deduction.
     */
    const graduated = ALL_STATE_CODES.map((code) => stateRules(code)).filter(
      (s) => s.hasWageIncomeTax,
    );
    expect(graduated.length).toBeGreaterThan(40);
    for (const s of graduated) {
      expect(['own', 'marriedJointly', 'single', 'assumed-single']).toContain(
        s.headOfHouseholdBasis,
      );
    }
    // The verified ones must stay verified: silently dropping back to an
    // assumption is exactly the regression this whole change is about.
    for (const code of [
      'AL', 'AR', 'AZ', 'CA', 'CO', 'CT', 'DC', 'DE', 'GA', 'HI', 'IA', 'ID',
      'IL', 'IN', 'KS', 'KY', 'LA', 'MA', 'MD', 'ME', 'MI', 'MN', 'MO', 'MS',
      'MT', 'NC', 'ND', 'NE', 'NJ', 'NM', 'NY', 'OH', 'OK', 'OR', 'PA', 'RI',
      'SC', 'UT', 'VA', 'VT', 'WI', 'WV',
    ]) {
      expect(stateRules(code).headOfHouseholdBasis).not.toBe('assumed-single');
    }
    /*
     * NONE LEFT. Every state that taxes wages has now been read off its own
     * publication for head of household.
     *
     * Vermont was the last, and it was unblocked by noticing something about
     * our own data rather than by Vermont publishing anything: the brackets
     * shipped here for single and joint filers are 2025 figures, so Vermont's
     * 2025 head-of-household schedule is exactly in step with them rather than
     * a year behind. The vintage objection had been comparing the 2025 table
     * against brackets that were also 2025.
     */
    expect(
      graduated
        .filter((s) => s.headOfHouseholdBasis === 'assumed-single')
        .map((s) => s.code),
    ).toEqual([]);
  });

  /*
   * UTAH HAS NO DEDUCTION AT ALL — the whole allowance is a credit worth 6% of
   * the federal deduction, shrinking by 1.3 cents per dollar of income above a
   * threshold. It was being dropped entirely, because Utah is the only state
   * whose credit is printed in the standard-deduction column of the source.
   *
   * The phase-out is the point. A flat $966 would have understated Utah tax
   * for most people who use this site; nothing at all overcharged everyone
   * below the threshold. Both halves have to be modelled or neither works.
   */
  it('phases out the Utah credit instead of granting or dropping it whole', () => {
    const ut = stateRules('UT');
    expect(ut.personalCredit.single).toBe(966);
    expect(ut.creditPhaseOut?.perDollar).toBe(0.013);

    const at = (salary: number) =>
      computeStateTax({ grossSalary: salary, filingStatus: 'single', children: 0 }, ut).tax;

    // Below the threshold the credit is whole: 4.5% of $18,000 is $810, and
    // the $966 credit wipes it out completely.
    expect(at(18_000)).toBe(0);

    // Above $92,521 it is gone entirely — $966 / 1.3 cents past $18,213 — so
    // the tax is the flat rate with no relief at all. SB 60 of the 2026
    // session cut that rate from 4.50% to 4.45%, retroactive to 1 January.
    expect(at(150_000)).toBeCloseTo(150_000 * 0.0445, 2);

    // In between, partial. At $80,000 the reduction is 1.3% of the $61,787
    // above the threshold, or $803.23, leaving $162.77 of the $966.
    expect(at(80_000)).toBeCloseTo(80_000 * 0.0445 - 162.77, 1);
  });

  it('gives a Utah head of household a bigger credit and a later phase-out', () => {
    const ut = stateRules('UT');
    expect(ut.personalCredit.headOfHousehold).toBe(1_449);
    expect(ut.creditPhaseOut?.threshold.headOfHousehold).toBe(27_320);
    expect(computeStateTax(HOH, ut).tax).toBeLessThan(
      computeStateTax({ ...HOH, filingStatus: 'single' }, ut).tax,
    );
  });

  /*
   * FLAT-RATE STATES DIFFER IN THE ALLOWANCE, which is the finding that made
   * the coverage report widen. Louisiana is the extreme case: one rate for
   * everybody and the full JOINT standard deduction for a head of household.
   */
  it('gives a head of household the joint deduction in flat-rate Louisiana', () => {
    const la = stateRules('LA');
    expect(la.brackets.single).toHaveLength(1);
    expect(la.headOfHouseholdBasis).toBe('marriedJointly');
    expect(computeStateTax(HOH, la).deductions).toBe(la.standardDeduction.marriedJointly);
  });

  it('reads the flat-rate states that publish their own head-of-household figure', () => {
    // North Carolina: 1.5x, from NCDOR's own chart.
    expect(stateRules('NC').standardDeduction.headOfHousehold).toBe(19_125);
    // Colorado and Iowa carry the FEDERAL figure, because the federal
    // deduction is already inside the income they start from.
    expect(stateRules('CO').standardDeduction.headOfHousehold).toBe(24_150);
    expect(stateRules('IA').standardDeduction.headOfHousehold).toBe(24_150);
    expect(stateRules('AZ').standardDeduction.headOfHousehold).toBe(24_150);

    for (const code of ['NC', 'CO', 'IA', 'AZ']) {
      const rules = stateRules(code);
      expect(computeStateTax(HOH, rules).tax, code).toBeLessThan(
        computeStateTax({ ...HOH, filingStatus: 'single' }, rules).tax,
      );
    }
  });

  /*
   * Minnesota was half-done: its own rate schedule was read and its own
   * standard deduction was not, so it looked finished while throwing away
   * $7,700 of deduction. Having own brackets is not a reason to stop looking.
   */
  it('takes the Minnesota head-of-household deduction as well as its brackets', () => {
    const mn = stateRules('MN');
    expect(mn.brackets.headOfHousehold?.[1]?.from).toBe(41_010);
    expect(mn.standardDeduction.headOfHousehold).toBe(23_000);
    expect(computeStateTax(HOH, mn).deductions).toBe(23_000);
  });

  /*
   * Nebraska was blocked once, on a 2025 schedule set against 2026 brackets.
   * What unblocked it was Form 1040N-ES publishing all four statuses for 2026
   * at once, so this pins the thing that made it safe: the single and joint
   * columns on that form are the brackets already shipped here. If a refresh
   * moves those, the head-of-household column beside them is stale too.
   */
  it('keeps the Nebraska head-of-household schedule on the same form as the rest', () => {
    const ne = stateRules('NE');
    expect(ne.brackets.single.map((b) => b.from)).toEqual([0, 4_130, 24_760]);
    expect(ne.brackets.marriedJointly.map((b) => b.from)).toEqual([0, 8_250, 49_530]);
    expect(ne.brackets.headOfHousehold?.map((b) => b.from)).toEqual([0, 7_700, 39_620]);
    expect(ne.standardDeduction.headOfHousehold).toBe(12_950);
  });

  it('reproduces California Schedule Z rather than Schedule X', () => {
    // FTB 2025 Schedule Z: $98,990 of taxable income owes $2,401.65 + 8% over
    // $83,805 at the start of its range. Checking through computeStateTax means
    // the standard deduction is in play, so this pins the SAVING instead.
    //
    // $2,028 when the schedule landed, $2,559 now. California also gives a head
    // of household the JOINT standard deduction — $11,412 against $5,706 — and
    // that was still falling back to the single figure until the FTB numbers
    // were read properly.
    const ca = stateRules('CA');
    const hoh = computeStateTax(HOH, ca).tax;
    const asSingle = computeStateTax({ ...HOH, filingStatus: 'single' }, ca).tax;
    expect(asSingle - hoh).toBeGreaterThan(2_400);
    expect(asSingle - hoh).toBeLessThan(2_800);
  });

  it('leaves links pinned to an older release on the single schedule', () => {
    expect(computeStateTax(HOH, stateRules('CA', '2026.11')).scheduleUsed).toBe('single');
  });

  /*
   * THE LAST EIGHT, and the two that turned out to have nothing of their own.
   *
   * Delaware and Arkansas are pinned here precisely BECAUSE nothing changed.
   * "Checked and identical to single" and "never looked at" produce the same
   * numbers, and the only thing separating them is a record. If a later refresh
   * moves either state's figures apart, this fails and someone re-reads the
   * form instead of assuming the old answer still holds.
   */
  it('leaves Delaware and Arkansas exactly where a single filer sits', () => {
    for (const code of ['DE', 'AR']) {
      const rules = stateRules(code);
      expect(rules.headOfHouseholdBasis).toBe('single');
      expect(rules.standardDeduction.headOfHousehold).toBeUndefined();
      expect(rules.personalExemption.headOfHousehold).toBeUndefined();

      const hoh = computeStateTax(HOH, rules);
      const single = computeStateTax({ ...HOH, filingStatus: 'single' }, rules);
      expect(hoh.tax, code).toBeCloseTo(single.tax, 2);
    }
  });

  /*
   * Montana's is the widest gap found anywhere: HB 337 puts the 4.7% band at
   * $47,500 single and $71,250 head of household for 2026, and the federal
   * standard deduction Montana starts from moves too.
   */
  it('reads Montana HB 337 head-of-household brackets', () => {
    const mt = stateRules('MT');
    expect(mt.brackets.headOfHousehold?.[1]?.from).toBe(71_250);
    expect(mt.standardDeduction.headOfHousehold).toBe(24_150);
    expect(computeStateTax(HOH, mt).scheduleUsed).toBe('headOfHousehold');
  });

  /*
   * Idaho's flat rate sits above an exempt band, and Form 40's worksheet sends
   * a head of household to the JOINT figure: "$4,811 single ... $9,622 married
   * filing jointly, head of household, or qualifying surviving spouse".
   */
  it('sends Idaho to the joint exempt band', () => {
    const id = stateRules('ID');
    expect(id.headOfHouseholdBasis).toBe('marriedJointly');
    expect(computeStateTax(HOH, id).scheduleUsed).toBe('marriedJointly');
    expect(computeStateTax(HOH, id).deductions).toBe(24_150);
  });

  /*
   * Kansas is the only state found with an ADDITIONAL exemption on top of the
   * one everybody gets: $9,160 plus $2,320 for filing as head of household.
   * Reading the standard deduction and stopping there would have missed half.
   */
  it('adds the extra Kansas head-of-household exemption, not just the deduction', () => {
    const ks = stateRules('KS');
    expect(ks.standardDeduction.headOfHousehold).toBe(6_180);
    expect(ks.personalExemption.headOfHousehold).toBe(ks.personalExemption.single + 2_320);
  });

  /*
   * Flat-rate states can still differ, which is the trap: nothing about the
   * brackets hints that anything is different, so it looks checked when it is
   * not. Massachusetts moves the personal exemption and Mississippi moves both
   * allowances.
   */
  it('finds the difference in flat-rate Massachusetts and Mississippi', () => {
    const ma = stateRules('MA');
    expect(ma.personalExemption.headOfHousehold).toBe(6_800);

    const ms = stateRules('MS');
    expect(ms.standardDeduction.headOfHousehold).toBe(3_400);
    expect(ms.personalExemption.headOfHousehold).toBe(8_000);
    // The child that makes you a head of family still gets its own $1,500 —
    // the state's own instructions add them to $9,500 explicitly.
    expect(ms.personalExemption.dependent).toBe(1_500);

    for (const rules of [ma, ms]) {
      expect(computeStateTax(HOH, rules).tax).toBeLessThan(
        computeStateTax({ ...HOH, filingStatus: 'single' }, rules).tax,
      );
    }
  });

  /*
   * DC publishes one rate schedule for everybody and its own deduction by
   * status, at 1.5x the single amount in every year it has published.
   */
  it('gives DC its own deduction on a shared schedule', () => {
    const dc = stateRules('DC');
    expect(dc.brackets.headOfHousehold).toBeUndefined();
    expect(dc.standardDeduction.headOfHousehold).toBe(dc.standardDeduction.single * 1.5);
    expect(computeStateTax(HOH, dc).deductions).toBe(24_150);
  });
});

describe('adultsIn', () => {
  it('counts two adults for both married statuses', () => {
    expect(adultsIn('marriedJointly')).toBe(2);
    expect(adultsIn('single')).toBe(1);
    expect(adultsIn('headOfHousehold')).toBe(1);
  });

  /*
   * This asserted 1 for years. Filing separately is a choice about returns, not
   * about who lives in the house, and reading it as a one-person household
   * under-fed the living-cost basket and under-counted the cars.
   */
  it('does not shrink a couple because they file apart', () => {
    expect(adultsIn('marriedSeparately')).toBe(adultsIn('marriedJointly'));
  });
});

// ---------------------------------------------------------------------------
// Specific states worth pinning
// ---------------------------------------------------------------------------

describe('flat-tax states', () => {
  it('Illinois: 4.95% after a $2,925 per-person exemption', () => {
    const r = computeStateTax(
      { grossSalary: 150_000, filingStatus: 'single', children: 0 },
      stateRules('IL'),
    );
    expect(r.exemptions).toBe(2_925);
    expect(r.taxableIncome).toBe(147_075);
    expect(r.tax).toBeCloseTo(147_075 * 0.0495, 4);
  });

  it('Illinois: dependents increase the exemption', () => {
    const withKids = computeStateTax(
      { grossSalary: 150_000, filingStatus: 'marriedJointly', children: 2 },
      stateRules('IL'),
    );
    // $5,850 for the couple plus $2,925 per child.
    expect(withKids.exemptions).toBe(5_850 + 2_925 * 2);
  });

  it('Pennsylvania: 3.07% flat with no standard deduction', () => {
    expect(tax('PA', 100_000)).toBeCloseTo(3_070, 4);
  });
});

describe('states with a zero-rate band', () => {
  it('Ohio taxes nothing below $26,050', () => {
    expect(tax('OH', 20_000)).toBe(0);
    expect(tax('OH', 150_000)).toBeGreaterThan(0);
  });

  it('the zero band is an explicit first bracket starting at $0', () => {
    for (const code of ['OH', 'ND', 'MS', 'OK', 'ID', 'DE', 'MO']) {
      const b = stateRules(code).brackets.single;
      expect(b[0].from).toBe(0);
      expect(b[0].rate).toBe(0);
    }
  });
});

describe('graduated states', () => {
  it('California reaches its 13.3% top rate only at very high income', () => {
    const rules = stateRules('CA');
    const top = rules.brackets.single.at(-1)!;
    expect(top.rate).toBeCloseTo(0.133, 6);
    expect(top.from).toBeGreaterThan(700_000);
  });

  it('New York taxes a $150k single filer materially more than Illinois', () => {
    expect(tax('NY', 150_000)).toBeGreaterThan(tax('IL', 150_000));
  });

  it('no-tax states return exactly zero at any income', () => {
    for (const code of NO_WAGE_TAX_STATES) {
      expect(tax(code, 1_000_000)).toBe(0);
    }
  });
});

describe('credit-structured allowances', () => {
  it('California applies an exemption CREDIT rather than an income exemption', () => {
    const rules = stateRules('CA');
    expect(rules.personalCredit.single).toBeGreaterThan(0);
    expect(rules.personalExemption.single).toBe(0);
  });

  it('credits reduce tax but never below zero', () => {
    const r = computeStateTax(
      { grossSalary: 12_000, filingStatus: 'marriedJointly', children: 4 },
      stateRules('CA'),
    );
    expect(r.tax).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Properties that must hold for every state
// ---------------------------------------------------------------------------

describe('universal properties', () => {
  /*
   * NEGATIVE TAX IS CORRECT WHERE A CREDIT IS REFUNDABLE — it is a refund, not
   * an error. This test asserted otherwise for every state, which was true
   * only because the refundable credits modelled at the time all keyed off the
   * federal earned income credit, and nothing here supplies one.
   *
   * Idaho broke it honestly: its grocery credit is $155 a head with no income
   * test and an explicit statutory refund, so a family below the tax threshold
   * ends the year owed money. The bound now applies where the state genuinely
   * has no way to pay anything out.
   */
  it.each(ALL_STATE_CODES)('%s: tax is never negative without a refundable credit', (code) => {
    if (stateRules(code).personalCreditRefundable) return;
    for (const salary of [0, 15_000, 60_000, 150_000, 500_000]) {
      expect(tax(code, salary)).toBeGreaterThanOrEqual(0);
    }
  });

  it('pays out rather than floors where the state says refund', () => {
    // Idaho, at an income far below its own filing threshold.
    expect(tax('ID', 0)).toBeLessThan(0);
    // And the refund is exactly the credit, never more.
    expect(tax('ID', 0)).toBeCloseTo(-155, 2);
  });

  it.each(ALL_STATE_CODES)('%s: tax rises monotonically with salary', (code) => {
    let previous = -Infinity;
    for (let salary = 0; salary <= 500_000; salary += 25_000) {
      const t = tax(code, salary);
      expect(t).toBeGreaterThanOrEqual(previous - 1e-9);
      previous = t;
    }
  });

  it.each(ALL_STATE_CODES)('%s: never exceeds 13.3% of gross', (code) => {
    for (const salary of [50_000, 150_000, 1_000_000]) {
      expect(tax(code, salary)).toBeLessThanOrEqual(salary * 0.133);
    }
  });

  it.each(ALL_STATE_CODES)('%s: children never increase tax', (code) => {
    const none = tax(code, 120_000, { filingStatus: 'marriedJointly', children: 0 });
    const three = tax(code, 120_000, { filingStatus: 'marriedJointly', children: 3 });
    expect(three).toBeLessThanOrEqual(none + 1e-9);
  });

  it.each(ALL_FILING_STATUSES)('every state produces a finite number for %s', (status) => {
    for (const code of ALL_STATE_CODES) {
      const t = tax(code, 150_000, { filingStatus: status });
      expect(Number.isFinite(t)).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// The comparison the product actually exists to make
// ---------------------------------------------------------------------------

describe('relocation deltas', () => {
  it('Illinois -> Texas saves the full Illinois liability', () => {
    const il = tax('IL', 150_000);
    const tx = tax('TX', 150_000);
    expect(tx).toBe(0);
    expect(il - tx).toBeGreaterThan(7_000);
  });

  it('California -> Texas saves more than Illinois -> Texas at the same salary', () => {
    expect(tax('CA', 250_000)).toBeGreaterThan(tax('IL', 250_000));
  });

  it('flags the states that allow deducting federal tax (not yet modelled)', () => {
    const flagged = ALL_STATE_CODES.filter((c) => STATE_RULES_2026[c].federalTaxDeductible);
    expect(flagged.sort()).toEqual(['AL', 'MO', 'OR']);
  });
});
