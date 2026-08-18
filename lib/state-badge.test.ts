/**
 * The badge above each city is the first tax fact anybody reads, and for most
 * comparisons it is the one that decides the answer. It used to say "GA ·
 * 4.99% flat", which names neither the tax nor who charges it.
 */

import { describe, expect, it } from 'vitest';

import { ALL_FILING_STATUSES, ALL_STATE_CODES, stateRules } from '@/engine';
import { stateName, stateTaxBadge } from '@/lib/state-badge';

describe('the state tax badge', () => {
  it('writes out every state the engine knows', () => {
    for (const code of ALL_STATE_CODES) {
      // DC is its initials in ordinary use, so it is the one legitimate
      // two-letter answer. Anything else falling through means a missing name.
      if (code === 'DC') continue;
      expect(stateName(code), code).not.toBe(code);
      expect(stateName(code).length, code).toBeGreaterThan(3);
    }
  });

  it('says what the number is, for every state and filing status', () => {
    for (const code of ALL_STATE_CODES) {
      for (const filing of ALL_FILING_STATUSES) {
        const badge = stateTaxBadge(code, filing);
        expect(badge, `${code} ${filing}`).toContain('income tax');
        expect(badge, `${code} ${filing}`).toContain(stateName(code));
      }
    }
  });

  it('says a state charges nothing rather than leaving it blank', () => {
    for (const code of ALL_STATE_CODES) {
      if (stateRules(code).hasWageIncomeTax) continue;
      expect(stateTaxBadge(code, 'single')).toBe(`${stateName(code)} charges no income tax`);
    }
  });

  it('distinguishes a flat rate from a graduated one', () => {
    // Illinois is flat; New York runs a ladder.
    expect(stateTaxBadge('IL', 'single')).toBe('Illinois income tax: 4.95% flat');
    expect(stateTaxBadge('NY', 'single')).toMatch(/^New York income tax: up to \d/);
  });
});
