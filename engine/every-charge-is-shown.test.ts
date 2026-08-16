/**
 * EVERY CHARGE THE ENGINE MAKES MUST HAVE A ROW ON THE RESULTS TABLE.
 *
 * The failure this exists to stop: the state disability contribution was
 * computed correctly, subtracted correctly, and included correctly in "in your
 * pocket" — and had no row. So a reader who added the visible rows up got a
 * number $1,560 larger than the headline in the eleven states that levy one,
 * with nothing on the page to explain the gap. Nothing was miscalculated. The
 * page simply did not confess to a charge it was making.
 *
 * That is a class of bug no arithmetic test can see, because the arithmetic
 * was right. It needs a test that knows what the TABLE shows, which is what
 * the list below is: the exact set of fields `components/results.tsx` renders
 * as rows, written out by hand so that adding a charge to the engine without
 * adding a row to the table breaks the build.
 *
 * Keeping the list here rather than importing it from the component is
 * deliberate. Importing would make the two agree by construction and prove
 * nothing — the point is that a human wrote down what the page shows and the
 * engine has to match it.
 *
 * WHEN THIS FAILS, THE FIX IS USUALLY THE TABLE, NOT THIS FILE. A new field
 * appearing in the residual means the engine started charging something the
 * reader cannot see. Add the row first; only then add the name here.
 */

import { describe, expect, it } from 'vitest';

import { compare, defaultCityInputs, differenceRows } from './compare';
import { CURRENT_DATASET_VERSION } from './datasets';
import type { CityResult, FilingStatus } from './types';

/** Exactly the rows in the results table, in the order they are rendered. */
const sumOfVisibleRows = (c: CityResult): number =>
  c.grossSalary -
  c.tax.federal -
  c.tax.state -
  c.tax.local -
  c.tax.fica -
  c.tax.statePayroll -
  // The housing row is shelter plus the separately billed utilities, which is
  // what its label says. For a renter the utilities are already inside the
  // rent and this field is zero.
  (c.housing.shelter + c.housing.utilities) -
  c.housing.propertyTax -
  (c.housing.maintenance + c.housing.insurance) -
  c.living.transport -
  c.living.food -
  // Labelled "Phone", because gas, electricity, water and heating moved into
  // the housing line where the rent figure was already paying for them.
  c.living.utilities -
  c.living.healthcare -
  c.living.other -
  c.salesTax;

/*
 * Chosen to make the test hard rather than convenient: California and New York
 * both levy a state disability contribution AND a local income tax, New York
 * City has its own brackets, Texas has no income tax at all, and Chicago picks
 * up an Indiana-side comparison. Renting and owning are both covered because
 * upkeep and utilities land in different rows for each.
 */
const PLACES = ['35620', '31080', '16980', '19100', '12420', '41860'] as const;

const HOUSEHOLDS: Array<{ filingStatus: FilingStatus; children: number }> = [
  { filingStatus: 'single', children: 0 },
  { filingStatus: 'marriedJointly', children: 2 },
  { filingStatus: 'headOfHousehold', children: 1 },
];

describe('the results table', () => {
  it.each(PLACES)('accounts for every charge in %s', (metroId) => {
    for (const household of HOUSEHOLDS) {
      for (const tenure of ['rent', 'own'] as const) {
        for (const salary of [60_000, 150_000, 400_000]) {
          const result = compare({
            datasetVersion: CURRENT_DATASET_VERSION,
            household,
            origin: defaultCityInputs(metroId, salary, household, tenure),
            destination: defaultCityInputs('19100', salary, household, tenure),
          });

          for (const side of [result.origin, result.destination]) {
            const residual = sumOfVisibleRows(side) - side.leftover;
            expect(
              Math.abs(residual),
              `${metroId} ${household.filingStatus} ${tenure} $${salary}: the rows a reader ` +
                `can see miss $${residual.toFixed(2)} of what the engine charged`,
            ).toBeLessThan(0.01);
          }
        }
      }
    }
  });

  /*
   * The same question asked of take-home, which is the other number on the
   * page a reader can check by hand: gross minus the tax rows, and nothing
   * else. If a mandatory deduction is ever added outside `tax`, this catches
   * it even where the leftover check above would not.
   */
  it.each(PLACES)('shows every mandatory deduction between gross and take-home in %s', (metroId) => {
    for (const household of HOUSEHOLDS) {
      const result = compare({
        datasetVersion: CURRENT_DATASET_VERSION,
        household,
        origin: defaultCityInputs(metroId, 150_000, household, 'rent'),
        destination: defaultCityInputs('19100', 150_000, household, 'rent'),
      });

      for (const side of [result.origin, result.destination]) {
        const shown =
          side.grossSalary -
          side.tax.federal -
          side.tax.state -
          side.tax.local -
          side.tax.fica -
          side.tax.statePayroll;
        expect(Math.abs(shown - side.takeHome)).toBeLessThan(0.01);
      }
    }
  });

  /*
   * AND THE SAME QUESTION OF THE DIFFERENCE, which is the figure the panel
   * actually leads with.
   *
   * The verdict panel lists the salary, every tax and every living cost, and
   * prints a difference above them. Those rows are the reader's only way to
   * check the difference, so their sum has to BE the difference — to the cent,
   * not approximately.
   *
   * It is a separate check from the two above because the rows are a separate
   * list. Both of the charges this file was written for — the state disability
   * contribution and owner upkeep — were in leftover and missing from the
   * explanation, which is exactly what a residual here would catch.
   */
  it.each(PLACES)('itemises the whole difference in %s', (metroId) => {
    for (const household of HOUSEHOLDS) {
      for (const tenure of ['rent', 'own'] as const) {
        // Including a salary change, because the salary row is the one line
        // that runs the other way and it is easy to sign wrongly.
        for (const [salary, offer] of [
          [60_000, 60_000],
          [150_000, 165_000],
          [400_000, 350_000],
        ]) {
          const result = compare({
            datasetVersion: CURRENT_DATASET_VERSION,
            household,
            origin: defaultCityInputs(metroId, salary, household, tenure),
            destination: defaultCityInputs('19100', offer, household, tenure),
          });

          const rows = differenceRows(result);
          expect(
            Math.abs(rows.total - result.delta),
            `${metroId} ${household.filingStatus} ${tenure} $${salary}→$${offer}: the rows ` +
              `add to ${rows.total.toFixed(2)} and the headline says ${result.delta.toFixed(2)}`,
          ).toBeLessThan(0.01);
        }
      }
    }
  });
});
