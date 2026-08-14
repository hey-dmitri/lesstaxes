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
    const results = searchLocations('austin').options;
    expect(results[0].label).toBe('Austin, TX');
  });

  it('finds a city by its short name', () => {
    expect(searchLocations('chicago').options.some((l) => l.id === '16980')).toBe(true);
  });

  it('finds a city by a name only present in the full CBSA title', () => {
    // "Naperville" appears only in "Chicago-Naperville-Elgin, IL-IN".
    expect(searchLocations('naperville').options.some((l) => l.id === '16980')).toBe(true);
  });

  it('finds every location in a state by its code', () => {
    const texas = searchLocations('tx', 500).options;
    expect(texas.length).toBeGreaterThan(20);
    expect(texas.every((l) => l.search.includes('tx'))).toBe(true);
  });

  it('surfaces rural fallbacks', () => {
    const rural = searchLocations('rest of montana').options;
    expect(rural[0]?.id).toBe('rest-of-MT');
  });

  it('returns nothing for a nonsense query rather than everything', () => {
    expect(searchLocations('zzzzqqq').options).toHaveLength(0);
  });

  it('caps what it renders but always reports the true total', () => {
    // The cap used to be silent. An empty box returned the first 60 of 438
    // alphabetically and the list simply stopped at Chambersburg, PA — no
    // count, no message, nothing to suggest Chicago was further down.
    const capped = searchLocations('', 25);
    expect(capped.options).toHaveLength(25);
    expect(capped.total).toBe(LOCATIONS.length);
    expect(capped.total).toBeGreaterThan(400);

    const narrow = searchLocations('a', 10);
    expect(narrow.options.length).toBeLessThanOrEqual(10);
    expect(narrow.total).toBeGreaterThan(10);
  });

  it('shows every location when nothing is typed and the cap allows it', () => {
    const all = searchLocations('', 1_000);
    expect(all.options).toHaveLength(LOCATIONS.length);
    expect(all.options.length).toBe(all.total);
  });

  it('reaches the far end of the alphabet, which the old cap could not', () => {
    const all = searchLocations('', 1_000).options;
    const labels = all.map((l) => l.label);
    expect(labels.some((l) => l.startsWith('Chicago'))).toBe(true);
    expect(labels.some((l) => l.startsWith('New York'))).toBe(true);
    expect(labels.some((l) => l.startsWith('Yuma'))).toBe(true);
  });

  it('ignores surrounding whitespace and case', () => {
    expect(searchLocations('  AUSTIN  ').options[0].label).toBe('Austin, TX');
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
