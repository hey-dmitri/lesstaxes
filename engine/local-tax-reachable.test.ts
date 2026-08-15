/**
 * EVERY LOCAL TAX JURISDICTION MUST BE REACHABLE FROM SOME METRO.
 *
 * This exists because the same fault shipped twice, quietly, and both times it
 * was a rate the calculator had stopped using but the data browser was still
 * showing.
 *
 * `avg-IN` went first. Indiana used to fall back to one statewide average of
 * 0.35%; then every Indiana metro got its own counties' rates weighted by
 * population, and the metro-to-jurisdiction map stopped pointing at the
 * average. Nothing removed the average itself, so it sat in the release
 * advertising a rate no comparison could produce.
 *
 * `avg-NY` went the same way for the opposite reason. No New York locality
 * outside New York City and Yonkers levies an income tax at all, so the map
 * deliberately assigns the other New York metros nothing — but the average was
 * still generated from the aggregated table, at 1.60%. That figure is really
 * the city's rate diluted across the whole state. Had anything ever reached
 * it, it would have charged an Albany or Buffalo household a New York City tax
 * they do not owe.
 *
 * Neither was caught by a test, because every test asked "is what we charge
 * correct?" and both were about something we charge nobody. The published data
 * is part of the answer this site gives, so an unreachable jurisdiction is a
 * wrong answer to a reader even when it is a right answer to the engine.
 *
 * The rule is therefore reachability, not usage: if it is in the release, some
 * metro must be able to select it.
 *
 * ONLY THE CURRENT RELEASE IS CHECKED, and that is not laziness. Shipped
 * releases are immutable — a share link sent months ago replays the release it
 * was made against, byte for byte — so every release before this one still
 * carries `avg-IN` and `avg-NY` and always will. Widening this test to all of
 * them would only make it fail at facts nobody is allowed to change. What it
 * has to stop is a THIRD one being written.
 */

import { describe, expect, it } from 'vitest';

import { CURRENT_DATASET_VERSION } from './datasets';
import { allLocalJurisdictions, allMetros, localTaxOptions } from './dataset';

describe(`local tax jurisdictions in ${CURRENT_DATASET_VERSION}`, () => {
  const version = CURRENT_DATASET_VERSION;
  const reachable = new Set(
    allMetros(version).flatMap((metro) =>
      localTaxOptions(metro.id, version).map((o) => o.jurisdictionId),
    ),
  );

  it('are every one of them reachable from at least one metro', () => {
    const orphaned = allLocalJurisdictions(version)
      .map((j) => j.id)
      .filter((id) => !reachable.has(id));

    expect(orphaned).toEqual([]);
  });

  it('are every one of them defined, where a metro offers one', () => {
    const defined = new Set(allLocalJurisdictions(version).map((j) => j.id));
    expect([...reachable].filter((id) => !defined.has(id))).toEqual([]);
  });
});
