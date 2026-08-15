import { describe, expect, it } from 'vitest';

import { computeCity, defaultCityInputs } from './compare';
import { computeLocalTax } from './tax/local';
import { CURRENT_DATASET_VERSION } from './datasets';
import {
  localJurisdiction,
  localTaxOptions,
  resolveLocalJurisdictions,
} from './dataset';
import type { Household } from './types';

const PHILADELPHIA = '37980';
const DETROIT = '19820';
const COLUMBUS = '18140';
const CINCINNATI = '17140';
const NEW_YORK = '35620';
const CHICAGO = '16980';

const single: Household = { filingStatus: 'single', children: 0 };

describe('city income taxes replace the state average, never add to it', () => {
  it.each([
    [PHILADELPHIA, 'philadelphia', 'avg-PA'],
    [DETROIT, 'detroit', 'avg-MI'],
    [COLUMBUS, 'columbus', 'avg-OH'],
    [CINCINNATI, 'cincinnati', 'avg-OH'],
  ])('%s offers the city or the rest of the metro, not both', (metroId, cityId, averageId) => {
    const options = localTaxOptions(metroId);
    const group = options.filter((o) => o.group === 'locality');
    expect(group).toHaveLength(2);
    expect(group.map((o) => o.jurisdictionId).sort()).toEqual([cityId, averageId].sort());
    expect(group.filter((o) => o.defaultApplies)).toHaveLength(1);

    // Whatever the user ticks, exactly one jurisdiction can ever apply.
    for (const optIns of [
      {},
      { [cityId]: true },
      { [averageId]: true },
      { [cityId]: true, [averageId]: true },
      { [cityId]: false, [averageId]: false },
    ]) {
      expect(resolveLocalJurisdictions(metroId, optIns)).toHaveLength(1);
    }
  });

  it('defaults to the principal city', () => {
    const [applied] = resolveLocalJurisdictions(PHILADELPHIA, {});
    expect(applied.id).toBe('philadelphia');
  });

  it('switches to the state average when the user says they live elsewhere', () => {
    const [applied] = resolveLocalJurisdictions(PHILADELPHIA, { 'avg-PA': true });
    expect(applied.id).toBe('avg-PA');
  });

  it('charges a city resident materially more than the state average', () => {
    // The whole point: the average was standing in for a rate several times
    // its size, and it did so silently.
    const city = localJurisdiction('philadelphia');
    const average = localJurisdiction('avg-PA');
    if (city.kind !== 'flatRate' || average.kind !== 'flatRate') {
      throw new Error('both are flat-rate jurisdictions');
    }
    expect(city.rate).toBeGreaterThan(average.rate * 2);
  });

  it('feeds through to a real computed tax bill', () => {
    const inputs = defaultCityInputs(PHILADELPHIA, 150_000, single);
    const inCity = computeCity(inputs, single, {
      localJurisdictions: resolveLocalJurisdictions(PHILADELPHIA, {}),
      datasetVersion: CURRENT_DATASET_VERSION,
    });
    const outside = computeCity(inputs, single, {
      localJurisdictions: resolveLocalJurisdictions(PHILADELPHIA, { 'avg-PA': true }),
      datasetVersion: CURRENT_DATASET_VERSION,
    });
    expect(inCity.tax.local).toBeGreaterThan(outside.tax.local);
    expect(inCity.leftover).toBeLessThan(outside.leftover);
  });
});

describe('ungrouped options are unaffected', () => {
  it('keeps New York City and Yonkers as independent questions', () => {
    // These are not alternatives — they are two separate boundaries, and
    // neither, either or (in principle) the pair could be answered yes.
    const options = localTaxOptions(NEW_YORK);
    expect(options.every((o) => !o.group)).toBe(true);
    expect(resolveLocalJurisdictions(NEW_YORK, {}).map((j) => j.id)).toEqual(['nyc']);
    expect(resolveLocalJurisdictions(NEW_YORK, { nyc: false, yonkers: true }).map((j) => j.id))
      .toEqual(['yonkers']);
  });

  it('leaves metros with no local income tax alone', () => {
    expect(localTaxOptions(CHICAGO)).toHaveLength(0);
    expect(resolveLocalJurisdictions(CHICAGO, {})).toHaveLength(0);
  });
});

describe('older releases keep their own coverage', () => {
  it('has no city jurisdictions before they were sourced', () => {
    const group = localTaxOptions(PHILADELPHIA, '2026.1').filter((o) => o.group);
    expect(group).toHaveLength(0);
    expect(resolveLocalJurisdictions(PHILADELPHIA, {}, '2026.1').map((j) => j.id)).toEqual([
      'avg-PA',
    ]);
  });
});

/**
 * Indiana's counties charge on the state's taxable income, not on gross wages.
 *
 * Every other flat-rate locality in this dataset — Philadelphia, Detroit, the
 * Ohio cities, the Maryland counties — charges on the whole paycheque. Indiana
 * does not, and the difference is the rate times Indiana's exemptions, which
 * grows with family size. County rates there reach 3%, so charging on gross
 * would overstate a family's bill exactly where they can least absorb it.
 */
describe('a local tax charged on the state base', () => {
  const jurisdiction = {
    kind: 'flatRate' as const,
    id: 'test-county',
    name: 'Test County',
    stateCode: 'IN',
    rate: 0.02,
    appliesTo: 'stateTaxableIncome' as const,
  };

  const inputs = {
    grossSalary: 100_000,
    filingStatus: 'marriedJointly' as const,
    children: 2,
    stateTax: 0,
  };

  it('charges on what the state taxed, not on the whole paycheque', () => {
    // $100,000 gross, $4,000 of exemptions, so $96,000 is what the state taxed.
    const result = computeLocalTax({ ...inputs, stateTaxableIncome: 96_000 }, jurisdiction);
    expect(result.taxableIncome).toBe(96_000);
    expect(result.tax).toBeCloseTo(1_920, 6);
  });

  it('leaves every other locality charging on gross', () => {
    const philadelphia = { ...jurisdiction, stateCode: 'PA', appliesTo: undefined };
    const result = computeLocalTax({ ...inputs, stateTaxableIncome: 96_000 }, philadelphia);
    expect(result.taxableIncome).toBe(100_000);
  });

  /*
   * Falling back to gross charges slightly MORE, never less, which is the safe
   * direction for a fallback to fail in.
   */
  it('falls back to gross rather than to zero', () => {
    const result = computeLocalTax(inputs, jurisdiction);
    expect(result.taxableIncome).toBe(100_000);
  });
});
