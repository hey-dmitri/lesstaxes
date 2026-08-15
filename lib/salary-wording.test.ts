import { describe, expect, it } from 'vitest';

import { salaryWording } from './salary-wording';
import type { FilingStatus } from '@/engine';

const ONE_ADULT: FilingStatus[] = ['single', 'headOfHousehold'];
const COUPLES: FilingStatus[] = ['marriedJointly', 'marriedSeparately'];

describe('what the salary box is asking for', () => {
  it('asks one adult for one salary', () => {
    for (const status of ONE_ADULT) {
      const w = salaryWording(status, 1);
      expect(w.combined).toBe(false);
      expect(w.here).toBe('Salary here');
      expect(w.whose).toContain('Your salary');
    }
  });

  /*
   * The whole point. "Salary" in front of a couple who both work can be read
   * four ways, and three of them put a different number into the engine than
   * the one the answer is computed from.
   */
  it('says both salaries once a couple says both of them earn', () => {
    for (const status of COUPLES) {
      const w = salaryWording(status, 2);
      expect(w.combined).toBe(true);
      expect(w.here).toBe('Both salaries here');
      expect(w.there).toBe('Both salaries there');
      expect(w.whose).toContain('added together');
    }
  });

  it('says whose salary it is when only one of a couple earns', () => {
    for (const status of COUPLES) {
      const w = salaryWording(status, 1);
      expect(w.combined).toBe(false);
      expect(w.whose).toContain('earning spouse');
    }
  });

  /*
   * Filing separately halves the figure and runs it through two returns. A
   * reader whose split is lopsided can only argue with that if they can see it.
   */
  it('warns a separate filer that the total gets split', () => {
    expect(salaryWording('marriedSeparately', 2).whose).toContain('in half');
    expect(salaryWording('marriedSeparately', 2).whose).toContain('two returns');
    expect(salaryWording('marriedJointly', 2).whose).not.toContain('in half');
  });

  it('never claims two incomes for a status that cannot have them', () => {
    // The form resets the earner count when the status stops being a couple,
    // but a stale 2 arriving from an old share link must not relabel the box.
    for (const status of ONE_ADULT) {
      expect(salaryWording(status, 2).combined).toBe(false);
    }
  });

  it('treats a missing or nonsense earner count as one', () => {
    for (const earners of [0, -1, Number.NaN]) {
      expect(salaryWording('marriedJointly', earners).combined).toBe(false);
    }
  });

  it('always says whether the figure is before or after tax', () => {
    for (const status of [...ONE_ADULT, ...COUPLES]) {
      for (const earners of [1, 2]) {
        expect(salaryWording(status, earners).whose).toContain('before tax');
      }
    }
  });
});
