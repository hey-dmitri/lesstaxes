import { describe, expect, it } from 'vitest';

import { computeCity, defaultCityInputs } from './compare';
import {
  ALL_METRO_IDS,
  DATASET_VERSION,
  metro,
  salesTaxRules,
  spendingIncludesSalesTax,
} from './dataset';
import type { Household } from './types';

/**
 * Sales tax was charged twice.
 *
 * The living-cost basket comes from the BLS Consumer Expenditure Survey, and
 * BLS defines an expenditure as the transaction cost INCLUDING sales and excise
 * tax. Where a respondent reported a price without tax, BLS adds it before
 * publishing, and an analyst checks that it was added exactly once. Every
 * figure in that basket is what the household handed over at the till.
 *
 *   https://www.bls.gov/cex/csxfaqs.htm            question 14
 *   https://www.bls.gov/cex/csxgloss.htm           "including excise and sales taxes"
 *   https://www.bls.gov/opub/hom/cex/concepts.htm  "include all applicable sales and excise taxes"
 *
 * The engine then applied a state sales tax rate to that same basket and added
 * the result as its own line. Once inside the grocery bill, once beside it.
 */

const SINGLE: Household = { filingStatus: 'single', children: 0, earners: 1 };

describe('the basket already has sales tax in it', () => {
  it('says so in the dataset, with a source', () => {
    expect(spendingIncludesSalesTax()).toBe(true);
  });

  it('charges nothing extra, in every state', () => {
    // Sampled across the country so no state's rate can sneak back in.
    for (const metroId of ALL_METRO_IDS.filter((_, i) => i % 7 === 0)) {
      for (const stateCode of metro(metroId).states) {
        const result = computeCity(
          { ...defaultCityInputs(metroId, 150_000, SINGLE), stateCode },
          SINGLE,
        );
        expect(result.salesTax).toBe(0);
      }
    }
  });

  it('leaves leftover as take-home minus housing minus living, with nothing else', () => {
    const result = computeCity(defaultCityInputs('16980', 150_000, SINGLE), SINGLE);
    expect(result.leftover).toBeCloseTo(
      result.takeHome - result.housing.total - result.living.total,
      6,
    );
  });

  /*
   * Removing the line costs something, and it should be visible rather than
   * quietly assumed away. The basket carries whatever sales tax its surveyed
   * households paid, which is a national blend, so two states at opposite ends
   * of the rate table now look identical on this line. Tennessee charges the
   * most and Oregon charges none.
   *
   * Modelling the DIFFERENCE properly means stripping the embedded average out
   * of the basket and applying the local rate instead, and the survey does not
   * publish the embedded amount per category. An unmodelled difference of a few
   * hundred dollars is a smaller error than a doubled charge, so this waits for
   * data that can support it. The rates stay in the dataset for when it comes.
   */
  it('keeps the published rates, unused, for the day the difference can be modelled', () => {
    expect(salesTaxRules('OR').combinedRate).toBe(0);
    expect(salesTaxRules('TN').combinedRate).toBeGreaterThan(0.09);
  });
});

/*
 * PROJECT.md section 9.2. A link shared before this recomputes the way it did
 * when it was made, double count included, rather than silently changing under
 * whoever it was sent to.
 */
describe('links pinned to an older release', () => {
  it('still charges the separate line', () => {
    expect(spendingIncludesSalesTax('2026.6')).toBe(false);
    const older = computeCity(defaultCityInputs('16980', 150_000, SINGLE), SINGLE, {
      datasetVersion: '2026.6',
    });
    expect(older.salesTax).toBeGreaterThan(0);
  });

  it('and the current release does not', () => {
    expect(DATASET_VERSION).not.toBe('2026.6');
    expect(computeCity(defaultCityInputs('16980', 150_000, SINGLE), SINGLE).salesTax).toBe(0);
  });
});
