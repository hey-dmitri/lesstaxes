import { describe, expect, it } from 'vitest';

import { compare, computeCity, defaultCityInputs } from './compare';
import { ALL_SPENDING_PROFILES, spendingProfile } from './dataset';
import type { Household } from './types';

/**
 * Owners were paying nothing to keep the house standing.
 *
 * The engine drops the whole published shelter block, because housing is the
 * reader's own input, and then rebuilds it. It rebuilt only the mortgage
 * payment and the property tax. The third part of an owned home — "Maintenance,
 * Repairs, Insurance, Other Expenses for Owned Dwelling" — was never put back.
 *
 * Home insurance is INSIDE that line. The site documented a missing insurance
 * figure as its largest known gap and went looking for a per-state premium
 * dataset that does not exist for free, while the published figure containing
 * insurance was being discarded along with the repairs beside it.
 *
 * The published number averages owners and renters together and renters pay
 * none of it, so it is divided by the share who own before it describes an
 * owner. At $100,000-$150,000 that is $2,960 spread over everybody but $4,000
 * for someone who actually owns; above $200,000 it is $7,268.
 */

const CHICAGO = '16980';
const NEW_YORK = '35620';
const AUSTIN = '12420';
const SINGLE: Household = { filingStatus: 'single', children: 0, earners: 1 };
const FAMILY: Household = { filingStatus: 'marriedJointly', children: 3, earners: 2 };

const city = (metroId: string, tenure: 'rent' | 'own', salary = 100_000, household = SINGLE) =>
  computeCity(defaultCityInputs(metroId, salary, household, tenure), household);

describe('the published figure', () => {
  /*
   * That it sits inside the owned-dwelling block, and that owned dwellings plus
   * other lodging leave room for rented dwellings inside shelter, are checked in
   * build-spending.mjs — that script can see the source rows this type does not
   * carry. What is worth pinning here is that every band has one and it rises.
   */
  it('exists for every band, and is plausible in every band', () => {
    for (const p of ALL_SPENDING_PROFILES) {
      const u = p.ownerUpkeep!;
      expect(u.perConsumerUnit).toBeGreaterThan(0);
      expect(u.perOwner).toBeGreaterThan(1_500);
      expect(u.perOwner).toBeLessThan(15_000);
    }
  });

  /*
   * It is NOT monotonic, and that is the survey rather than a bug here: the
   * $40,000-$49,999 band reports more upkeep per owner than the $50,000-$69,999
   * band above it. Interpolation reproduces that faithfully.
   *
   * A dip like this is only dangerous if it lets a raise cost somebody money,
   * which is the bug this engine had until this morning. It cannot: upkeep
   * falling as income rises makes leftover rise FASTER, not slower. The rising
   * stretches are what needed checking, and they are gentle — the steepest is
   * 15 cents of upkeep per extra dollar earned, against a dollar of pay. The
   * monotonicity test below is the real guard.
   */
  it('never climbs faster than the pay that drives it', () => {
    const bands = ALL_SPENDING_PROFILES.filter((p) => p.meanIncome && p.ownerUpkeep);
    for (let i = 1; i < bands.length; i++) {
      const rise = bands[i].ownerUpkeep!.perOwner - bands[i - 1].ownerUpkeep!.perOwner;
      const pay = bands[i].meanIncome! - bands[i - 1].meanIncome!;
      expect(rise / pay).toBeLessThan(0.5);
    }
  });

  /*
   * The correction that makes the number mean something. Renters pay none of
   * this, so the published average understates an owner by however many
   * households in the band rent.
   */
  it('is divided by the share of households who actually own', () => {
    for (const p of ALL_SPENDING_PROFILES) {
      const u = p.ownerUpkeep!;
      expect(u.homeownerShare).toBeGreaterThan(0.2);
      expect(u.homeownerShare).toBeLessThanOrEqual(1);
      expect(u.perOwner).toBeCloseTo(u.perConsumerUnit / u.homeownerShare, 0);
      // Always larger than the published figure, because renters drag it down.
      expect(u.perOwner).toBeGreaterThan(u.perConsumerUnit);
    }
  });

  it('lands where the reported figures said it would', () => {
    const band = ALL_SPENDING_PROFILES.find((p) => p.incomeFloor === 100_000)!;
    expect(band.ownerUpkeep!.perConsumerUnit).toBe(2_960);
    expect(band.ownerUpkeep!.perOwner).toBeCloseTo(4_000, -1);

    const top = ALL_SPENDING_PROFILES.at(-1)!;
    expect(top.ownerUpkeep!.perOwner).toBeCloseTo(7_268, -1);
  });

  it('carries through interpolation between bands', () => {
    const lower = ALL_SPENDING_PROFILES.find((p) => p.incomeFloor === 100_000)!;
    const upper = ALL_SPENDING_PROFILES.find((p) => p.incomeFloor === 150_000)!;
    const mid = spendingProfile((lower.meanIncome! + upper.meanIncome!) / 2);
    expect(mid.ownerUpkeep!.perOwner).toBeCloseTo(
      (lower.ownerUpkeep!.perOwner + upper.ownerUpkeep!.perOwner) / 2,
      6,
    );
  });
});

describe('owners', () => {
  it('are charged four figures a year to keep the house standing', () => {
    const owned = city(CHICAGO, 'own');
    expect(owned.housing.maintenance).toBeGreaterThan(3_500);
    expect(owned.housing.maintenance).toBeLessThan(6_000);
  });

  it('are charged more of it the more they earn, because bigger homes cost more', () => {
    expect(city(CHICAGO, 'own', 300_000).housing.maintenance).toBeGreaterThan(
      city(CHICAGO, 'own', 100_000).housing.maintenance,
    );
  });

  it('sees it in the total, and the total still equals its parts', () => {
    const h = city(NEW_YORK, 'own').housing;
    expect(h.total).toBeCloseTo(
      h.shelter + h.propertyTax + h.insurance + h.utilities + h.maintenance,
      6,
    );
  });

  /*
   * A roof costs what it costs whether one person or five live under it, so
   * this is the one figure in the basket NOT scaled by household size. The
   * published number is already an average over owners of every size.
   */
  it('pays the same upkeep whatever the size of the household', () => {
    expect(city(CHICAGO, 'own', 100_000, FAMILY).housing.maintenance).toBeCloseTo(
      city(CHICAGO, 'own', 100_000, SINGLE).housing.maintenance,
      6,
    );
  });
});

/*
 * Upkeep rises with income, so it joins the list of things that could make a
 * raise cost somebody money — the bug this engine had until this morning, when
 * spending was a step function of salary.
 *
 * The interpolation tests sweep RENTERS. Upkeep is charged to owners only, so
 * it needs its own sweep or nothing covers it. Housing is held fixed, because
 * the suggested home price moves with salary and would drown the signal.
 */
describe('a raise still never costs an owner money', () => {
  const owning = (salary: number) =>
    computeCity(
      {
        metroId: CHICAGO,
        stateCode: 'IL',
        grossSalary: salary,
        cars: 1,
        housing: {
          tenure: 'own',
          homePrice: 450_000,
          downPayment: 0.2,
          mortgageRate: 0.068,
          propertyTaxRate: 0.0199,
        },
      },
      SINGLE,
    );

  it('holds across every band boundary and every band mean', () => {
    const salaries = new Set<number>();
    for (let s = 20_000; s <= 400_000; s += 2_500) salaries.add(s);
    for (const p of ALL_SPENDING_PROFILES) {
      if (p.meanIncome) [p.meanIncome - 1, p.meanIncome, p.meanIncome + 1].forEach((x) => salaries.add(x));
      [p.incomeFloor - 1, p.incomeFloor, p.incomeFloor + 1].forEach((x) => salaries.add(x));
    }
    const sorted = [...salaries].filter((s) => s > 0).sort((a, b) => a - b);

    let previous = owning(sorted[0]);
    for (const salary of sorted.slice(1)) {
      const current = owning(salary);
      expect(current.leftover).toBeGreaterThan(previous.leftover);
      previous = current;
    }
  });
});

describe('renters', () => {
  it('are charged none of it, because the landlord pays for the roof', () => {
    expect(city(CHICAGO, 'rent').housing.maintenance).toBe(0);
    expect(city(NEW_YORK, 'rent', 300_000).housing.maintenance).toBe(0);
  });

  it('are completely unaffected by the change', () => {
    const before = compare({
      datasetVersion: '2026.9',
      household: SINGLE,
      origin: defaultCityInputs(CHICAGO, 100_000, SINGLE, 'rent', 0.068, '2026.9'),
      destination: defaultCityInputs(AUSTIN, 100_000, SINGLE, 'rent', 0.068, '2026.9'),
    });
    const after = compare({
      datasetVersion: undefined as unknown as string,
      household: SINGLE,
      origin: defaultCityInputs(CHICAGO, 100_000, SINGLE, 'rent'),
      destination: defaultCityInputs(AUSTIN, 100_000, SINGLE, 'rent'),
    });
    expect(after.delta).toBeCloseTo(before.delta, 6);
  });
});

describe('the breakdown', () => {
  const owning = compare({
    datasetVersion: undefined as unknown as string,
    household: SINGLE,
    origin: defaultCityInputs(NEW_YORK, 300_000, SINGLE, 'own'),
    destination: defaultCityInputs(AUSTIN, 300_000, SINGLE, 'own'),
  });

  it('names it rather than hiding it inside the mortgage line', () => {
    const row = owning.breakdown.find((r) => r.key === 'maintenance');
    expect(row).toBeDefined();
    expect(row!.label).toBe('Upkeep, repairs & insurance');
  });

  /*
   * A four-figure cost that is subtracted from leftover but missing from the
   * list of reasons would make the rows stop adding up to the headline. That
   * has been the trap in every one of these corrections.
   */
  it('still reconciles to the headline', () => {
    const summed = owning.breakdown.reduce((total, row) => total + row.delta, 0);
    expect(summed).toBeCloseTo(owning.delta, 0);
  });
});

/*
 * PROJECT.md section 9.2. Links shared before this keep charging owners nothing
 * rather than silently changing under whoever they were sent to.
 */
describe('links pinned to an older release', () => {
  it('still charge owners nothing for upkeep', () => {
    const older = computeCity(
      defaultCityInputs(CHICAGO, 100_000, SINGLE, 'own', 0.068, '2026.9'),
      SINGLE,
      { datasetVersion: '2026.9' },
    );
    expect(older.housing.maintenance).toBe(0);
    expect(city(CHICAGO, 'own').housing.maintenance).toBeGreaterThan(3_500);
    expect(city(CHICAGO, 'own').leftover).toBeLessThan(older.leftover);
  });
});
