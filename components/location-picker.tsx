'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';

import { locationById, searchLocations, type LocationOption } from '@/lib/locations';

interface Props {
  id: string;
  label: string;
  value: string | null;
  onChange: (id: string) => void;
  placeholder?: string;
}

/**
 * Searchable location picker over 438 metros and rural fallbacks.
 *
 * Hand-built rather than pulled from a component library, because it is the
 * only complex widget in the form — everything else is native HTML, which is
 * already accessible. Implements the WAI-ARIA combobox pattern: arrow keys
 * move the active option, Enter selects, Escape reverts, and the active option
 * is announced via aria-activedescendant rather than by moving focus.
 */
export function LocationPicker({ id, label, value, onChange, placeholder }: Props) {
  const selected = value ? locationById(value) : undefined;

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);

  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const options = useMemo(() => searchLocations(open ? query : ''), [open, query]);

  // Close when focus or a click leaves the widget entirely.
  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) close();
    }
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  });

  // Keep the active option scrolled into view without moving focus.
  useEffect(() => {
    if (!open) return;
    listRef.current
      ?.querySelector(`[data-index="${activeIndex}"]`)
      ?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex, open]);

  function close() {
    setOpen(false);
    setQuery('');
  }

  function choose(option: LocationOption | undefined) {
    if (!option) return;
    onChange(option.id);
    close();
    inputRef.current?.blur();
  }

  function onKeyDown(event: React.KeyboardEvent) {
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        if (!open) { setOpen(true); setActiveIndex(0); }
        else setActiveIndex((i) => Math.min(i + 1, options.length - 1));
        break;
      case 'ArrowUp':
        event.preventDefault();
        if (open) setActiveIndex((i) => Math.max(i - 1, 0));
        break;
      case 'Home':
        if (open) { event.preventDefault(); setActiveIndex(0); }
        break;
      case 'End':
        if (open) { event.preventDefault(); setActiveIndex(options.length - 1); }
        break;
      case 'Enter':
        if (open) { event.preventDefault(); choose(options[activeIndex]); }
        break;
      case 'Escape':
        if (open) { event.preventDefault(); close(); }
        break;
      case 'Tab':
        if (open) close();
        break;
    }
  }

  return (
    <div ref={rootRef} className="relative">
      <label
        htmlFor={id}
        className="mb-1 block text-[0.72rem] font-semibold uppercase tracking-[0.09em]"
        style={{ color: 'var(--muted)' }}
      >
        {label}
      </label>

      <input
        ref={inputRef}
        id={id}
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={open && options[activeIndex] ? `${listId}-${activeIndex}` : undefined}
        autoComplete="off"
        placeholder={placeholder ?? 'Search a city or state'}
        value={open ? query : (selected?.label ?? '')}
        onChange={(e) => {
          setQuery(e.target.value);
          setActiveIndex(0);
          if (!open) setOpen(true);
        }}
        onFocus={() => { setOpen(true); setActiveIndex(0); }}
        onKeyDown={onKeyDown}
        className="w-full rounded border px-2.5 py-1.5 text-sm"
        style={{
          background: 'var(--surface)',
          borderColor: open ? 'var(--accent)' : 'var(--rule-strong)',
          color: 'var(--ink)',
        }}
      />

      {open && (
        <ul
          ref={listRef}
          id={listId}
          role="listbox"
          aria-label={label}
          className="absolute z-30 mt-1 max-h-64 w-full overflow-y-auto rounded border shadow-lg"
          style={{ background: 'var(--surface)', borderColor: 'var(--rule-strong)' }}
        >
          {options.length === 0 && (
            <li className="px-3 py-3 text-sm" style={{ color: 'var(--muted)' }}>
              No location matches “{query}”. Try a state code, or “Rest of” for rural areas.
            </li>
          )}

          {options.map((option, index) => {
            const active = index === activeIndex;
            return (
              <li
                key={option.id}
                id={`${listId}-${index}`}
                data-index={index}
                role="option"
                aria-selected={option.id === value}
                onMouseEnter={() => setActiveIndex(index)}
                onMouseDown={(e) => { e.preventDefault(); choose(option); }}
                className="cursor-pointer px-2.5 py-1.5"
                style={{ background: active ? 'var(--accent-soft)' : 'transparent' }}
              >
                <span className="block text-sm" style={{ color: 'var(--ink)' }}>
                  {option.label}
                  {option.isRural && (
                    <span className="ml-2 text-xs" style={{ color: 'var(--muted)' }}>
                      rural
                    </span>
                  )}
                </span>
                {!option.isRural && (
                  <span className="block truncate text-xs" style={{ color: 'var(--muted)' }}>
                    {option.detail}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
