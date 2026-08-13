import { describe, expect, it } from 'vitest';

import { computeCity, defaultCityInputs } from './compare';
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
