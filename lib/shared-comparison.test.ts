import { describe, expect, it } from 'vitest';

import { cardFilename, cardPath } from './share-card';
import { decodeComparison, encodeComparison, type SharedComparison } from './share-link';
import {
  comparisonFromShared,
  describeComparison,
  describeHousehold,
  jurisdictionsFor,
} from './shared-comparison';

const CHICAGO_TO_AUSTIN: SharedComparison = {
  datasetVersion: '2026.1',
  filingStatus: 'single',
  children: 0,
  origin: {
    metroId: '16980',
    grossSalary: 150_000,
    cars: 1,
    localOptIns: {},
    housing: { tenure: 'rent', monthlyRent: 1_430 },
  },
  destination: {
    metroId: '12420',
    grossSalary: 125_000,
    cars: 1,
    localOptIns: {},
    housing: { tenure: 'rent', monthlyRent: 1_726 },
  },
};

describe('comparisonFromShared', () => {
  it('reproduces the engine result for a decoded link', () => {
    const result = comparisonFromShared(CHICAGO_TO_AUSTIN);
    expect(Math.round(result.delta)).toBe(-9_680);
    expect(result.origin.metroId).toBe('16980');
    expect(result.destination.tax.state).toBe(0); // Texas
  });

  it('a link round trip produces an identical result', () => {
    const direct = comparisonFromShared(CHICAGO_TO_AUSTIN);
    const viaLink = comparisonFromShared(decodeComparison(encodeComparison(CHICAGO_TO_AUSTIN)));
    expect(viaLink.delta).toBeCloseTo(direct.delta, 6);
    expect(viaLink.breakEvenSalary).toBeCloseTo(direct.breakEvenSalary, 6);
  });
});

describe('describeHousehold', () => {
  it('names the filing status, the children and the tenure', () => {
    expect(describeHousehold(CHICAGO_TO_AUSTIN)).toBe('Single · no children · renting');
  });

  /*
   * A card that shows a couple's combined salary without saying it is combined
   * invites the reader to hold it against their own single wage. The earner
   * count also changes the money, so it belongs on the assumptions line.
   */
  it('says when two people are earning the salary', () => {
    const couple: SharedComparison = { ...CHICAGO_TO_AUSTIN, filingStatus: 'marriedJointly' };
    expect(describeHousehold({ ...couple, earners: 2 })).toContain('Married, jointly, both earning');
    expect(describeHousehold({ ...couple, earners: 1 })).toContain('Married, jointly ·');
    expect(describeHousehold(couple)).toContain('Married, jointly ·');
  });

  it('does not claim two earners for a household that has one adult', () => {
    // Old links can carry a stale count from before the status changed.
    expect(describeHousehold({ ...CHICAGO_TO_AUSTIN, earners: 2 })).toBe(
      'Single · no children · renting',
    );
  });

  it('counts one child in the singular', () => {
    expect(describeHousehold({ ...CHICAGO_TO_AUSTIN, children: 1 })).toContain('1 child ');
    expect(describeHousehold({ ...CHICAGO_TO_AUSTIN, children: 2 })).toContain('2 children');
  });

  it('says buying when the housing is owned', () => {
    const owning: SharedComparison = {
      ...CHICAGO_TO_AUSTIN,
      filingStatus: 'marriedJointly',
      children: 2,
      origin: {
        ...CHICAGO_TO_AUSTIN.origin,
        housing: {
          tenure: 'own',
          homePrice: 400_000,
          downPayment: 0.2,
          mortgageRate: 0.068,
          propertyTaxRate: 0.019,
        },
      },
      destination: {
        ...CHICAGO_TO_AUSTIN.destination,
        housing: {
          tenure: 'own',
          homePrice: 500_000,
          downPayment: 0.2,
          mortgageRate: 0.068,
          propertyTaxRate: 0.017,
        },
      },
    };
    expect(describeHousehold(owning)).toBe('Married, jointly · 2 children · buying');
  });

  it('reports both when a link renders in one city and owns in the other', () => {
    // The form moves the two together, but the wire format stores one tenure
    // per city — so a hand-built link can differ, and saying only the first
    // would misdescribe half the calculation.
    const mixed: SharedComparison = {
      ...CHICAGO_TO_AUSTIN,
      destination: {
        ...CHICAGO_TO_AUSTIN.destination,
        housing: {
          tenure: 'own',
          homePrice: 500_000,
          downPayment: 0.2,
          mortgageRate: 0.068,
          propertyTaxRate: 0.017,
        },
      },
    };
    expect(describeHousehold(mixed)).toContain('renting → buying');
  });
});

describe('jurisdictionsFor', () => {
  it('applies New York City only when the user opted in', () => {
    const inCity = jurisdictionsFor({
      ...CHICAGO_TO_AUSTIN.origin,
      metroId: '35620',
      localOptIns: { nyc: true, yonkers: false },
    });
    expect(inCity.map((j) => j.id)).toContain('nyc');

    const suburb = jurisdictionsFor({
      ...CHICAGO_TO_AUSTIN.origin,
      metroId: '35620',
      localOptIns: { nyc: false, yonkers: false },
    });
    expect(suburb).toHaveLength(0);
  });

  it('applies non-optional local taxes without asking', () => {
    // Philadelphia's metro carries Pennsylvania's local tax by default.
    const philadelphia = jurisdictionsFor({ ...CHICAGO_TO_AUSTIN.origin, metroId: '37980' });
    expect(philadelphia.length).toBeGreaterThan(0);
  });

  it('is empty for the vast majority of metros', () => {
    expect(jurisdictionsFor({ ...CHICAGO_TO_AUSTIN.destination, metroId: '12420' })).toHaveLength(0);
  });
});

describe('describeComparison', () => {
  const summary = describeComparison(comparisonFromShared(CHICAGO_TO_AUSTIN));

  it('states the direction and the amount in the title', () => {
    expect(summary.title).toBe('Chicago, IL → Austin, TX: $9,680 a year worse off');
  });

  it('puts the actionable break-even figure in the description', () => {
    // Says which side of the offer it falls on. "Break-even salary: $139,163"
    // alone left the reader to subtract the salary themselves to find out
    // whether that was good news or bad — and here it is bad, matching the
    // "worse off" title rather than reading against it.
    expect(summary.description).toMatch(/\$139,163/);
    expect(summary.description).toMatch(/\$14,163 more than the \$125,000 you'd be paid there/);
    expect(summary.description).toMatch(/21\.0% less spare cash/);
  });

  it('drops the percentage when the origin city leaves nothing to measure', () => {
    const struggling = {
      ...CHICAGO_TO_AUSTIN,
      filingStatus: 'marriedJointly' as const,
      children: 2,
      origin: { ...CHICAGO_TO_AUSTIN.origin, grossSalary: 60_000 },
      destination: { ...CHICAGO_TO_AUSTIN.destination, grossSalary: 60_000 },
    };
    const description = describeComparison(comparisonFromShared(struggling)).description;
    expect(description).not.toMatch(/spare cash/);
    expect(description).toMatch(/a month/);
  });

  it('says "better off" when the move wins', () => {
    const sameSalary = {
      ...CHICAGO_TO_AUSTIN,
      destination: { ...CHICAGO_TO_AUSTIN.destination, grossSalary: 150_000 },
    };
    expect(describeComparison(comparisonFromShared(sameSalary)).title).toMatch(/better off/);
  });

  it('produces a filename-safe slug with no punctuation', () => {
    expect(summary.slug).toBe('chicago-il-to-austin-tx');
    expect(cardFilename(summary.slug)).toBe('chicago-il-to-austin-tx-packorstay.png');
  });

  it('handles rural locations in the slug', () => {
    const rural = {
      ...CHICAGO_TO_AUSTIN,
      destination: { ...CHICAGO_TO_AUSTIN.destination, metroId: 'rest-of-MT' },
    };
    const slug = describeComparison(comparisonFromShared(rural)).slug;
    expect(slug).toBe('chicago-il-to-rest-of-montana');
    expect(slug).toMatch(/^[a-z0-9-]+$/);
  });
});

describe('cardPath', () => {
  it('points at the one image used for both previews and downloads', () => {
    const payload = encodeComparison(CHICAGO_TO_AUSTIN);
    expect(cardPath(payload)).toBe(`/api/card/${payload}`);
  });
});
