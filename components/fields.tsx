'use client';

import { useId } from 'react';

const labelClass = 'mb-1.5 block text-[0.7rem] font-semibold uppercase tracking-[0.09em]';
const labelStyle = { color: 'var(--muted)' } as const;

const inputClass = 'w-full rounded border px-3 py-2.5 text-base tnum';
const inputStyle = {
  background: 'var(--surface)',
  borderColor: 'var(--rule-strong)',
  color: 'var(--ink)',
} as const;

/** Text shown under a field when its value came from the dataset, not the user. */
export function PrefillNote({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-1 text-xs" style={{ color: 'var(--muted)' }}>
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
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-base"
          style={{ color: 'var(--muted)' }}
          aria-hidden="true"
        >
          $
        </span>
        <input
          id={id}
          type="text"
          inputMode="numeric"
          className={`${inputClass} pl-7 ${suffix ? 'pr-14' : ''}`}
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
            className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm"
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
          className={`${inputClass} pr-8`}
          style={inputStyle}
          value={Number((value * 100).toFixed(3))}
          onChange={(e) => {
            const next = Number(e.target.value);
            onChange(Number.isFinite(next) ? Math.min(Math.max(next, 0), max) / 100 : 0);
          }}
        />
        <span
          className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-base"
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
          className="px-3 text-lg leading-none disabled:opacity-30"
          style={{ color: 'var(--muted)' }}
        >
          −
        </button>
        <input
          id={id}
          type="text"
          inputMode="numeric"
          className="w-full border-x px-2 py-2.5 text-center text-base tnum"
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
          className="px-3 text-lg leading-none disabled:opacity-30"
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
        className="w-full rounded border px-3 py-2.5 text-base"
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

/** Two or three mutually exclusive choices, as a radio group. */
export function Segmented<T extends string>({ label, value, onChange, options }: SegmentedProps<T>) {
  return (
    <div>
      <span className={labelClass} style={labelStyle}>
        {label}
      </span>
      <div
        role="radiogroup"
        aria-label={label}
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
              onClick={() => onChange(option.value)}
              className="flex-1 rounded px-3 py-2 text-sm font-medium transition-colors"
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
