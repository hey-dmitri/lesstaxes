import { describe, expect, it } from 'vitest';

import {
  breakEvenSalary,
  compare,
  computeCity,
  defaultCityInputs,
  defaultRent,
  housingAtSalary,
  housingIsPrefill,
  quickCompare,
} from './compare';
import {
  ALL_METRO_IDS,
  ALL_SPENDING_PROFILES,
  DATASET_VERSION,
  homePriceDefault,
  housingDefaults,
  metro,
  spendingProfile,
} from './dataset';
import { defaultCarCount, equivalenceFactor } from './living';
import type { ComparisonInputs, Household, Housing } from './types';

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

  it('is self-consistent for a buyer, not just a renter', () => {
    // The solver moved a prefilled rent as it searched but not a prefilled
    // home price, so a buyer who was quoted a break-even salary and typed it
    // in did not land on zero — the house grew underneath them.
    const household: Household = { filingStatus: 'marriedJointly', children: 2 };
    const origin = defaultCityInputs(NEW_YORK, 200_000, household, 'own');
    const destination = defaultCityInputs(AUSTIN, 150_000, household, 'own');
    const result = compare({ datasetVersion: DATASET_VERSION, household, origin, destination });

    const entered = compare({
      datasetVersion: DATASET_VERSION,
      household,
      origin,
      destination: {
        ...destination,
        grossSalary: result.breakEvenSalary,
        housing: housingAtSalary(
          destination.metroId,
          destination.housing,
          destination.grossSalary,
          result.breakEvenSalary,
          household,
        ),
      },
    });
    expect(entered.delta).toBeCloseTo(0, 0);
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

describe('prefilled housing follows the salary; typed housing does not', () => {
  const OWN = (metroId: string, salary: number) =>
    defaultCityInputs(metroId, salary, SINGLE, 'own').housing;

  /** A prefilled Austin home with the price overridden. */
  const typedHome = (homePrice: number): Housing => {
    const prefill = OWN(AUSTIN, 110_000);
    if (prefill.tenure !== 'own') throw new Error('unreachable');
    return { ...prefill, homePrice };
  };

  it('recognises a prefill and a typed figure apart', () => {
    expect(housingIsPrefill(AUSTIN, OWN(AUSTIN, 110_000), 110_000, SINGLE)).toBe(true);
    expect(housingIsPrefill(AUSTIN, typedHome(300_000), 110_000, SINGLE)).toBe(false);
  });

  it('moves a prefilled home price when the salary moves', () => {
    // The bug: only rent followed. A prefilled home price went stale the
    // moment the salary changed, and took the mortgage, the property tax and
    // the itemised deduction with it.
    const moved = housingAtSalary(AUSTIN, OWN(AUSTIN, 110_000), 110_000, 200_000, SINGLE);
    expect(moved.tenure).toBe('own');
    if (moved.tenure !== 'own') throw new Error('unreachable');
    expect(moved.homePrice).toBe(homePriceDefault(AUSTIN, 200_000));
    expect(moved.homePrice).toBeGreaterThan(439_000);
  });

  it('leaves the rest of an owned home alone', () => {
    const prefill = OWN(AUSTIN, 110_000);
    if (prefill.tenure !== 'own') throw new Error('unreachable');
    const before: Housing = { ...prefill, mortgageRate: 0.055, downPayment: 0.35 };

    const after = housingAtSalary(AUSTIN, before, 110_000, 200_000, SINGLE);
    if (after.tenure !== 'own') throw new Error('unreachable');
    expect(after.mortgageRate).toBe(0.055);
    expect(after.downPayment).toBe(0.35);
    expect(after.propertyTaxRate).toBe(prefill.propertyTaxRate);
  });

  it('holds a typed figure fixed at any salary', () => {
    const after = housingAtSalary(AUSTIN, typedHome(300_000), 110_000, 200_000, SINGLE);
    if (after.tenure !== 'own') throw new Error('unreachable');
    expect(after.homePrice).toBe(300_000);
  });

  it('moves a prefilled rent, as it always did', () => {
    const rent = defaultCityInputs(AUSTIN, 110_000, SINGLE, 'rent').housing;
    const after = housingAtSalary(AUSTIN, rent, 110_000, 150_000, SINGLE);
    if (after.tenure !== 'rent') throw new Error('unreachable');
    expect(after.monthlyRent).toBe(defaultRent(AUSTIN, 150_000, SINGLE));
  });
});

describe('the city/salary split does not blame the city for a salary choice', () => {
  it('prices the middle column at the salary it claims to be at', () => {
    // New York to Austin, $150,000 now against a $110,000 offer. Austin's
    // prefilled rent is $1,936 because the OFFER is $110,000; at $150,000 the
    // site's own default is $2,288. The middle column is labelled "Austin at
    // your current pay", so pricing it with the $110,000 rent handed the city
    // credit for $4,224 of saving the pay cut had caused.
    const result = compare({
      datasetVersion: DATASET_VERSION,
      household: SINGLE,
      origin: defaultCityInputs(NEW_YORK, 150_000, SINGLE, 'rent'),
      destination: defaultCityInputs(AUSTIN, 110_000, SINGLE, 'rent'),
    });

    const midRent = result.destinationAtOriginSalary.housing.shelter / 12;
    expect(midRent).toBe(defaultRent(AUSTIN, 150_000, SINGLE));

    // The rent used in that column is the $150,000 one, not the $110,000 one
    // the offer implies — a difference of over $4,000 a year that used to be
    // filed under "the city is cheaper".
    const offerRent = defaultRent(AUSTIN, 110_000, SINGLE);
    expect(defaultRent(AUSTIN, 150_000, SINGLE) - offerRent).toBeGreaterThan(300);
    expect(midRent).not.toBe(offerRent);

    // The absolute figure moved with dataset 2026.5, which prices the New York
    // metro from its NEW YORK part rather than metro-wide: 0.486 vehicles per
    // adult against 0.596, because the five boroughs outweigh the suburbs. So
    // the property is pinned rather than the number.
    expect(result.cityEffect + result.salaryEffect).toBeCloseTo(result.delta, 6);
  });

  it('keeps the split adding up to the headline', () => {
    for (const [from, to, now, offered] of [
      [NEW_YORK, AUSTIN, 150_000, 110_000],
      [CHICAGO, AUSTIN, 150_000, 190_000],
      [AUSTIN, SAN_FRANCISCO, 90_000, 90_000],
    ] as Array<[string, string, number, number]>) {
      const result = compare({
        datasetVersion: DATASET_VERSION,
        household: SINGLE,
        origin: defaultCityInputs(from, now, SINGLE, 'rent'),
        destination: defaultCityInputs(to, offered, SINGLE, 'rent'),
      });
      expect(result.cityEffect + result.salaryEffect).toBeCloseTo(result.delta, 6);
    }
  });

  it('leaves the split alone when the salary does not change', () => {
    const result = compare({
      datasetVersion: DATASET_VERSION,
      household: SINGLE,
      origin: defaultCityInputs(NEW_YORK, 150_000, SINGLE, 'rent'),
      destination: defaultCityInputs(AUSTIN, 150_000, SINGLE, 'rent'),
    });
    expect(result.salaryEffect).toBeCloseTo(0, 6);
    expect(result.cityEffect).toBeCloseTo(result.delta, 6);
  });
});

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
  /*
   * This used to assert the opposite — "picks the bracket by floor, without
   * interpolating" — and the behaviour it locked in was a bug. See
   * spending-interpolation.test.ts for what replaced it and why.
   */
  it("lands exactly on a published profile at that bracket's mean income", () => {
    const published = ALL_SPENDING_PROFILES.find((p) => p.incomeFloor === 150_000)!;
    const at = spendingProfile(published.meanIncome!);
    expect(at.bracket).toBe('$150,000 to $199,999');
    expect(at.livingTotal).toBeCloseTo(published.livingTotal, 6);
  });

  it('sits between the two neighbours it is between', () => {
    const lower = ALL_SPENDING_PROFILES.find((p) => p.incomeFloor === 100_000)!;
    const upper = ALL_SPENDING_PROFILES.find((p) => p.incomeFloor === 150_000)!;
    const mid = spendingProfile((lower.meanIncome! + upper.meanIncome!) / 2);
    expect(mid.livingTotal).toBeGreaterThan(lower.livingTotal);
    expect(mid.livingTotal).toBeLessThan(upper.livingTotal);
    expect(mid.livingTotal).toBeCloseTo((lower.livingTotal + upper.livingTotal) / 2, 6);
  });

  it('clamps below and above the published range', () => {
    expect(spendingProfile(0).bracket).toBe('Less than $15,000');
    expect(spendingProfile(5_000_000).bracket).toBe('$200,000 and more');
  });
});
