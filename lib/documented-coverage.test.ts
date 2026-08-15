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
    // The README writes counts as words. A ternary against one hard-coded
    // number is how this last passed while saying "Ten" of twelve states.
    const words = ['Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen'];
    expect(readme).toContain(`${words[priorYear - 9]} states are on last year's figures`);
    // And names every one of them.
    for (const s of taxing.filter((x) => x.priorYearFigures)) {
      expect(readme, s.code).toContain(s.name.replace('Washington DC', 'DC'));
    }
  });

  it('states the real number of states that itemise', () => {
    const itemising = taxing.filter((s) => s.itemizedDeductions).length;
    expect(readme).toContain(`${itemising === 14 ? 'Fourteen' : String(itemising)} states now let a`);
  });

  /*
   * THE STATES THAT DO IT DIFFERENTLY ARE A SEPARATE COUNT, and it drifted on
   * its own. Illinois was given a property tax credit and the README went on
   * saying "plus two more", naming New Jersey and Wisconsin — which is the
   * exact shape of every other stale claim here: the data grew, the sentence
   * did not, and nothing failed.
   *
   * They cannot be folded into the itemising count because none of them is
   * itemising. New Jersey relieves property tax with no itemising at all,
   * Wisconsin credits mortgage interest and ignores property tax, and Illinois
   * credits property tax to an income cliff. What they share is only that a
   * homeowner gets something back, so the test counts the three fields rather
   * than naming the states.
   */
  it('states the real number of states that relieve housing costs another way', () => {
    const otherWays = taxing.filter(
      (s) => s.propertyTaxRelief || s.itemisedDeductionCredit || s.propertyTaxCredit,
    );
    const words = ['one', 'two', 'three', 'four', 'five', 'six'];
    // The README is hard-wrapped, so "New Jersey" spans two lines. Match on
    // the prose, not on the line breaks.
    const unwrapped = readme.replace(/\s+/g, ' ');
    expect(unwrapped).toContain(`plus ${words[otherWays.length - 1]} more that do it differently`);
    for (const s of otherWays) expect(unwrapped, s.code).toContain(s.name);
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

  /*
   * A YEAR IN A FILENAME IS NOT EVIDENCE OF THE YEAR INSIDE.
   *
   * Three states were counted as "checked against a 2026 document" with source
   * URLs in a /2025/ folder. Opening them settled it and the filenames had
   * been useless in both directions: Nebraska's really is the 2026 schedule,
   * sitting in a 2025 folder under a 2025 revision stamp, while Connecticut's
   * is headed "2025 Tax Calculation Schedule" and Delaware's "RESIDENT
   * INSTRUCTIONS 2025".
   *
   * So this does not test the filename — that would encode the mistake. It
   * tests the thing the filenames made everyone doubt: that any state whose
   * source URL carries a year OTHER than the tax year has been consciously
   * classified, either as a 2026 document or as one of the prior-year states.
   * A state cannot sit in the gap.
   */
  it('has classified every state whose source URL names an older year', () => {
    const olderYearInUrl = taxing.filter((s) => {
      const url = s.ratesCheckedAgainstState?.url ?? '';
      return /20(1\d|2[0-5])/.test(url);
    });

    // If this ever drops to zero the test has stopped checking anything.
    expect(olderYearInUrl.length).toBeGreaterThan(0);

    for (const s of olderYearInUrl) {
      const classified = Boolean(s.priorYearFigures) || s.ratesCheckedAgainstState?.matched != null;
      expect(classified, `${s.code}: source URL names an older year and nobody decided which`).toBe(
        true,
      );
    }
  });

  /*
   * Where a document settles less than the whole state, say so on the state.
   * Delaware's resident instructions carry its allowances and no rate table at
   * all, so "checked against the state's own publication" was a stronger claim
   * than the paper supported.
   */
  it('says so where a source confirms only part of a state', () => {
    for (const s of taxing) {
      const confirms = s.ratesCheckedAgainstState?.confirms;
      if (!confirms) continue;
      expect(confirms.length, s.code).toBeGreaterThan(10);
      // A partial source has to be admitted in prose the reader can see, not
      // only in a field.
      expect(s.priorYearFigures ?? s.notes.join(' '), s.code).toMatch(/not in that document|no rate table|rest on the annual compilation|rather than on/i);
    }
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

  /*
   * THE DATA PAGE SAYS "with the source recorded". It has to be true of all of
   * them.
   *
   * New York City and Yonkers were the two it was not true of. Both sat on a
   * confidence string reading "verify before launch" — written when launch was
   * ahead rather than months behind — with no source field at all, while the
   * page above them counted them among the cities taken "from the levying
   * authority, with the source recorded". Eleven cities had one. The two
   * biggest did not.
   *
   * Nothing was wrong with the rates; both were confirmed against New York's
   * own IT-201 instructions and matched to the last digit. The defect was the
   * claim, which is the kind this file exists for.
   */
  it('records a source for every city that carries its own rate', () => {
    for (const j of named) {
      // The convention here is one descriptive string naming the authority and
      // ending in the URL, not the {url, checked} object the states use.
      expect(j.source, j.id).toBeTruthy();
      expect(j.source ?? '', j.id).toMatch(/https?:\/\//);
      // "verify before launch" outlived the launch by months on two of these.
      expect(j.confidence ?? '', j.id).not.toMatch(/before launch/i);
    }
  });

  /*
   * THE PROVENANCE PROMISE HAS TO BE REACHABLE, not just present.
   *
   * The methodology page says the data page "links to the document it was
   * checked against". For a long time the URL was in a `title` attribute — a
   * hover tooltip. A phone cannot hover and a keyboard cannot reach it, so on
   * the two devices most likely to be used, the document was not there at all.
   *
   * The claim was almost softened to "names the document" instead. Making it
   * true is better: this is the sentence the site's whole honesty argument
   * rests on. So the date is an anchor now, and this fails if it goes back to
   * being a tooltip.
   */
  it('reaches the source document with a real link, not a hover tooltip', () => {
    const browser = readFileSync(new URL('../components/dataset-browser.tsx', import.meta.url), 'utf8');
    expect(browser).toMatch(/href=\{row\.taxCheckedUrl\}/);
    expect(browser).not.toMatch(/title=\{[\s\S]{0,80}Checked against \$\{row\.taxCheckedUrl\}/);

    const methodology = readFileSync(new URL('../app/methodology/page.tsx', import.meta.url), 'utf8');
    expect(methodology.replace(/\s+/g, ' ')).toContain(
      'links to the document it was checked against',
    );
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
