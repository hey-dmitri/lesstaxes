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

  it('writes them as sentences, not shorthand', () => {
    for (const s of withGaps) {
      for (const gap of s.modellingGaps) {
        expect(gap.length, s.code).toBeGreaterThan(60);
        expect(gap.trim().endsWith('.'), `${s.code}: ${gap}`).toBe(true);
      }
    }
  });
});
