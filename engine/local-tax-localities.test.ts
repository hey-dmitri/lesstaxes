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
    /*
     * Filtered to the city's own state. Cincinnati straddles Indiana, and
     * every Indiana metro now carries a county tax jurisdiction — which is
     * correct, and which only ever reaches somebody who picked the Indiana
     * side. Counting it here would be counting a tax nobody in Ohio pays.
     */
    const state = averageId.slice(4);
    const options = localTaxOptions(metroId, undefined, state);
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
      expect(resolveLocalJurisdictions(metroId, optIns, undefined, state)).toHaveLength(1);
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

  /*
   * Illinois levies no local income tax, so the Illinois side of Chicago
   * carries none. THE INDIANA SIDE DOES, and used to carry nothing at all —
   * Chicago's primary state is Illinois, so the Indiana counties fell through
   * every branch and paid zero. Lake County alone is 1.5%.
   */
  it('leaves the Illinois side of Chicago alone and taxes the Indiana side', () => {
    expect(localTaxOptions(CHICAGO, undefined, 'IL')).toHaveLength(0);
    expect(resolveLocalJurisdictions(CHICAGO, {}, undefined, 'IL')).toHaveLength(0);

    const indiana = resolveLocalJurisdictions(CHICAGO, {}, undefined, 'IN');
    expect(indiana).toHaveLength(1);
    expect(indiana[0].stateCode).toBe('IN');
    expect(indiana[0].kind === 'flatRate' && indiana[0].rate).toBeGreaterThan(0.01);
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

/**
 * Indiana's county income tax.
 *
 * The largest single error this dataset carried. Indiana was on the
 * state-average local rate of 0.35%, which is not merely low — it is below the
 * LOWEST of the 92 counties. Porter charges 0.50%, Randolph 3.00%, and the
 * population-weighted statewide average is 1.7536%.
 */
describe('Indiana county income tax', () => {
  const INDIANAPOLIS = '26900';
  const CHICAGO_METRO = '16980';

  it('charges far more than the state average it replaced', () => {
    const rules = resolveLocalJurisdictions(INDIANAPOLIS, {}, undefined, 'IN');
    expect(rules).toHaveLength(1);
    // 1.81%, weighted across eleven counties from Hamilton's 1.10% to
    // Morgan's 2.72%. Marion is only 45% of the metro, so its 2.02% cannot
    // stand in for the whole.
    expect(rules[0].kind === 'flatRate' && rules[0].rate).toBeCloseTo(0.018054, 6);
  });

  /*
   * Charged on the state's taxable income, not on gross pay — so a family
   * with children pays less than a single filer on the same salary, because
   * Indiana's exemptions come off first. Charging on gross would have got this
   * backwards in the one direction that grows with family size.
   */
  it('charges on what the state taxed, so children reduce it', () => {
    const local = (children: number) =>
      computeCity(
        {
          ...defaultCityInputs(INDIANAPOLIS, 120_000, { filingStatus: 'marriedJointly', children }),
          stateCode: 'IN',
        },
        { filingStatus: 'marriedJointly', children },
      ).tax.local;

    expect(local(3)).toBeLessThan(local(0));
  });

  /*
   * The Indiana side of Chicago used to pay NOTHING. Chicago's primary state
   * is Illinois, which levies no local income tax, so the Indiana counties
   * fell through every branch in the build and were charged zero — while Lake
   * County alone charges 1.5%.
   */
  it('reaches the Indiana counties of metros led by another state', () => {
    for (const metroId of [CHICAGO_METRO, '31140', '17140']) {
      const indiana = resolveLocalJurisdictions(metroId, {}, undefined, 'IN');
      expect(indiana, metroId).toHaveLength(1);
      expect(indiana[0].kind === 'flatRate' && indiana[0].rate, metroId).toBeGreaterThan(0.01);
    }
  });

  it('says out loud that a county may be far from the metro average', () => {
    const [rules] = resolveLocalJurisdictions(INDIANAPOLIS, {}, undefined, 'IN');
    const note = rules.kind === 'flatRate' ? rules.note : undefined;
    expect(note).toMatch(/0\.50% to 3\.00%/);
    expect(note).toMatch(/first year/);
  });
});
