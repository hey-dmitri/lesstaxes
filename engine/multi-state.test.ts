import { describe, expect, it } from 'vitest';

import { computeCity, defaultCityInputs } from './compare';
import {
  allMetros,
  housingDefaults,
  transportDefaults,
  isMultiState,
  localTaxOptions,
  metro,
  resolveLocalJurisdictions,
  resolveStateCode,
  salesTaxRules,
} from './dataset';
import { stateRules } from './tax/rules';
import { computeStateTax } from './tax/state';
import type { Household } from './types';

const SINGLE: Household = { filingStatus: 'single', children: 0 };

const NEW_YORK = '35620'; // New York-Newark-Jersey City, NY-NJ
const PHILADELPHIA = '37980'; // PA-NJ-DE-MD
const AUSTIN = '12420'; // single state
const CHICAGO_METRO = '16980'; // IL-IN

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

  /*
   * This used to assert that the state choice moved SALES tax as well. It did,
   * and that was half of the original bug. The separate sales tax line has
   * since gone entirely: the spending basket comes from the BLS survey, whose
   * figures already include the sales tax the household paid, so charging it
   * again beside them charged it twice.
   *
   * The state rates are still published data and still differ. Nothing in the
   * engine multiplies by them any more, and the point of this test is now that
   * nobody quietly reintroduces the second charge.
   */
  it('no longer charges sales tax on top of a basket that includes it', () => {
    const ny = computeCity({ ...defaultCityInputs(NEW_YORK, 150_000, SINGLE), stateCode: 'NY' }, SINGLE);
    const nj = computeCity({ ...defaultCityInputs(NEW_YORK, 150_000, SINGLE), stateCode: 'NJ' }, SINGLE);

    expect(salesTaxRules('NY').combinedRate).not.toBe(salesTaxRules('NJ').combinedRate);
    expect(ny.salesTax).toBe(0);
    expect(nj.salesTax).toBe(0);
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

describe('housing follows the state too, not just tax', () => {
  it('quotes the New Jersey side its own home value, not the metro average', () => {
    // The gap this closes: $512,300 against $684,700, either side of the
    // $614,200 metro-wide figure that was being quoted to both.
    const whole = housingDefaults(NEW_YORK);
    const nj = housingDefaults(NEW_YORK, undefined, 'NJ');
    const ny = housingDefaults(NEW_YORK, undefined, 'NY');

    expect(nj.medianHomePrice).toBeLessThan(whole.medianHomePrice);
    expect(ny.medianHomePrice).toBeGreaterThan(whole.medianHomePrice);
    expect(ny.medianHomePrice - nj.medianHomePrice).toBeGreaterThan(100_000);
  });

  it('quotes the Indiana side of Chicago its own rent', () => {
    const il = housingDefaults(CHICAGO_METRO, undefined, 'IL');
    const inPart = housingDefaults(CHICAGO_METRO, undefined, 'IN');
    expect(inPart.medianRentMonthly).toBeLessThan(il.medianRentMonthly);
    expect(inPart.rentByBedrooms[1]).toBeLessThan(il.rentByBedrooms[1]);
  });

  it('counts cars by state part — the boroughs are not the suburbs', () => {
    const whole = transportDefaults(NEW_YORK);
    const ny = transportDefaults(NEW_YORK, undefined, 'NY');
    const nj = transportDefaults(NEW_YORK, undefined, 'NJ');
    expect(ny.vehiclesPerAdult).toBeLessThan(whole.vehiclesPerAdult);
    expect(nj.vehiclesPerAdult).toBeGreaterThan(ny.vehiclesPerAdult);
  });

  it('falls back to the whole metro for a state it has no part for', () => {
    const whole = housingDefaults(NEW_YORK);
    expect(housingDefaults(NEW_YORK, undefined, 'TX')).toEqual(whole);
    expect(housingDefaults(AUSTIN, undefined, 'TX').medianHomePrice).toBe(
      housingDefaults(AUSTIN).medianHomePrice,
    );
  });

  it('falls back FIELD BY FIELD, never leaving a hole', () => {
    // A state part is a smaller sample, so the Census suppresses cells in it
    // more often. Every field must still come out with a usable number.
    for (const m of allMetros().filter((x) => x.states.length > 1)) {
      for (const state of m.states) {
        const h = housingDefaults(m.id, undefined, state);
        expect(h.medianRentMonthly).toBeGreaterThan(0);
        expect(h.medianHomePrice).toBeGreaterThan(0);
        expect(h.effectivePropertyTaxRate).toBeGreaterThan(0);
        for (const size of [0, 1, 2, 3, 4, 5]) {
          expect(h.rentByBedrooms[size]).toBeGreaterThan(0);
        }
        expect(transportDefaults(m.id, undefined, state).vehiclesPerAdult).toBeGreaterThan(0);
      }
    }
  });

  it('reaches the calculation, not just the lookup', () => {
    const nj = computeCity(
      { ...defaultCityInputs(NEW_YORK, 150_000, SINGLE, 'own'), stateCode: 'NJ' },
      SINGLE,
    );
    const ny = computeCity(
      { ...defaultCityInputs(NEW_YORK, 150_000, SINGLE, 'own'), stateCode: 'NY' },
      SINGLE,
    );
    // defaultCityInputs prices the home from the metro's primary state, so
    // both start from the New York figure; what must differ is the tax.
    //
    // Income tax alone now, since the separate sales tax line was removed as a
    // double count. It still moves the bottom line, which is the point.
    expect(nj.tax.state).not.toBeCloseTo(ny.tax.state, 0);
    expect(nj.leftover).not.toBeCloseTo(ny.leftover, 0);
  });
});

describe('seven more cities carry their own local income tax', () => {
  const SINGLE_150K = (metroId: string, jurisdiction: string, state?: string) =>
    computeCity(defaultCityInputs(metroId, 150_000, SINGLE, 'rent'), SINGLE, {
      localJurisdictions: resolveLocalJurisdictions(metroId, { [jurisdiction]: true }, undefined, state),
    }).tax.local;

  it('charges the published city rate rather than the state average', () => {
    /*
     * Every rate transcribed from the levying authority — see
     * scripts/build-local-income-tax.mjs for the source on each.
     *
     * Louisville is checked on its KENTUCKY side. Its metro reaches four
     * Indiana counties, and every Indiana metro now carries a county income
     * tax — correctly, and only for somebody who picked the Indiana side.
     */
    const expected: Array<[string, string, number, string?]> = [
      ['17410', 'cleveland', 0.025], // Cleveland
      ['38300', 'pittsburgh', 0.03], // Pittsburgh: 1% city + 2% school
      ['31140', 'louisville', 0.022, 'KY'], // Louisville Metro, Kentucky side
      ['28140', 'kansas-city', 0.01], // Kansas City earnings tax
      ['41180', 'st-louis', 0.01], // St. Louis earnings tax
      ['12580', 'baltimore-city', 0.032], // Baltimore City
    ];
    for (const [metroId, id, rate, state] of expected) {
      expect(SINGLE_150K(metroId, id, state), id).toBeCloseTo(150_000 * rate, 0);
    }
  });

  it('always exceeds the state average it replaced', () => {
    for (const [metroId, id, avg] of [
      ['17410', 'cleveland', 'avg-OH'],
      ['38300', 'pittsburgh', 'avg-PA'],
      ['31140', 'louisville', 'avg-KY'],
      ['28140', 'kansas-city', 'avg-MO'],
      ['41180', 'st-louis', 'avg-MO'],
      ['12580', 'baltimore-city', 'avg-MD'],
    ] as Array<[string, string, string]>) {
      expect(SINGLE_150K(metroId, id)).toBeGreaterThan(SINGLE_150K(metroId, avg));
    }
  });

  it('gives Portland brackets, because below the threshold nothing is owed', () => {
    /*
     * Multnomah's preschool tax starts at $125,000 for a single filer. A flat
     * state average charged everyone a little and the people who actually owe
     * it far too little.
     *
     * THE RATES HERE USED TO BE 2.5% AND 4% AND THAT WAS WRONG. Multnomah
     * County and the Portland Revenue Division both publish 1.5%, plus "an
     * additional 1.5%" above $250,000. A single filer on $300,000 was being
     * charged $1,750 a year too much.
     *
     * Metro's housing tax no longer shares these thresholds: from 2026 it
     * indexes ($128,000 single) while the preschool tax does not.
     */
    const PORTLAND = '38900';
    const at = (salary: number) =>
      computeCity(defaultCityInputs(PORTLAND, salary, SINGLE, 'rent'), SINGLE, {
        localJurisdictions: resolveLocalJurisdictions(PORTLAND, { 'portland-multnomah': true }),
      }).tax.local;

    /*
     * MEASURED ON OREGON TAXABLE INCOME, not on gross pay. Multnomah's and
     * Metro's schedules both apply to Oregon taxable income, so the standard
     * deduction and the federal-tax subtraction come off first. This test used
     * to assert the tax on gross, which was the same bug New York City had.
     */
    const oregonTaxable = (salary: number) =>
      computeStateTax(
        { grossSalary: salary, filingStatus: 'single', children: 0 },
        stateRules('OR'),
      ).taxableIncome;

    expect(at(100_000)).toBe(0);
    expect(at(150_000)).toBeCloseTo((oregonTaxable(150_000) - 125_000) * 0.015, 0);
    expect(at(300_000)).toBeCloseTo(
      (250_000 - 125_000) * 0.015 + (oregonTaxable(300_000) - 250_000) * 0.03,
      0,
    );
  });

  it('offers exactly one choice per Portland resident, not a sum', () => {
    const options = localTaxOptions('38900');
    expect(options).toHaveLength(3);
    expect(options.every((o) => o.group === 'locality')).toBe(true);
    expect(options.filter((o) => o.defaultApplies)).toHaveLength(1);
    // Whichever is picked, only one jurisdiction can ever apply.
    for (const id of ['portland-multnomah', 'portland-metro', 'avg-OR']) {
      expect(resolveLocalJurisdictions('38900', { [id]: true })).toHaveLength(1);
    }
  });
});
