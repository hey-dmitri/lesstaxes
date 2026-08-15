/**
 * The published list of what this engine does not model.
 *
 * The methodology page renders these straight from the dataset rather than
 * from prose typed into the page. A hand-written list of known errors goes
 * stale the first time somebody fixes one, and a stale admission is worse than
 * none: it either claims a fault that is no longer there, or stays quiet about
 * one that is.
 */

import { describe, expect, it } from 'vitest';

import { ALL_STATE_CODES, stateRules } from './rules';

describe('prior-year figures', () => {
  /*
   * Where a state has not published this year's brackets, we ship its last
   * published ones rather than nothing, and say which states those are.
   *
   * The direction matters and is worth stating: prices rise, so last year's
   * bands are slightly narrow and last year's allowances slightly small. The
   * figures therefore show marginally MORE tax than the reader will owe. An
   * error that runs against us is the only kind that is safe to ship quietly,
   * and we do not ship it quietly anyway.
   */
  it('names every state carrying last year figures, in a full sentence', () => {
    const onPriorYear = ALL_STATE_CODES.map((c) => stateRules(c)).filter((s) => s.priorYearFigures);
    expect(onPriorYear.length).toBeGreaterThan(5);
    for (const s of onPriorYear) {
      expect(s.priorYearFigures!.length, s.code).toBeGreaterThan(60);
      expect(s.priorYearFigures!.trim().endsWith('.'), s.code).toBe(true);
      // It must say WHICH year, or the admission is not actionable.
      expect(s.priorYearFigures!, s.code).toMatch(/202\d/);
    }
  });

  it('covers the states known to have published nothing for 2026', () => {
    // Ohio came OFF this list: its 2026 schedule turned out to be in the
    // statute all along, even though the Department's own rates page still
    // stops at 2025 and made it look unpublished.
    for (const code of ['CA', 'OR', 'VT', 'AL']) {
      expect(stateRules(code).priorYearFigures, code).toBeTruthy();
    }
    expect(stateRules('OH').priorYearFigures).toBeNull();
  });

  /*
   * A state cannot be both fully verified against its own 2026 publication and
   * shipping last year's figures with nothing to explain it. Where both are
   * true the prior-year note is what reconciles them, so it must exist.
   */
  it('leaves no state silently mixing vintages', () => {
    for (const code of ALL_STATE_CODES) {
      const s = stateRules(code);
      if (!s.hasWageIncomeTax) continue;
      const checked = s.ratesCheckedAgainstState;
      if (checked && !checked.matched && !s.priorYearFigures) {
        // Corrected against a real 2026 source: nothing to reconcile.
        expect(checked.url, code).toBeTruthy();
      }
    }
  });
});

describe('stated modelling gaps', () => {
  const withGaps = ALL_STATE_CODES.map((c) => stateRules(c)).filter(
    (s) => s.modellingGaps.length > 0,
  );

  it('exists on every state, empty or not', () => {
    for (const code of ALL_STATE_CODES) {
      expect(Array.isArray(stateRules(code).modellingGaps), code).toBe(true);
    }
  });

  it('covers the states with rules we know we skip', () => {
    // Not an exhaustive list — a floor. If a refresh silently drops one of
    // these admissions, that is the page quietly overclaiming.
    for (const code of ['CA', 'CT', 'NJ', 'NY', 'OR', 'AL', 'MD', 'ME', 'MN']) {
      expect(stateRules(code).modellingGaps.length, code).toBeGreaterThan(0);
    }
  });

  /*
   * Every gap must say WHICH WAY IT RUNS. "We do not model X" tells a reader
   * nothing they can act on; "so the tax shown is higher than the truth" tells
   * them whether the verdict they are looking at is flattering or harsh, which
   * is the only part that changes a decision.
   */
  it('says which direction each error runs', () => {
    const direction =
      /higher than the true|lower than the true|errs against the reader|too much|too little|slightly small|slightly low|slightly high/i;
    for (const s of withGaps) {
      for (const gap of s.modellingGaps) {
        expect(gap, `${s.code}: ${gap}`).toMatch(direction);
      }
    }
  });

  /*
   * A NOTE THAT SAYS "NOT MODELLED" ABOUT SOMETHING WE NOW MODEL IS WORSE THAN
   * NO NOTE, and this exact thing happened three times in one afternoon:
   * Connecticut's add-backs, Maryland's itemising and New York's itemising
   * were all written up as gaps, then implemented, and the admissions stayed
   * behind claiming otherwise.
   *
   * Nothing failed, because prose is invisible to a type system. So each
   * capability is paired with the words a note would use to disclaim it, and
   * a state that has the capability may not carry the disclaimer.
   */
  it('never claims a gap the state no longer has', () => {
    const claims: Array<[string, (s: ReturnType<typeof stateRules>) => boolean, RegExp]> = [
      ['itemising', (s) => s.itemizedDeductions !== null, /itemis\w+[\s\S]{0,120}not modelled|not modelled[\s\S]{0,120}itemis/i],
      ['add-backs', (s) => (s.taxAddBacks ?? []).length > 0, /recaptur\w+[^.]*not modelled|neither is modelled/i],
      ['a credit that is a share of tax', (s) => s.taxCreditFraction !== null, /personal (tax )?credit[^.]*not modelled/i],
      ['the federal tax subtraction', (s) => s.federalTaxDeduction !== null, /subtract[^.]*federal income tax[^.]*not modelled/i],
      ['property tax relief', (s) => s.propertyTaxRelief !== null, /property tax deduction[^.]*not modelled/i],
      /*
       * These four slipped past the first version of this guard, which only
       * listed the capabilities that had gone stale by the time it was
       * written. A guard built from the failures it already knows about is a
       * guard that only ever catches those.
       */
      /*
       * Matched across the WHOLE note, not within one sentence. The first
       * version required the capability and the disclaimer to appear between
       * the same two full stops, and Massachusetts split them across
       * consecutive sentences — so the guard read a false claim and passed it.
       */
      ['the payroll tax deduction', (s) => s.payrollTaxDeduction !== null, /social security and medicare[\s\S]*not modelled/i],
      ['a credit for two-earner couples', (s) => s.taxCreditFraction?.requiresTwoEarners === true, /both work[^.]*not modelled|two-earner[^.]*not modelled/i],
      ['a property tax credit', (s) => s.propertyTaxCredit !== null, /property tax credit[^.]*not modelled/i],
      ['an allowance phase-out', (s) => s.allowancePhaseOut !== null, /phase[- ]out[^.]*not modelled/i],
    ];

    for (const code of ALL_STATE_CODES) {
      const rules = stateRules(code);
      for (const [capability, has, disclaimer] of claims) {
        if (!has(rules)) continue;
        for (const gap of rules.modellingGaps) {
          expect(
            disclaimer.test(gap),
            `${code} models ${capability} but a note still disclaims it: "${gap}"`,
          ).toBe(false);
        }
      }
    }
  });

  it('writes them as sentences, not shorthand', () => {
    for (const s of withGaps) {
      for (const gap of s.modellingGaps) {
        expect(gap.length, s.code).toBeGreaterThan(60);
        expect(gap.trim().endsWith('.'), `${s.code}: ${gap}`).toBe(true);
      }
    }
  });
});
