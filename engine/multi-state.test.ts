import { describe, expect, it } from 'vitest';

import { computeCity, defaultCityInputs } from './compare';
import {
  allMetros,
  isMultiState,
  localTaxOptions,
  metro,
  resolveLocalJurisdictions,
  resolveStateCode,
  salesTaxRules,
} from './dataset';
import { stateRules } from './tax/rules';
import type { Household } from './types';

const SINGLE: Household = { filingStatus: 'single', children: 0 };

const NEW_YORK = '35620'; // New York-Newark-Jersey City, NY-NJ
const PHILADELPHIA = '37980'; // PA-NJ-DE-MD
const AUSTIN = '12420'; // single state

/**
 * 43 of the 438 locations straddle a state line. Every one of them used to be
 * reduced to a single primaryState which then drove state income tax, sales
 * tax, and which city income taxes could reach you. Searching "Newark" landed
 * on the New York metro and quoted New York's tax system plus New York City's
 * resident tax — to someone in New Jersey.
 */
describe('metros that cross a state line', () => {
  it('there are enough of them to matter', () => {
    const multi = allMetros().filter((m) => m.states.length > 1);
    expect(multi.length).toBeGreaterThanOrEqual(40);
    expect(isMultiState(NEW_YORK)).toBe(true);
    expect(isMultiState(AUSTIN)).toBe(false);
  });

  it('uses the state you chose for income tax, not the metro name', () => {
    const ny = computeCity({ ...defaultCityInputs(NEW_YORK, 150_000, SINGLE), stateCode: 'NY' }, SINGLE);
    const nj = computeCity({ ...defaultCityInputs(NEW_YORK, 150_000, SINGLE), stateCode: 'NJ' }, SINGLE);

    expect(ny.stateCode).toBe('NY');
    expect(nj.stateCode).toBe('NJ');
    expect(ny.tax.state).not.toBeCloseTo(nj.tax.state, 0);
  });

  it('uses the state you chose for sales tax too', () => {
    const ny = computeCity({ ...defaultCityInputs(NEW_YORK, 150_000, SINGLE), stateCode: 'NY' }, SINGLE);
    const nj = computeCity({ ...defaultCityInputs(NEW_YORK, 150_000, SINGLE), stateCode: 'NJ' }, SINGLE);

    // Sales tax was taken from the metro's first state as well, so this half
    // of the error was invisible behind the income-tax half.
    expect(salesTaxRules('NY').combinedRate).not.toBe(salesTaxRules('NJ').combinedRate);
    expect(ny.salesTax).not.toBeCloseTo(nj.salesTax, 0);
  });

  it('does not let New York City tax reach New Jersey', () => {
    // The reported bug in full: nyc is marked defaultApplies for the whole
    // metro, so a Newark resident was charged NYC resident tax by default.
    expect(localTaxOptions(NEW_YORK, undefined, 'NY').map((o) => o.jurisdictionId)).toContain('nyc');
    expect(localTaxOptions(NEW_YORK, undefined, 'NJ')).toHaveLength(0);

    // Even if the opt-in is somehow set, the jurisdiction cannot apply.
    const forced = resolveLocalJurisdictions(NEW_YORK, { nyc: true }, undefined, 'NJ');
    expect(forced).toHaveLength(0);

    const nj = computeCity({ ...defaultCityInputs(NEW_YORK, 150_000, SINGLE), stateCode: 'NJ' }, SINGLE);
    expect(nj.tax.local).toBe(0);
  });

  it('is worth about $6,100 a year at $150,000, which is why it mattered', () => {
    const ny = computeCity({ ...defaultCityInputs(NEW_YORK, 150_000, SINGLE), stateCode: 'NY' }, SINGLE);
    const nj = computeCity({ ...defaultCityInputs(NEW_YORK, 150_000, SINGLE), stateCode: 'NJ' }, SINGLE);

    const gap = ny.tax.state + ny.tax.local - (nj.tax.state + nj.tax.local);
    expect(gap).toBeGreaterThan(5_500);
    expect(gap).toBeLessThan(7_000);
  });

  it('does not let Philadelphia city tax reach the New Jersey side', () => {
    expect(localTaxOptions(PHILADELPHIA, undefined, 'PA').map((o) => o.jurisdictionId)).toContain(
      'philadelphia',
    );
    const nj = resolveLocalJurisdictions(PHILADELPHIA, {}, undefined, 'NJ');
    expect(nj.map((j) => j.id)).not.toContain('philadelphia');
  });
});

describe('the chosen state is validated, never trusted', () => {
  it('falls back to the primary state when none is given', () => {
    expect(resolveStateCode(NEW_YORK, undefined)).toBe('NY');
    expect(resolveStateCode(AUSTIN, undefined)).toBe('TX');
  });

  it('rejects a state the metro does not contain', () => {
    // This arrives from a share link, so a stale or hand-edited one must not
    // apply Texas rates to somebody in the New York metro.
    expect(resolveStateCode(NEW_YORK, 'TX')).toBe('NY');
    expect(resolveStateCode(NEW_YORK, 'ZZ')).toBe('NY');
    expect(resolveStateCode(NEW_YORK, '')).toBe('NY');
  });

  it('accepts every state a metro actually contains', () => {
    for (const state of metro(PHILADELPHIA).states) {
      expect(resolveStateCode(PHILADELPHIA, state)).toBe(state);
    }
  });
});

describe('every state a picker can offer is computable', () => {
  it('has income tax rules and sales tax rules', () => {
    // The picker lists metro.states verbatim, so a state with no tax data
    // would throw the moment someone selected it.
    for (const m of allMetros()) {
      for (const state of m.states) {
        expect(() => stateRules(state)).not.toThrow();
        expect(() => salesTaxRules(state)).not.toThrow();
      }
    }
  });

  it('produces a finite result for every state of every multi-state metro', () => {
    for (const m of allMetros().filter((x) => x.states.length > 1)) {
      for (const state of m.states) {
        const result = computeCity(
          { ...defaultCityInputs(m.id, 120_000, SINGLE), stateCode: state },
          SINGLE,
        );
        expect(Number.isFinite(result.leftover)).toBe(true);
        expect(result.stateCode).toBe(state);
      }
    }
  });
});
