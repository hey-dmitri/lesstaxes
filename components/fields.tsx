'use client';

import { useId, useRef } from 'react';

const labelClass = 'mb-1 block text-[0.72rem] font-semibold uppercase tracking-[0.09em]';
const labelStyle = { color: 'var(--muted)' } as const;

const inputClass = 'w-full rounded border px-2.5 py-1.5 text-sm tnum';
const inputStyle = {
  background: 'var(--surface)',
  borderColor: 'var(--rule-strong)',
  color: 'var(--ink)',
} as const;

/** Text shown under a field when its value came from the dataset, not the user. */
export function PrefillNote({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-0.5 text-[0.76rem] leading-snug" style={{ color: 'var(--muted)' }}>
      {children}
    </p>
  );
}

interface MoneyFieldProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
  hint?: React.ReactNode;
  suffix?: string;
  min?: number;
  max?: number;
}

export function MoneyField({ label, value, onChange, hint, suffix, min = 0, max = 100_000_000 }: MoneyFieldProps) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className={labelClass} style={labelStyle}>
        {label}
      </label>
      <div className="relative">
        <span
          className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-sm"
          style={{ color: 'var(--muted)' }}
          aria-hidden="true"
        >
          $
        </span>
        <input
          id={id}
          type="text"
          inputMode="numeric"
          className={`${inputClass} pl-6 ${suffix ? 'pr-12' : ''}`}
          style={inputStyle}
          value={value === 0 ? '' : value.toLocaleString('en-US')}
          onChange={(e) => {
            const digits = e.target.value.replace(/[^0-9]/g, '');
            const next = digits === '' ? 0 : Number(digits);
            onChange(Math.min(Math.max(next, min), max));
          }}
        />
        {suffix && (
          <span
            className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-xs"
            style={{ color: 'var(--muted)' }}
          >
            {suffix}
          </span>
        )}
      </div>
      {hint && <PrefillNote>{hint}</PrefillNote>}
    </div>
  );
}

interface PercentFieldProps {
  label: string;
  /** Stored as a fraction. 0.068 displays as 6.8. */
  value: number;
  onChange: (value: number) => void;
  hint?: React.ReactNode;
  max?: number;
  step?: number;
}

export function PercentField({ label, value, onChange, hint, max = 100, step = 0.01 }: PercentFieldProps) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className={labelClass} style={labelStyle}>
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          type="number"
          inputMode="decimal"
          step={step}
          min={0}
          max={max}
          className={`${inputClass} pr-7`}
          style={inputStyle}
          value={Number((value * 100).toFixed(3))}
          onChange={(e) => {
            const next = Number(e.target.value);
            onChange(Number.isFinite(next) ? Math.min(Math.max(next, 0), max) / 100 : 0);
          }}
        />
        <span
          className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-sm"
          style={{ color: 'var(--muted)' }}
          aria-hidden="true"
        >
          %
        </span>
      </div>
      {hint && <PrefillNote>{hint}</PrefillNote>}
    </div>
  );
}

interface CountFieldProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
  hint?: React.ReactNode;
  max?: number;
}

export function CountField({ label, value, onChange, hint, max = 12 }: CountFieldProps) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className={labelClass} style={labelStyle}>
        {label}
      </label>
      <div className="flex items-stretch rounded border" style={{ borderColor: 'var(--rule-strong)', background: 'var(--surface)' }}>
        <button
          type="button"
          aria-label={`Decrease ${label.toLowerCase()}`}
          onClick={() => onChange(Math.max(0, value - 1))}
          disabled={value <= 0}
          className="px-2.5 text-base leading-none disabled:opacity-30"
          style={{ color: 'var(--muted)' }}
        >
          −
        </button>
        <input
          id={id}
          type="text"
          inputMode="numeric"
          className="w-full border-x px-2 py-1.5 text-center text-sm tnum"
          style={{ background: 'transparent', borderColor: 'var(--rule)', color: 'var(--ink)' }}
          value={value}
          onChange={(e) => {
            const digits = e.target.value.replace(/[^0-9]/g, '');
            onChange(Math.min(digits === '' ? 0 : Number(digits), max));
          }}
        />
        <button
          type="button"
          aria-label={`Increase ${label.toLowerCase()}`}
          onClick={() => onChange(Math.min(max, value + 1))}
          disabled={value >= max}
          className="px-2.5 text-base leading-none disabled:opacity-30"
          style={{ color: 'var(--muted)' }}
        >
          +
        </button>
      </div>
      {hint && <PrefillNote>{hint}</PrefillNote>}
    </div>
  );
}

interface SelectFieldProps<T extends string> {
  label: string;
  value: T;
  onChange: (value: T) => void;
  options: Array<{ value: T; label: string }>;
  hint?: React.ReactNode;
}

export function SelectField<T extends string>({ label, value, onChange, options, hint }: SelectFieldProps<T>) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className={labelClass} style={labelStyle}>
        {label}
      </label>
      <select
        id={id}
        className="w-full rounded border px-2.5 py-1.5 text-sm"
        style={inputStyle}
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {hint && <PrefillNote>{hint}</PrefillNote>}
    </div>
  );
}

interface SegmentedProps<T extends string> {
  label: string;
  value: T;
  onChange: (value: T) => void;
  options: Array<{ value: T; label: string }>;
}

/**
 * Two or three mutually exclusive choices, as a radio group.
 *
 * Declaring role="radiogroup" is a promise about behaviour, not just a label.
 * A screen-reader user told "radio group, 1 of 2" reaches for the arrow keys,
 * and this previously did nothing with them while putting every option in the
 * tab order — so it announced as a radio group and behaved like a row of
 * buttons. Arrow keys now move and select, Home and End jump to the ends, and
 * only the selected option is tabbable, which is the roving tabindex the
 * pattern requires.
 */
export function Segmented<T extends string>({ label, value, onChange, options }: SegmentedProps<T>) {
  const groupRef = useRef<HTMLDivElement>(null);

  function move(delta: number) {
    const index = options.findIndex((o) => o.value === value);
    const next = (index + delta + options.length) % options.length;
    onChange(options[next].value);
    // Selection follows focus in this pattern, so focus has to follow with it.
    const buttons = groupRef.current?.querySelectorAll('button');
    (buttons?.[next] as HTMLButtonElement | undefined)?.focus();
  }

  function select(index: number) {
    onChange(options[index].value);
    const buttons = groupRef.current?.querySelectorAll('button');
    (buttons?.[index] as HTMLButtonElement | undefined)?.focus();
  }

  function onKeyDown(event: React.KeyboardEvent) {
    switch (event.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        event.preventDefault();
        move(1);
        break;
      case 'ArrowLeft':
      case 'ArrowUp':
        event.preventDefault();
        move(-1);
        break;
      case 'Home':
        event.preventDefault();
        select(0);
        break;
      case 'End':
        event.preventDefault();
        select(options.length - 1);
        break;
    }
  }

  return (
    <div>
      <span className={labelClass} style={labelStyle}>
        {label}
      </span>
      <div
        ref={groupRef}
        role="radiogroup"
        aria-label={label}
        onKeyDown={onKeyDown}
        className="flex rounded border p-0.5"
        style={{ borderColor: 'var(--rule-strong)', background: 'var(--surface-sunken)' }}
      >
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={selected}
              // Roving tabindex: one stop for the whole group, not one each.
              tabIndex={selected ? 0 : -1}
              onClick={() => onChange(option.value)}
              className="flex-1 rounded px-3 py-1.5 text-sm font-medium transition-colors"
              style={{
                background: selected ? 'var(--surface)' : 'transparent',
                color: selected ? 'var(--ink)' : 'var(--muted)',
                boxShadow: selected ? '0 1px 2px rgba(0,0,0,0.08)' : 'none',
              }}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function Checkbox({
  label,
  checked,
  onChange,
  hint,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  hint?: React.ReactNode;
}) {
  const id = useId();
  return (
    <div className="flex items-start gap-2.5">
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 shrink-0"
        style={{ accentColor: 'var(--accent)' }}
      />
      <div>
        <label htmlFor={id} className="text-sm" style={{ color: 'var(--ink)' }}>
          {label}
        </label>
        {hint && <PrefillNote>{hint}</PrefillNote>}
      </div>
    </div>
  );
}
