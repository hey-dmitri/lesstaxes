'use client';

import { useSyncExternalStore } from 'react';

import { SITE_SLUG } from '@/lib/site';

type Theme = 'light' | 'auto' | 'dark';

/** Must match the pre-paint script in app/layout.tsx, which builds the same key. */
const STORAGE_KEY = `${SITE_SLUG}-theme`;

const OPTIONS: Array<{ value: Theme; label: string; glyph: string }> = [
  { value: 'light', label: 'Light theme', glyph: '☀' },
  { value: 'auto', label: 'Match system theme', glyph: '◑' },
  { value: 'dark', label: 'Dark theme', glyph: '☾' },
];

/**
 * The chosen theme lives on the document element, not in React state.
 *
 * An inline script in <head> sets it before first paint, so there is no flash
 * of the wrong theme. That makes the DOM the source of truth, and React a
 * subscriber to it — which is precisely what useSyncExternalStore is for.
 * Reading it in an effect instead would mean rendering the wrong toggle state
 * for a frame and would fight React's set-state-in-effect rule.
 */
const listeners = new Set<() => void>();

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  return () => listeners.delete(onChange);
}

function getSnapshot(): Theme {
  const value = document.documentElement.dataset.theme;
  return value === 'dark' || value === 'light' ? value : 'auto';
}

/** The server cannot know the preference, so it renders the neutral option. */
function getServerSnapshot(): Theme {
  return 'auto';
}

function setTheme(theme: Theme) {
  const root = document.documentElement;
  if (theme === 'auto') delete root.dataset.theme;
  else root.dataset.theme = theme;

  try {
    if (theme === 'auto') localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // Private browsing can block storage. The theme still applies for this visit.
  }

  for (const listener of listeners) listener();
}

export function ThemeToggle() {
  const theme = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  return (
    <div
      role="radiogroup"
      aria-label="Colour theme"
      className="flex shrink-0 rounded border"
      style={{ borderColor: 'var(--rule-strong)', background: 'var(--surface)' }}
    >
      {OPTIONS.map((option) => {
        const selected = theme === option.value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={option.label}
            title={option.label}
            onClick={() => setTheme(option.value)}
            className="px-2.5 py-1.5 text-sm leading-none transition-colors"
            style={{
              color: selected ? 'var(--surface)' : 'var(--muted)',
              background: selected ? 'var(--accent)' : 'transparent',
            }}
          >
            <span aria-hidden="true">{option.glyph}</span>
          </button>
        );
      })}
    </div>
  );
}
