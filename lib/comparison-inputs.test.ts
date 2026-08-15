import { describe, expect, it } from 'vitest';

import { cityInputsFrom, comparisonInputsFrom, type FormState } from './comparison-inputs';
import { compare, DATASET_VERSION, resolveLocalJurisdictions } from '@/engine';
import type { CityFormState } from '@/components/city-panel';

const NEW_YORK = '35620'; // New York-Newark-Jersey City, NY-NJ
const AUSTIN = '12420';

function city(metroId: string, stateCode: string | undefined): CityFormState {
  return {
    metroId,
    stateCode,
    grossSalary: 150_000,
    cars: 1,
    housing: { tenure: 'rent', monthlyRent: 2_500 },
    localOptIns: { nyc: false, yonkers: false },
  };
}

const form = (origin: CityFormState, destination: CityFormState): FormState => ({
  filingStatus: 'single',
  children: 0,
  earners: 1,
  origin,
  destination,
});

/**
 * The page built the engine's input by listing four fields by hand. stateCode
 * was added to CityInputs and the list was not, so the interactive calculator
 * dropped it while the share link and the share card both carried it: the badge
 * said NJ, New York City's tax correctly vanished, and New York's state income
 * tax and sales tax were charged anyway. About $673 a year at $150,000, and
 * enough to move a close verdict.
 *
 * TypeScript could not see it — every field present had the right type and the
 * missing one was optional — so this is the layer that has to.
 */
describe('form state reaches the engine intact', () => {
  it('carries the chosen state through', () => {
    expect(cityInputsFrom(city(NEW_YORK, 'NJ')).stateCode).toBe('NJ');
    expect(comparisonInputsFrom(form(city(NEW_YORK, 'NJ'), city(AUSTIN, 'TX')), DATASET_VERSION)
      .origin.stateCode).toBe('NJ');
  });

  it('carries every field the engine reads, named or not', () => {
    // The real guarantee. If someone reverts this to an explicit field list,
    // whatever they forget shows up here rather than in someone's tax bill.
    const state = city(NEW_YORK, 'NJ');
    const inputs = cityInputsFrom(state) as unknown as Record<string, unknown>;
    for (const key of Object.keys(state)) {
      if (key === 'localOptIns') continue;
      expect(inputs).toHaveProperty(key);
      expect(inputs[key]).toEqual((state as unknown as Record<string, unknown>)[key]);
    }
  });

  it('drops the field the engine has no business seeing', () => {
    expect(cityInputsFrom(city(NEW_YORK, 'NJ'))).not.toHaveProperty('localOptIns');
  });

  it('passes the household through, earners included', () => {
    const inputs = comparisonInputsFrom(
      { ...form(city(NEW_YORK, 'NY'), city(AUSTIN, 'TX')), earners: 2, children: 3 },
      DATASET_VERSION,
    );
    expect(inputs.household).toEqual({ filingStatus: 'single', children: 3, earners: 2 });
    expect(inputs.datasetVersion).toBe(DATASET_VERSION);
  });
});

describe('choosing New Jersey actually changes the answer', () => {
  const run = (stateCode: string) => {
    const origin = city(NEW_YORK, stateCode);
    return compare(comparisonInputsFrom(form(origin, city(AUSTIN, 'TX')), DATASET_VERSION), {
      origin: {
        localJurisdictions: resolveLocalJurisdictions(NEW_YORK, origin.localOptIns, undefined, stateCode),
      },
    });
  };

  it('charges New Jersey income tax, not New York', () => {
    const ny = run('NY');
    const nj = run('NJ');
    expect(ny.origin.stateCode).toBe('NY');
    expect(nj.origin.stateCode).toBe('NJ');
    expect(nj.origin.tax.state).toBeLessThan(ny.origin.tax.state);
  });

  /*
   * The leak this measured was $673 a year: New York state income tax AND New
   * York sales tax charged to somebody who had said they live in New Jersey.
   *
   * The sales tax half of it is now $0 for everyone. Not because the bug came
   * back, but because the separate sales tax line was removed as a double
   * count — the spending basket comes from a survey whose figures already
   * include the sales tax those households paid.
   *
   * So the leak is measured on income tax alone, and it is still real money.
   */
  it('no longer charges a separate sales tax to either state', () => {
    expect(run('NJ').origin.salesTax).toBe(0);
    expect(run('NY').origin.salesTax).toBe(0);
  });

  it('still leaves the two hundreds of dollars apart on income tax', () => {
    const gap = run('NY').origin.tax.state - run('NJ').origin.tax.state;
    expect(gap).toBeGreaterThan(300);
    expect(gap).toBeLessThan(700);
  });
});
