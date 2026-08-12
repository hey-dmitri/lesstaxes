import { allMetros } from '@/engine';

export interface LocationOption {
  id: string;
  /** What the user sees: "Chicago, IL". */
  label: string;
  /** Full CBSA title, shown as secondary text: "Chicago-Naperville-Elgin, IL-IN". */
  detail: string;
  state: string;
  isRural: boolean;
  /** Pre-lowercased haystack, so filtering does no work per keystroke. */
  search: string;
}

export const LOCATIONS: LocationOption[] = allMetros().map((m) => ({
  id: m.id,
  label: m.shortName,
  detail: m.name,
  state: m.primaryState,
  isRural: m.type === 'restOfState',
  search: `${m.shortName} ${m.name} ${m.primaryState}`.toLowerCase(),
}));

const BY_ID = new Map(LOCATIONS.map((l) => [l.id, l]));

export function locationById(id: string): LocationOption | undefined {
  return BY_ID.get(id);
}

/**
 * Filter locations for the picker.
 *
 * Ranks exact-prefix matches first so typing "aus" surfaces Austin ahead of
 * places that merely contain the letters. Capped, because rendering 438 rows
 * on every keystroke is wasted work and an unusable list.
 */
export function searchLocations(query: string, limit = 60): LocationOption[] {
  const q = query.trim().toLowerCase();
  if (!q) return LOCATIONS.slice(0, limit);

  const prefix: LocationOption[] = [];
  const contains: LocationOption[] = [];

  for (const location of LOCATIONS) {
    if (location.label.toLowerCase().startsWith(q)) prefix.push(location);
    else if (location.search.includes(q)) contains.push(location);
    if (prefix.length >= limit) break;
  }

  return [...prefix, ...contains].slice(0, limit);
}
