/**
 * A ROW LABEL HAS TO BE TRUE OF THE RELEASE THE ROW WAS COMPUTED FROM.
 *
 * Share links replay their own release, byte for byte, years later if need be.
 * That is the promise that makes a link worth sending. But the labels beside
 * those numbers live in today's code, and they do not travel back — so a label
 * written for how the engine works now can end up sitting over a number that
 * means something else.
 *
 * It happened with utilities. Gas, electricity, water and heating are already
 * inside the Census gross rent figure, so from 2026.8 the category is split:
 * the part inside the rent moves to the housing line, and what is left on the
 * living side is the phone bill. The row was relabelled "Phone" to match.
 *
 * On a link made before 2026.8 there is no split. `living.utilities` is the
 * whole category — $2,609 a year in Chicago against $1,014 after — and
 * `housing.utilities` is zero. Both numbers are correct for that release.
 * What was wrong was a fixed string putting the entire energy bill under the
 * word "Phone", next to a housing row promising utilities it did not contain.
 *
 * So the label is now derived from the release, and this checks the derivation
 * against what the engine actually computes rather than against a remembered
 * version number — the boundary turned out to be 2026.8, not the 2026.10 it
 * was first thought to be.
 */

import { describe, expect, it } from 'vitest';

import { computeCity, defaultCityInputs } from './compare';
import { utilitiesAreSplitOut } from './dataset';
import { ALL_DATASET_VERSIONS } from './datasets';

const HOUSEHOLD = { filingStatus: 'single' as const, children: 0 };
const CHICAGO = '16980';

describe.each([...ALL_DATASET_VERSIONS])('%s', (version) => {
  /*
   * Owning, because a renter's utilities are inside the rent in every release
   * and so cannot tell the two apart. An owner is billed separately, so the
   * split shows up as money moving between two fields.
   */
  const city = computeCity(
    defaultCityInputs(CHICAGO, 100_000, HOUSEHOLD, 'own', undefined, version),
    HOUSEHOLD,
    { datasetVersion: version },
  );

  it('says the utilities are split only when the money has actually moved', () => {
    const claimsSplit = utilitiesAreSplitOut(version);
    const moneyMoved = city.housing.utilities > 0;
    expect(
      claimsSplit,
      `${version}: utilitiesAreSplitOut() says ${claimsSplit}, but the housing line carries ` +
        `$${city.housing.utilities.toFixed(0)} of utilities — so the "Phone" label would be ` +
        `${claimsSplit ? 'right' : 'wrong'} and the flag disagrees`,
    ).toBe(moneyMoved);
  });

  it('leaves the living-side figure looking like a phone bill only when it is one', () => {
    // A whole energy bill for one person is well over $2,000 a year; a phone
    // bill is well under. The gap is wide enough to test without pinning a
    // figure that moves with every price refresh.
    if (utilitiesAreSplitOut(version)) {
      expect(city.living.utilities).toBeLessThan(2_000);
    } else {
      expect(city.living.utilities).toBeGreaterThan(2_000);
    }
  });
});
