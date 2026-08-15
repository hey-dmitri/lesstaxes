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

import {
  ALL_STATE_CODES,
  allLocalJurisdictions,
  allMetros,
  localJurisdiction,
  localTaxOptions,
  stateRules,
} from '@/engine';

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

  /*
   * NO HARD-CODED TEST COUNT, because it cannot be kept true.
   *
   * The first version of this asserted only "more than 900", which is why a
   * stale 969 sailed past an actual 974 — a bound that loose asserts nothing,
   * and it was written to catch drift while being the drift. Checking it
   * properly would mean running the suite from inside the suite.
   *
   * So the number is gone from the README instead. A figure that changes on
   * every commit and is verified by nobody is not evidence of anything; the
   * badge on the repository already reports it, and always correctly.
   */
  /*
   * Every count in that list has now gone stale at least once, so each one the
   * README still states by hand is checked against the generated data.
   */
  it('states the real number of states carrying a gap note', () => {
    const withGaps = taxing.filter((s) => s.modellingGaps.length > 0).length;
    const words = ['Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen',
      'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen', 'Twenty'];
    expect(readme).toContain(`${words[withGaps - 10]} states carry a note`);
  });

  it('states the real number of states on prior-year figures', () => {
    const priorYear = taxing.filter((s) => s.priorYearFigures).length;
    expect(readme).toContain(`${priorYear === 10 ? 'Ten' : String(priorYear)} states are on last year's figures`);
    // And names every one of them.
    for (const s of taxing.filter((x) => x.priorYearFigures)) {
      expect(readme, s.code).toContain(s.name.replace('Washington DC', 'DC'));
    }
  });

  it('states the real number of states that itemise', () => {
    const itemising = taxing.filter((s) => s.itemizedDeductions).length;
    expect(readme).toContain(`${itemising === 14 ? 'Fourteen' : String(itemising)} states now let a`);
  });

  it('does not quote a test count it cannot keep true', () => {
    expect(readme).not.toMatch(/\*\*\d+ tests\*\*/);
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

/**
 * Provenance, which is a different claim from coverage.
 *
 * The build reported "42 of 42 read off the state's own 2026 publication" by
 * counting any recorded source at all. Two of those were republishers rather
 * than the state, and ten states ship the prior year's figures — so the
 * sentence was stronger than the evidence twice over.
 */
describe('what a recorded source actually is', () => {
  const official =
    /\.gov(\/|$|:)|\.state\.[a-z]{2}\.us|legislature\.|\blegis\.|capitol\.|revisor\.|ksrevisor\.|mca\.legmt/i;

  const sources = taxing.flatMap((s) =>
    [
      ['rates', s.ratesCheckedAgainstState?.url],
      ['head of household', s.headOfHouseholdSource?.url],
    ]
      .filter(([, url]) => url)
      .map(([what, url]) => ({ code: s.code, what, url: url as string })),
  );

  it('records a source for every taxing state', () => {
    for (const s of taxing) {
      expect(s.ratesCheckedAgainstState?.url, s.code).toBeTruthy();
      expect(s.headOfHouseholdSource?.url, s.code).toBeTruthy();
    }
  });

  /*
   * Not zero — New Mexico's revenue department serves its forms through
   * JavaScript that cannot be fetched, so its booklet is recorded from a
   * mirror. The point is that the number stays small and visible rather than
   * being absorbed into a claim that everything came from the state.
   */
  it('keeps republished sources few, and never claims they are the state', () => {
    const republished = sources.filter((s) => !official.test(s.url));
    expect(republished.length).toBeLessThanOrEqual(2);
    for (const s of republished) expect(s.code).toBe('NM');
  });

  it('does not describe prior-year figures as this year\'s document', () => {
    // Ten states ship last year's figures; the coverage sentence must not
    // call all 42 a 2026 publication.
    const priorYear = taxing.filter((s) => s.priorYearFigures).length;
    expect(priorYear).toBeGreaterThan(0);
    expect(readme).not.toMatch(/all \d+ .{0,40}2026 publication/i);
  });
});

/**
 * The pages that describe local tax coverage.
 *
 * The data page named six cities and listed seven more as "still on their
 * state's average" for weeks after every one of them was given a published
 * rate — a page about data quality, wrong about its own data.
 */
describe('local tax coverage as described', () => {
  const named = allLocalJurisdictions().filter((j) => !j.isStateAverage);

  it('has more rules than cities, because Portland levies two', () => {
    const nonIndiana = named.filter((j) => !j.id.startsWith('in-'));
    const cities = new Set(nonIndiana.map((j) => (j.id.startsWith('portland-') ? 'portland' : j.id)));
    expect(nonIndiana.length).toBe(cities.size + 1);
    expect(cities.size).toBe(13);
  });

  it('does not still list a city as being on a state average', () => {
    const page = readFileSync(new URL('../app/data/page.tsx', import.meta.url), 'utf8');
    expect(page).not.toMatch(/Six cities carry their own/);
    expect(page).not.toMatch(/Baltimore and Portland are still on/);
  });

  /*
   * Seven states legislated after the February table, not the four that were
   * known when the sentence was first written.
   */
  it('counts every state that legislated after the bracket table', () => {
    const browser = readFileSync(new URL('../components/dataset-browser.tsx', import.meta.url), 'utf8');
    expect(browser).toContain('seven states');
    expect(browser).not.toMatch(/which four states/);
  });
});
