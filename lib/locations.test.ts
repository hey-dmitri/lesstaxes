import { describe, expect, it } from 'vitest';

import { LOCATIONS, locationById, searchLocations } from './locations';

describe('LOCATIONS', () => {
  it('covers every metro plus every rural fallback', () => {
    expect(LOCATIONS).toHaveLength(438);
    expect(LOCATIONS.filter((l) => l.isRural)).toHaveLength(51);
  });

  it('is sorted so the picker reads alphabetically', () => {
    for (let i = 1; i < LOCATIONS.length; i++) {
      expect(LOCATIONS[i - 1].label.localeCompare(LOCATIONS[i].label)).toBeLessThanOrEqual(0);
    }
  });

  it('gives every entry a label, a state and a search haystack', () => {
    for (const l of LOCATIONS) {
      expect(l.label.length).toBeGreaterThan(0);
      expect(l.state).toMatch(/^[A-Z]{2}$/);
      expect(l.search).toBe(l.search.toLowerCase());
    }
  });
});

describe('searchLocations', () => {
  it('ranks a prefix match above a mere substring match', () => {
    const results = searchLocations('austin');
    expect(results[0].label).toBe('Austin, TX');
  });

  it('finds a city by its short name', () => {
    expect(searchLocations('chicago').some((l) => l.id === '16980')).toBe(true);
  });

  it('finds a city by a name only present in the full CBSA title', () => {
    // "Naperville" appears only in "Chicago-Naperville-Elgin, IL-IN".
    expect(searchLocations('naperville').some((l) => l.id === '16980')).toBe(true);
  });

  it('finds every location in a state by its code', () => {
    const texas = searchLocations('tx', 500);
    expect(texas.length).toBeGreaterThan(20);
    expect(texas.every((l) => l.search.includes('tx'))).toBe(true);
  });

  it('surfaces rural fallbacks', () => {
    const rural = searchLocations('rest of montana');
    expect(rural[0]?.id).toBe('rest-of-MT');
  });

  it('returns nothing for a nonsense query rather than everything', () => {
    expect(searchLocations('zzzzqqq')).toHaveLength(0);
  });

  it('caps results so the list stays usable', () => {
    expect(searchLocations('', 25)).toHaveLength(25);
    expect(searchLocations('a', 10).length).toBeLessThanOrEqual(10);
  });

  it('ignores surrounding whitespace and case', () => {
    expect(searchLocations('  AUSTIN  ')[0].label).toBe('Austin, TX');
  });
});

describe('locationById', () => {
  it('resolves known ids', () => {
    expect(locationById('16980')?.label).toBe('Chicago, IL');
    expect(locationById('rest-of-WY')?.isRural).toBe(true);
  });

  it('returns undefined for an unknown id rather than throwing', () => {
    expect(locationById('99999')).toBeUndefined();
  });
});
