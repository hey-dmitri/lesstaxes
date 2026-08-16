/**
 * What a full-time worker is paid, place by place.
 *
 * The salary box opened on one national figure in all 438 places, and pay is
 * the least national thing here: the same measure runs from about $43,500 to
 * about $118,000. It seeded the rent and the house price too, so a national
 * salary in a cheap metro also quoted a home nobody there on that pay would be
 * looking at.
 */

import { describe, expect, it } from 'vitest';

import { ALL_METRO_IDS, allMetros, defaultSalaryFor, medianEarnings, metro } from '.';
import { ALL_DATASET_VERSIONS, CURRENT_DATASET_VERSION } from './datasets';

describe('median earnings', () => {
  it('exists for every one of the 438 places', () => {
    for (const id of ALL_METRO_IDS) {
      expect(medianEarnings(id), `${id} ${metro(id).shortName}`).toBeTruthy();
    }
  });

  /*
   * Bounds sized to catch a parsing error — a suppressed cell read as a
   * negative sentinel, a household figure fetched by mistake, an index stored
   * where dollars belong — not to second-guess the Census. Household income
   * medians run half as high again as these, so the ceiling would catch that
   * swap immediately.
   */
  it('is a plausible full-time wage everywhere', () => {
    for (const id of ALL_METRO_IDS) {
      const pay = medianEarnings(id) as number;
      expect(pay, `${metro(id).shortName}`).toBeGreaterThan(30_000);
      expect(pay, `${metro(id).shortName}`).toBeLessThan(160_000);
    }
  });

  /*
   * The spread is the whole reason this data exists. If a refresh ever
   * flattened it — one figure copied to every place, say — every number would
   * still be plausible and the feature would be gone.
   */
  it('varies widely between places', () => {
    const paid = allMetros().map((m) => medianEarnings(m.id) as number);
    expect(Math.max(...paid) / Math.min(...paid)).toBeGreaterThan(2);
  });

  it('is stated in today money, not the survey year', () => {
    // The dataset holds the published figure; the accessor brings it forward,
    // exactly as the national default is brought forward.
    for (const id of ['16980', '35620', 'rest-of-WY']) {
      const published = metro(id).medianEarnings as number;
      expect(medianEarnings(id) as number).toBeGreaterThan(published);
    }
  });
});

describe('what the salary box opens on', () => {
  it('uses the local figure once a place is chosen', () => {
    for (const id of ALL_METRO_IDS) {
      expect(defaultSalaryFor(id)).toBe(medianEarnings(id));
    }
  });

  it('falls back to the national median before either city is picked', () => {
    const national = defaultSalaryFor();
    expect(national).toBeGreaterThan(60_000);
    expect(national).toBeLessThan(80_000);
  });

  /*
   * A SHARE LINK PINNED TO AN OLDER RELEASE MUST NOT CRASH OR CHANGE.
   *
   * Those releases have no earnings figure at all, and the promise the whole
   * version-pinning machinery exists to keep is that whoever opens the link
   * sees the numbers the sender saw. So the accessor returns null there and
   * the box falls back to the national figure those releases used.
   */
  it('answers for every shipped release, old ones included', () => {
    const older = ALL_DATASET_VERSIONS.filter((v) => v !== CURRENT_DATASET_VERSION);
    expect(older.length).toBeGreaterThan(0);
    for (const version of older) {
      expect(() => defaultSalaryFor('16980', version), version).not.toThrow();
      expect(defaultSalaryFor('16980', version), version).toBeGreaterThan(0);
    }
  });

  /*
   * Local pay shipped with 2026.28. Releases cut before it have no figure at
   * all, and the accessor has to say so rather than inventing one — that is
   * what keeps a pinned link answering exactly as it did the day it was sent.
   */
  it('has nothing to say about releases cut before it shipped', () => {
    for (const version of ['2026.25', '2026.26', '2026.27']) {
      expect(medianEarnings('16980', version), version).toBeNull();
      expect(defaultSalaryFor('16980', version), version).toBe(defaultSalaryFor(undefined, version));
    }
  });
});
