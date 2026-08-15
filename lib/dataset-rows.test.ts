import { describe, expect, it } from 'vitest';

import { DATASET_ROWS } from './dataset-rows';
import { housingDefaults, transportDefaults, allMetros, stateRules } from '@/engine';

/**
 * The data page promises to show every number the calculator uses.
 *
 * It fetched housing and vehicles once per METRO, without a state code, above
 * the loop that produces one row per state part. So both halves of a metro that
 * crosses a state line showed the same metro-wide figures: rent $1,830 and home
 * $614,200 on the New Jersey row and the New York row alike, when the committed
 * data holds $512,300 against $684,700.
 *
 * The calculator itself had been reading the state slice correctly since
 * 2026.5. Only this page had not caught up — which is the worst place for it,
 * because a page that says it shows the real numbers and then shows different
 * ones is worse than no page at all.
 */
describe('the data browser', () => {
  const row = (id: string) => DATASET_ROWS.find((r) => r.id === id)!;

  it('shows the New York metro differently on each side of the line', () => {
    const ny = row('35620:NY');
    const nj = row('35620:NJ');
    expect(ny.homePrice).not.toBe(nj.homePrice);
    expect(ny.rent).not.toBe(nj.rent);
    // The gap the audit named: $684,700 against $512,300.
    expect(ny.homePrice).toBeGreaterThan(nj.homePrice + 100_000);
  });

  /*
   * The real guarantee, and the one that would have caught this: every row must
   * equal what the engine returns for that exact state, not for the metro.
   */
  it('agrees with the engine for every row it shows', () => {
    for (const r of DATASET_ROWS) {
      const metroId = r.id.includes(':') ? r.id.split(':')[0] : r.id;
      const housing = housingDefaults(metroId, undefined, r.state);
      const transport = transportDefaults(metroId, undefined, r.state);
      expect(r.rent, r.id).toBe(housing.medianRentMonthly);
      expect(r.homePrice, r.id).toBe(housing.medianHomePrice);
      expect(r.propertyTaxRate, r.id).toBe(housing.effectivePropertyTaxRate);
      expect(r.vehiclesPerAdult, r.id).toBe(transport.vehiclesPerAdult);
    }
  });

  it('still produces one row per state part', () => {
    const expected = allMetros().reduce((n, m) => n + m.states.length, 0);
    expect(DATASET_ROWS).toHaveLength(expected);
  });

  /*
   * The page claims to show every number the calculator uses. Where a number
   * came FROM is part of that claim: an annual table published in February and
   * a state's own schedule read in August are not the same provenance, and
   * four states legislated their way between the two during 2026.
   */
  it('carries the tax provenance through to the browser', () => {
    for (const r of DATASET_ROWS) {
      const rules = stateRules(r.state);
      expect(r.taxChecked, r.id).toBe(rules.ratesCheckedAgainstState?.checked ?? null);
      expect(r.taxCheckedUrl, r.id).toBe(rules.ratesCheckedAgainstState?.url ?? null);
      // A date without a source to check it against would be a bare assertion.
      if (r.taxChecked !== null) expect(r.taxCheckedUrl, r.id).toBeTruthy();
    }
  });

  it('says housing belongs to the state, not to the metro', () => {
    // It used to read "Housing and price levels are metro-wide; tax is NJ's",
    // which was true when written and became false when the engine started
    // slicing housing by state part.
    const detail = row('35620:NJ').detail;
    expect(detail).toContain("Housing and tax are NJ's");
    expect(detail).toContain('price levels are metro-wide');
  });
});
