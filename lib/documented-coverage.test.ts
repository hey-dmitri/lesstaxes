/**
 * The public pages must not claim coverage the data does not have.
 *
 * Every coverage figure on the methodology page and in the README drifted at
 * least once: "40 of 42 states" while the build reported 42, "only California
 * itemises" while fourteen states did, six cities described as using a state
 * average after they had been given their own rates.
 *
 * None of it failed anything, because prose is invisible to a type system —
 * and the site's honesty about its own limits is part of what it is selling.
 * So the counts are read from the data on the page itself, and this pins the
 * few that are still written by hand.
 */

import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { ALL_STATE_CODES, stateRules, localJurisdiction, localTaxOptions, allMetros } from '@/engine';

const taxing = ALL_STATE_CODES.map((c) => stateRules(c)).filter((s) => s.hasWageIncomeTax);
const readme = readFileSync(new URL('../README.md', import.meta.url), 'utf8');

describe('what the README claims', () => {
  it('states the real number of low-income credits', () => {
    const modelled = taxing.filter((s) => s.earnedIncomeCredit).length;
    expect(readme).toContain(`State Earned Income Credits cover ${modelled} states`);
  });

  it('does not still describe Indiana as a flat state average', () => {
    // It was 0.35% statewide against real county rates of 0.50% to 3.00%.
    expect(readme).not.toMatch(/we apply 0\.35% statewide/);
  });

  /*
   * Six cities were listed as sitting on a state average long after they were
   * given their own published rates.
   */
  it('does not claim a city uses the state average when it has its own rate', () => {
    for (const id of ['cleveland', 'pittsburgh', 'louisville', 'kansas-city', 'st-louis', 'baltimore-city']) {
      // A named city rate, not the "avg-XX" fallback it used to sit on.
      expect(localJurisdiction(id).id, id).not.toMatch(/^avg-/);
      expect(localTaxOptions(
        allMetros().find((m) => localTaxOptions(m.id).some((o) => o.jurisdictionId === id))!.id,
      ).map((o) => o.jurisdictionId), id).toContain(id);
    }
    expect(readme).not.toMatch(/Baltimore and Portland do not yet/);
  });

  it('quotes a test count that is not wildly stale', () => {
    const claimed = Number(/\*\*(\d+) tests\*\*/.exec(readme)?.[1]);
    expect(claimed).toBeGreaterThan(900);
  });
});

describe('every Indiana metro carries a county rate', () => {
  it('gives each one its own, not a state average', () => {
    const indiana = allMetros().filter((m) => m.states.includes('IN'));
    expect(indiana.length).toBeGreaterThan(10);
    for (const m of indiana) {
      const options = localTaxOptions(m.id, undefined, 'IN');
      expect(options, m.id).toHaveLength(1);
      const rules = localJurisdiction(options[0].jurisdictionId);
      // Well above the 0.35% state average this replaced, and below the
      // highest county in the state.
      expect(rules.kind === 'flatRate' && rules.rate, m.id).toBeGreaterThan(0.01);
      expect(rules.kind === 'flatRate' && rules.rate, m.id).toBeLessThanOrEqual(0.03);
    }
  });
});
