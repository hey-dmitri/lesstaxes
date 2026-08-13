import { describe, expect, it } from 'vitest';

import { breakEvenSalary, compare, computeCity, defaultCityInputs, quickCompare } from './compare';
import { ALL_METRO_IDS, DATASET_VERSION, housingDefaults, metro, spendingProfile } from './dataset';
import { defaultCarCount, equivalenceFactor } from './living';
import type { ComparisonInputs, Household } from './types';

const SINGLE: Household = { filingStatus: 'single', children: 0 };
const FAMILY: Household = { filingStatus: 'marriedJointly', children: 2 };

const CHICAGO = '16980';
const AUSTIN = '12420';
const NEW_YORK = '35620';
const SAN_FRANCISCO = '41860';
const DALLAS = '19100';

function inputsFor(
  originId: string,
  destinationId: string,
  salary: number,
  destinationSalary = salary,
  household: Household = SINGLE,
): ComparisonInputs {
  return {
    datasetVersion: DATASET_VERSION,
    household,
    origin: defaultCityInputs(originId, salary, household),
    destination: defaultCityInputs(destinationId, destinationSalary, household),
  };
}

// ---------------------------------------------------------------------------
// Invariants that must hold for every comparison
// ---------------------------------------------------------------------------

describe('structural invariants', () => {
  it('the breakdown sums exactly to the headline delta', () => {
    const r = quickCompare(CHICAGO, AUSTIN, 150_000, SINGLE, 125_000);
    const summed = r.breakdown.reduce((total, row) => total + row.delta, 0);
    expect(summed).toBeCloseTo(r.delta, 0);
  });

  it('city effect plus salary effect equals the delta', () => {
    const r = quickCompare(NEW_YORK, AUSTIN, 180_000, FAMILY, 150_000);
    expect(r.cityEffect + r.salaryEffect).toBeCloseTo(r.delta, 4);
  });

  it('leftover equals gross minus every component', () => {
    const c = computeCity(defaultCityInputs(CHICAGO, 150_000, SINGLE), SINGLE);
    const reconstructed =
      c.grossSalary - c.tax.total - c.housing.total - c.living.total - c.salesTax;
    expect(c.leftover).toBeCloseTo(reconstructed, 6);
  });

  it('the tax total equals its own parts', () => {
    const c = computeCity(defaultCityInputs(NEW_YORK, 200_000, SINGLE), SINGLE);
    expect(c.tax.total).toBeCloseTo(
      c.tax.federal + c.tax.state + c.tax.local + c.tax.fica,
      6,
    );
  });

  it('moving to the same city at the same salary changes nothing', () => {
    const r = quickCompare(CHICAGO, CHICAGO, 150_000, SINGLE);
    expect(r.delta).toBeCloseTo(0, 6);
    expect(r.cityEffect).toBeCloseTo(0, 6);
    expect(r.salaryEffect).toBeCloseTo(0, 6);
    expect(r.breakdown).toHaveLength(0);
  });

  it('the breakdown is sorted by absolute impact', () => {
    const r = quickCompare(NEW_YORK, DALLAS, 200_000, FAMILY, 160_000);
    for (let i = 1; i < r.breakdown.length; i++) {
      expect(Math.abs(r.breakdown[i - 1].delta)).toBeGreaterThanOrEqual(
        Math.abs(r.breakdown[i].delta),
      );
    }
  });
});

// ---------------------------------------------------------------------------
// The spending basket must not leak bracket boundaries into the answer
// ---------------------------------------------------------------------------

describe('spending basket is pinned to the origin household', () => {
  it('a salary change alone does not jump the living-cost basket', () => {
    // $150,000 and $125,000 sit in different BLS brackets. If the basket were
    // chosen per city, this would show a large phantom saving on food and
    // healthcare that is purely an artefact of where the survey draws lines.
    const r = quickCompare(CHICAGO, CHICAGO, 150_000, SINGLE, 125_000);

    const living = r.breakdown.find((b) => b.key === 'living');
    expect(living).toBeUndefined(); // identical city, identical basket

    expect(r.origin.living.total).toBeCloseTo(r.destination.living.total, 6);
  });

  it('both cities use the same profile bracket', () => {
    const r = quickCompare(NEW_YORK, AUSTIN, 175_000, SINGLE, 120_000);
    expect(r.origin.living.profileBracket).toBe(r.destination.living.profileBracket);
  });
});

describe('equivalenceFactor', () => {
  it('is 1 when the household matches the bracket average', () => {
    expect(equivalenceFactor(3.1, 3.1)).toBeCloseTo(1, 6);
  });

  it('scales sub-linearly — two people do not cost twice one', () => {
    const one = equivalenceFactor(1, 1);
    const two = equivalenceFactor(2, 1);
    expect(two).toBeGreaterThan(one);
    expect(two).toBeLessThan(2 * one);
    expect(two).toBeCloseTo(Math.SQRT2, 6);
  });

  it('shrinks a family basket down for a single filer', () => {
    expect(equivalenceFactor(1, 3.1)).toBeLessThan(0.7);
  });

  it('never returns zero or negative for degenerate input', () => {
    expect(equivalenceFactor(0, 3)).toBeGreaterThan(0);
    expect(equivalenceFactor(-5, 3)).toBeGreaterThan(0);
  });

  it('a single filer spends less on living than a family at the same income', () => {
    const single = computeCity(defaultCityInputs(CHICAGO, 150_000, SINGLE), SINGLE);
    const family = computeCity(defaultCityInputs(CHICAGO, 150_000, FAMILY), FAMILY);
    expect(single.living.total).toBeLessThan(family.living.total);
  });
});

// ---------------------------------------------------------------------------
// Break-even
// ---------------------------------------------------------------------------

describe('breakEvenSalary', () => {
  it('produces a salary at which the delta really is zero', () => {
    const r = quickCompare(CHICAGO, AUSTIN, 150_000, SINGLE, 125_000);

    const atBreakEven = compare(inputsFor(CHICAGO, AUSTIN, 150_000, r.breakEvenSalary));
    expect(atBreakEven.delta).toBeCloseTo(0, 0);
  });

  it('is below the current salary when the destination is cheaper', () => {
    const r = quickCompare(SAN_FRANCISCO, DALLAS, 200_000, SINGLE);
    expect(r.breakEvenSalary).toBeLessThan(200_000);
  });

  it('is above the current salary when the destination is pricier', () => {
    const r = quickCompare(DALLAS, SAN_FRANCISCO, 150_000, SINGLE);
    expect(r.breakEvenSalary).toBeGreaterThan(150_000);
  });

  it('returns zero when the move wins even at zero salary', () => {
    const inputs = inputsFor(SAN_FRANCISCO, DALLAS, 1_000);
    const originLeftover = computeCity(inputs.origin, inputs.household).leftover;
    // Origin leftover is deeply negative here, so any destination salary beats
    // it. Zero and null used to be the same answer, which meant the interface
    // could not tell "you need nothing" from "no salary would do it" and said
    // nothing at all in both cases.
    expect(breakEvenSalary(inputs, originLeftover)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Behaviour the product depends on
// ---------------------------------------------------------------------------

describe('federal tax and FICA are federal', () => {
  // Federal rules are identical in every state. At the same salary, the only
  // thing that may move federal tax between cities is the SALT deduction, and
  // only when the filer itemises. FICA has no such channel at all.
  const CITIES = [CHICAGO, AUSTIN, NEW_YORK, SAN_FRANCISCO, DALLAS];

  it('FICA is identical in every city at the same salary', () => {
    const ficas = CITIES.map(
      (id) => computeCity(defaultCityInputs(id, 150_000, SINGLE), SINGLE).tax.fica,
    );
    for (const f of ficas) expect(f).toBeCloseTo(ficas[0], 6);
  });

  it('federal tax is identical in every city when nobody itemises', () => {
    const results = CITIES.map((id) =>
      computeCity(defaultCityInputs(id, 150_000, SINGLE, 'rent'), SINGLE),
    );
    for (const c of results) expect(c.tax.itemized).toBe(false);
    for (const c of results) expect(c.tax.federal).toBeCloseTo(results[0].tax.federal, 6);
  });

  it('federal tax DOES differ between states once itemising kicks in', () => {
    // A high earner with a mortgage: state and property tax become deductible,
    // so the no-income-tax state ends up paying MORE federal tax.
    const ny = computeCity(defaultCityInputs(NEW_YORK, 500_000, SINGLE, 'own'), SINGLE);
    const tx = computeCity(defaultCityInputs(DALLAS, 500_000, SINGLE, 'own'), SINGLE);

    expect(ny.tax.itemized).toBe(true);
    expect(ny.tax.deductionTaken).toBeGreaterThan(tx.tax.deductionTaken);
    expect(ny.tax.federal).toBeLessThan(tx.tax.federal);
  });

  it('within one city, federal tax and FICA move only with salary', () => {
    const a = computeCity(defaultCityInputs(CHICAGO, 150_000, SINGLE), SINGLE);
    const b = computeCity(defaultCityInputs(CHICAGO, 125_000, SINGLE), SINGLE);
    expect(b.tax.federal).toBeLessThan(a.tax.federal);
    expect(b.tax.fica).toBeCloseTo(125_000 * (0.062 + 0.0145), 0);
  });
});

describe('taxes behave correctly across the move', () => {
  it('leaving Illinois for Texas removes the state income tax entirely', () => {
    const r = quickCompare(CHICAGO, AUSTIN, 150_000, SINGLE);
    expect(r.origin.tax.state).toBeGreaterThan(7_000);
    expect(r.destination.tax.state).toBe(0);
  });

  it('New York City adds a local income tax that Dallas does not have', () => {
    const ny = computeCity(defaultCityInputs(NEW_YORK, 150_000, SINGLE), SINGLE);
    const dallas = computeCity(defaultCityInputs(DALLAS, 150_000, SINGLE), SINGLE);
    expect(ny.tax.local).toBeGreaterThan(4_000);
    expect(dallas.tax.local).toBe(0);
  });

  it('state tax feeds the federal deduction, so federal tax differs between states', () => {
    // Same salary, same tenure — only the state differs.
    const ny = computeCity(
      defaultCityInputs(NEW_YORK, 400_000, SINGLE, 'own'),
      SINGLE,
    );
    const dallas = computeCity(
      defaultCityInputs(DALLAS, 400_000, SINGLE, 'own'),
      SINGLE,
    );
    expect(ny.tax.federal).not.toBeCloseTo(dallas.tax.federal, 0);
  });

  it('a high-tax-state homeowner itemises; a low-tax-state renter does not', () => {
    const nyOwner = computeCity(defaultCityInputs(NEW_YORK, 400_000, SINGLE, 'own'), SINGLE);
    const txRenter = computeCity(defaultCityInputs(AUSTIN, 400_000, SINGLE, 'rent'), SINGLE);
    expect(nyOwner.tax.itemized).toBe(true);
    expect(txRenter.tax.itemized).toBe(false);
  });
});

describe('cars', () => {
  it('New York needs fewer cars per adult than Dallas', () => {
    expect(defaultCarCount(NEW_YORK, 'single')).toBeLessThanOrEqual(
      defaultCarCount(DALLAS, 'single'),
    );
  });

  it('a couple gets at least as many cars as a single person', () => {
    for (const id of [CHICAGO, AUSTIN, DALLAS]) {
      expect(defaultCarCount(id, 'marriedJointly')).toBeGreaterThanOrEqual(
        defaultCarCount(id, 'single'),
      );
    }
  });

  it('more cars costs more', () => {
    const household = SINGLE;
    const base = defaultCityInputs(AUSTIN, 150_000, household);
    const oneCar = computeCity({ ...base, cars: 1 }, household);
    const threeCars = computeCity({ ...base, cars: 3 }, household);
    expect(threeCars.living.transport).toBeGreaterThan(oneCar.living.transport);
    expect(threeCars.leftover).toBeLessThan(oneCar.leftover);
  });
});

describe('housing tenure', () => {
  it('buying introduces property tax that renting does not have', () => {
    const household = SINGLE;
    const renter = computeCity(defaultCityInputs(AUSTIN, 150_000, household, 'rent'), household);
    const owner = computeCity(defaultCityInputs(AUSTIN, 150_000, household, 'own'), household);
    expect(renter.housing.propertyTax).toBe(0);
    expect(owner.housing.propertyTax).toBeGreaterThan(5_000);
  });

  it('supports renting in one city and buying in the other', () => {
    const household = FAMILY;
    const r = compare({
      datasetVersion: DATASET_VERSION,
      household,
      origin: defaultCityInputs(CHICAGO, 150_000, household, 'rent'),
      destination: defaultCityInputs(AUSTIN, 150_000, household, 'own'),
    });
    expect(r.origin.housing.propertyTax).toBe(0);
    expect(r.destination.housing.propertyTax).toBeGreaterThan(0);
    expect(Number.isFinite(r.delta)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Robustness across the whole dataset
// ---------------------------------------------------------------------------

describe('every location produces a sane result', () => {
  const sample = ALL_METRO_IDS.filter((_, i) => i % 11 === 0);

  it.each(sample)('%s computes finite, plausible figures', (id) => {
    const c = computeCity(defaultCityInputs(id, 120_000, FAMILY), FAMILY);

    expect(Number.isFinite(c.leftover)).toBe(true);
    expect(c.tax.total).toBeGreaterThan(0);
    expect(c.tax.total).toBeLessThan(120_000);
    expect(c.housing.total).toBeGreaterThan(0);
    expect(c.living.total).toBeGreaterThan(0);
    expect(c.salesTax).toBeGreaterThanOrEqual(0);
    // Nobody's total outgoings should exceed three times their salary.
    expect(c.tax.total + c.housing.total + c.living.total).toBeLessThan(360_000);
  });

  it('handles zero salary without producing NaN or Infinity', () => {
    const c = computeCity(defaultCityInputs(CHICAGO, 0, SINGLE), SINGLE);
    expect(Number.isFinite(c.leftover)).toBe(true);
    expect(c.tax.federal).toBeLessThanOrEqual(0); // refundable credits may apply
  });

  it('leftover rises monotonically with salary', () => {
    let previous = -Infinity;
    for (let salary = 40_000; salary <= 600_000; salary += 40_000) {
      const c = computeCity(defaultCityInputs(CHICAGO, salary, SINGLE), SINGLE);
      expect(c.leftover).toBeGreaterThan(previous);
      previous = c.leftover;
    }
  });

  it('rejects an unknown location rather than guessing', () => {
    expect(() => metro('99999')).toThrow(/unknown location/);
    expect(() => housingDefaults('99999')).toThrow();
  });
});

describe('spendingProfile', () => {
  it('picks the bracket by floor, without interpolating', () => {
    expect(spendingProfile(160_000).bracket).toBe('$150,000 to $199,999');
    expect(spendingProfile(150_000).bracket).toBe('$150,000 to $199,999');
    expect(spendingProfile(149_999).bracket).toBe('$100,000 to $149,999');
  });

  it('clamps below and above the published range', () => {
    expect(spendingProfile(0).bracket).toBe('Less than $15,000');
    expect(spendingProfile(5_000_000).bracket).toBe('$200,000 and more');
  });
});
