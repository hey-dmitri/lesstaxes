import { describe, expect, it } from 'vitest';

import {
  decodeComparison,
  encodeComparison,
  sharePath,
  SHARE_FORMAT_VERSION,
  type SharedComparison,
} from './share-link';

/**
 * Decoding always yields an explicit true/false for every known opt-in
 * jurisdiction, rather than omitting the ones that are off. That canonical
 * shape is what consumers get, so the fixtures use it too and round trips are
 * exact rather than merely equivalent.
 */
const NO_OPT_INS = { nyc: false, yonkers: false };

const RENTING: SharedComparison = {
  datasetVersion: '2026.1',
  filingStatus: 'single',
  children: 0,
  origin: {
    metroId: '16980',
    grossSalary: 150_000,
    cars: 1,
    localOptIns: NO_OPT_INS,
    housing: { tenure: 'rent', monthlyRent: 1_430 },
  },
  destination: {
    metroId: '12420',
    grossSalary: 125_000,
    cars: 1,
    localOptIns: NO_OPT_INS,
    housing: { tenure: 'rent', monthlyRent: 1_726 },
  },
};

const OWNING: SharedComparison = {
  datasetVersion: '2026.1',
  filingStatus: 'marriedJointly',
  children: 3,
  origin: {
    metroId: '35620',
    grossSalary: 240_000,
    cars: 0,
    localOptIns: { nyc: true, yonkers: false },
    housing: { tenure: 'rent', monthlyRent: 3_400 },
  },
  destination: {
    metroId: 'rest-of-MT',
    grossSalary: 180_000,
    cars: 3,
    localOptIns: NO_OPT_INS,
    housing: {
      tenure: 'own',
      homePrice: 615_000,
      downPayment: 0.2,
      mortgageRate: 0.068,
      propertyTaxRate: 0.0154,
    },
  },
};

describe('round trip', () => {
  it('preserves a renting comparison exactly', () => {
    expect(decodeComparison(encodeComparison(RENTING))).toEqual(RENTING);
  });

  it('preserves owning, rural destinations, children and opt-ins exactly', () => {
    const decoded = decodeComparison(encodeComparison(OWNING));
    expect(decoded.destination.metroId).toBe('rest-of-MT');
    expect(decoded.origin.localOptIns.nyc).toBe(true);
    expect(decoded.origin.localOptIns.yonkers).toBe(false);
    expect(decoded.children).toBe(3);
    expect(decoded.destination.housing).toEqual(OWNING.destination.housing);
  });

  it('preserves every filing status', () => {
    for (const filingStatus of ['single', 'marriedJointly', 'marriedSeparately', 'headOfHousehold'] as const) {
      const decoded = decodeComparison(encodeComparison({ ...RENTING, filingStatus }));
      expect(decoded.filingStatus).toBe(filingStatus);
    }
  });

  it('keeps leading zeros in metro ids', () => {
    // CBSA codes are five digits and some begin with zero.
    const input = { ...RENTING, origin: { ...RENTING.origin, metroId: '01234' } };
    expect(decodeComparison(encodeComparison(input)).origin.metroId).toBe('01234');
  });

  it('preserves rates exactly, not approximately', () => {
    const decoded = decodeComparison(encodeComparison(OWNING));
    const housing = decoded.destination.housing;
    if (housing.tenure !== 'own') throw new Error('expected owning');
    expect(housing.mortgageRate).toBe(0.068);
    expect(housing.propertyTaxRate).toBe(0.0154);
  });

  it('is deterministic — the same inputs always give the same link', () => {
    expect(encodeComparison(RENTING)).toBe(encodeComparison(RENTING));
  });
});

describe('the dataset version travels with the link', () => {
  it('round-trips the version', () => {
    expect(decodeComparison(encodeComparison(RENTING)).datasetVersion).toBe('2026.1');
  });

  it('carries a future version unchanged', () => {
    const future = { ...RENTING, datasetVersion: '2027.3' };
    expect(decodeComparison(encodeComparison(future)).datasetVersion).toBe('2027.3');
  });

  it('changes the link when only the dataset version changes', () => {
    // Two links to the same inputs on different data must not collide.
    expect(encodeComparison(RENTING)).not.toBe(
      encodeComparison({ ...RENTING, datasetVersion: '2027.1' }),
    );
  });
});

describe('link length', () => {
  it('stays short enough to paste into an email without wrapping', () => {
    expect(encodeComparison(RENTING).length).toBeLessThan(60);
    expect(encodeComparison(OWNING).length).toBeLessThan(90);
  });

  it('is URL-safe with no characters needing escaping', () => {
    for (const input of [RENTING, OWNING]) {
      expect(encodeComparison(input)).toMatch(/^[A-Za-z0-9_-]+$/);
    }
  });

  it('produces a usable path', () => {
    expect(sharePath(RENTING)).toMatch(/^\/r\/[A-Za-z0-9_-]+$/);
  });
});

describe('malformed links fail loudly', () => {
  it('rejects junk', () => {
    expect(() => decodeComparison('not a link!')).toThrow(/not valid/);
  });

  it('rejects an empty payload', () => {
    expect(() => decodeComparison('')).toThrow();
  });

  it('rejects a truncated payload', () => {
    const full = encodeComparison(RENTING);
    expect(() => decodeComparison(full.slice(0, 6))).toThrow();
  });

  it('rejects trailing junk rather than ignoring it', () => {
    expect(() => decodeComparison(`${encodeComparison(RENTING)}AAAA`)).toThrow(/trailing/);
  });

  it('reports a plausible future format version by name', () => {
    // First varint is the format version; 7 is plausible, just not ours.
    const bytes = new Uint8Array([7, 0xd2, 0x0f, 1, 0, 0]);
    const payload = Buffer.from(bytes)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
    expect(() => decodeComparison(payload)).toThrow(/version 7 of this site/);
  });

  it('calls an absurd format number what it is — an invalid link', () => {
    // Random text decodes to a nonsense format number. Blaming a version that
    // never existed would be baffling; this is simply not one of our links.
    expect(() => decodeComparison('garbage123')).toThrow(/not valid/);
  });

  it('never silently falls back to defaults', () => {
    // A bad link must throw, not quietly answer a question nobody asked.
    for (const bad of ['AAAA', 'zzzz', 'A', '____']) {
      let threw = false;
      try {
        decodeComparison(bad);
      } catch {
        threw = true;
      }
      expect(threw).toBe(true);
    }
  });
});

describe('encoding guards', () => {
  it('refuses an unknown location id rather than emitting a broken link', () => {
    expect(() =>
      encodeComparison({ ...RENTING, origin: { ...RENTING.origin, metroId: 'nowhere' } }),
    ).toThrow(/cannot encode location/);
  });

  it('refuses a malformed dataset version', () => {
    expect(() => encodeComparison({ ...RENTING, datasetVersion: 'latest' })).toThrow(/dataset version/);
  });

  it('declares its format version', () => {
    expect(SHARE_FORMAT_VERSION).toBe(1);
  });
});

describe('large but legitimate values', () => {
  it('handles a very high salary and an expensive home', () => {
    const rich: SharedComparison = {
      ...OWNING,
      origin: {
        ...OWNING.origin,
        grossSalary: 5_000_000,
        housing: { tenure: 'own', homePrice: 12_000_000, downPayment: 0.5, mortgageRate: 0.0725, propertyTaxRate: 0.0212 },
      },
    };
    expect(decodeComparison(encodeComparison(rich))).toEqual(rich);
  });

  it('handles zero salary and no cars', () => {
    const broke: SharedComparison = {
      ...RENTING,
      origin: { ...RENTING.origin, grossSalary: 0, cars: 0 },
    };
    expect(decodeComparison(encodeComparison(broke))).toEqual(broke);
  });
});
