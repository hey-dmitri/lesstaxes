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
  it.each(ALL_STATE_CODES)('%s: tax is never negative', (code) => {
    for (const salary of [0, 15_000, 60_000, 150_000, 500_000]) {
      expect(tax(code, salary)).toBeGreaterThanOrEqual(0);
    }
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
