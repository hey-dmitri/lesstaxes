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

/** What a search found, and whether the reader is seeing all of it. */
export interface LocationResults {
  options: LocationOption[];
  /** Matches before any cap. Equals options.length when nothing was dropped. */
  total: number;
}

/**
 * A backstop, not a policy.
 *
 * There was a cap of 60 and no sign of it anywhere. With an empty box that
 * returned the first 60 of 438 alphabetically, so the list ran from Aberdeen
 * to Chambersburg and simply stopped — no message, no count, nothing to say
 * that Chicago and New York were further down a list you could not reach by
 * scrolling. Anyone who did not think to type would conclude their city was
 * missing, which is the worst thing a picker can do.
 *
 * It now sits above the total, so nothing is ever hidden. The picker keeps
 * typing responsive by deferring the filter rather than by truncating the
 * answer, and the count is shown either way so any future cap announces
 * itself instead of looking like the end of the data.
 */
const RENDER_LIMIT = 1_000;

/**
 * Filter locations for the picker.
 *
 * Ranks exact-prefix matches first so typing "aus" surfaces Austin ahead of
 * places that merely contain the letters.
 */
export function searchLocations(query: string, limit = RENDER_LIMIT): LocationResults {
  const q = query.trim().toLowerCase();
  if (!q) return { options: LOCATIONS.slice(0, limit), total: LOCATIONS.length };

  const prefix: LocationOption[] = [];
  const contains: LocationOption[] = [];

  for (const location of LOCATIONS) {
    if (location.label.toLowerCase().startsWith(q)) prefix.push(location);
    else if (location.search.includes(q)) contains.push(location);
  }

  const all = [...prefix, ...contains];
  return { options: all.slice(0, limit), total: all.length };
}
