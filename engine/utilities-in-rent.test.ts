import { describe, expect, it } from 'vitest';

import { computeCity, defaultCityInputs, housingLabel } from './compare';
import { ALL_SPENDING_PROFILES, spendingProfile } from './dataset';
import type { Household } from './types';

/**
 * Renters were charged for their utilities twice.
 *
 * The rent figure this site quotes is Census MEDIAN GROSS RENT, and Census
 * defines that as "the contract rent plus the estimated average monthly cost of
 * utilities (electricity, gas, and water and sewer) and fuels (oil, coal,
 * kerosene, wood, etc.) if these are paid by the renter".
 *
 *   2024 ACS Subject Definitions, "Gross Rent"
 *   https://www2.census.gov/programs-surveys/acs/tech_docs/subject_definitions/2024_ACSSubjectDefinitions.pdf
 *
 * The engine then subtracted the whole BLS "Utilities, fuels, and public
 * services" row on top. Four of that row's five components — natural gas,
 * electricity, fuel oil and other fuels, water and other public services — are
 * exactly what Census just listed. About 70% of the line, in every bracket.
 *
 * Telephone service is the fifth, and gross rent does not cover it, so it stays
 * an ordinary living cost for everybody.
 *
 * Owners are the mirror image: a mortgage covers none of it, so the engine
 * charges them the same slice in the housing block instead. Hence one line that
 * reads "rent plus utilities" or "mortgage plus utilities" either way.
 */

const CHICAGO = '16980';
const NEW_YORK = '35620';
const AUSTIN = '12420';
const SINGLE: Household = { filingStatus: 'single', children: 0, earners: 1 };

const city = (metroId: string, tenure: 'rent' | 'own', salary = 100_000) =>
  computeCity(defaultCityInputs(metroId, salary, SINGLE, tenure), SINGLE);

describe('what the published utilities row is made of', () => {
  it('splits into the part gross rent covers and the part it does not', () => {
    for (const p of ALL_SPENDING_PROFILES) {
      const split = p.utilitiesSplit!;
      // Within a dollar, not to the dollar: BLS publishes each component
      // rounded, so the five of them sum to the rounded total give or take $1.
      expect(
        Math.abs(split.insideGrossRent + split.telephone - p.categories.utilities),
      ).toBeLessThanOrEqual(2);
      // Gas, electricity, water and heating are the bulk of it everywhere.
      const share = split.insideGrossRent / p.categories.utilities;
      expect(share).toBeGreaterThan(0.5);
      expect(share).toBeLessThan(0.85);
    }
  });

  it('carries the split through interpolation between brackets', () => {
    const lower = ALL_SPENDING_PROFILES.find((p) => p.incomeFloor === 100_000)!;
    const upper = ALL_SPENDING_PROFILES.find((p) => p.incomeFloor === 150_000)!;
    const mid = spendingProfile((lower.meanIncome! + upper.meanIncome!) / 2);
    expect(mid.utilitiesSplit!.insideGrossRent).toBeCloseTo(
      (lower.utilitiesSplit!.insideGrossRent + upper.utilitiesSplit!.insideGrossRent) / 2,
      6,
    );
  });
});

describe('renters', () => {
  it('are not charged again for what the rent already covers', () => {
    const chicago = city(CHICAGO, 'rent');

    // Nothing added to housing: it is inside the rent they entered.
    expect(chicago.housing.utilities).toBe(0);

    // And the living-cost line is now just the phone bill, which is a small
    // fraction of what the whole utilities row would have been.
    const wholeRow = spendingProfile(100_000).categories.utilities;
    expect(chicago.living.utilities).toBeLessThan(wholeRow * 0.55);
    expect(chicago.living.utilities).toBeGreaterThan(0);
  });

  /*
   * The reported sizes, at $100,000. The exact figures move with the household
   * and the data vintage, so this pins the ORDER of the correction rather than
   * a number: over a thousand a year in a normal metro, more in an expensive
   * one, because the double charge was scaled by the local utility prices.
   */
  it('get back four figures a year in an expensive city', () => {
    // The owner's housing utilities are exactly what the renter was being
    // charged on top of a rent that already covered them. New York's utility
    // prices are high, so the double charge there was the biggest.
    expect(city(NEW_YORK, 'own').housing.utilities).toBeGreaterThan(2_000);
    expect(city(NEW_YORK, 'rent').housing.utilities).toBe(0);
  });
});

describe('owners', () => {
  it('are charged for utilities, because no mortgage covers them', () => {
    const owned = city(CHICAGO, 'own');
    expect(owned.housing.utilities).toBeGreaterThan(1_000);
    expect(owned.housing.total).toBeCloseTo(
      owned.housing.shelter +
        owned.housing.propertyTax +
        owned.housing.insurance +
        owned.housing.utilities +
        owned.housing.maintenance,
      6,
    );
  });

  it('pay more of them where utilities cost more', () => {
    expect(city(NEW_YORK, 'own').housing.utilities).toBeGreaterThan(
      city(CHICAGO, 'own').housing.utilities,
    );
  });

  it('and renters and owners are charged the same phone bill', () => {
    expect(city(CHICAGO, 'own').living.utilities).toBeCloseTo(
      city(CHICAGO, 'rent').living.utilities,
      6,
    );
  });
});

describe('the line says which one it is', () => {
  it('names rent, mortgage, or neither when the two sides differ', () => {
    expect(housingLabel('rent', 'rent')).toBe('Rent + utilities');
    expect(housingLabel('own', 'own')).toBe('Mortgage + utilities');
    expect(housingLabel('rent', 'own')).toBe('Housing + utilities');
    expect(housingLabel('own', 'rent')).toBe('Housing + utilities');
  });

  it('reports the tenure it computed', () => {
    expect(city(CHICAGO, 'rent').housing.tenure).toBe('rent');
    expect(city(CHICAGO, 'own').housing.tenure).toBe('own');
  });
});

/*
 * PROJECT.md section 9.2. Links shared before this keep the double charge
 * rather than silently changing under whoever they were sent to.
 */
describe('links pinned to an older release', () => {
  it('still charge the whole utilities row on top of gross rent', () => {
    const older = computeCity(
      defaultCityInputs(CHICAGO, 100_000, SINGLE, 'rent', 0.068, '2026.7'),
      SINGLE,
      { datasetVersion: '2026.7' },
    );
    const current = city(CHICAGO, 'rent');
    expect(older.living.utilities).toBeGreaterThan(current.living.utilities * 2);
    expect(older.housing.utilities).toBe(0);
  });

  /*
   * Measured against 2026.8, the release that made this change, rather than the
   * current one. Later releases restate every 2024 dollar in today's money,
   * which raises costs again for its own good reasons and would mask this.
   */
  it('and 2026.8 left the renter better off by the difference', () => {
    const at = (version: string) =>
      computeCity(defaultCityInputs(AUSTIN, 100_000, SINGLE, 'rent', 0.068, version), SINGLE, {
        datasetVersion: version,
      });
    expect(at('2026.8').leftover).toBeGreaterThan(at('2026.7').leftover);
  });
});
