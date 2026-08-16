'use client';

import { useEffect, useId, useRef, useState } from 'react';

const labelClass = 'mb-1 block text-[0.72rem] font-semibold uppercase tracking-[0.09em]';
const labelStyle = { color: 'var(--muted)' } as const;

const inputClass = 'w-full rounded border px-2.5 py-1.5 text-sm tnum';
const inputStyle = {
  background: 'var(--surface)',
  borderColor: 'var(--rule-strong)',
  color: 'var(--ink)',
} as const;

/**
 * The numbered marker on each section that wants something from you.
 *
 * The form is three inputs in three boxes, and nothing said so — the two city
 * columns arrived pre-filled, which read as a finished demo rather than as
 * blanks. Numbering them makes the sequence plain, and the filled-in state
 * turns the marker quiet so the eye moves on to whatever is still outstanding.
 */
export function StepBadge({ n, done }: { n: number; done?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className="inline-flex h-[1.35rem] w-[1.35rem] shrink-0 items-center justify-center rounded-full text-[0.72rem] font-bold"
      style={
        done
          ? { background: 'var(--surface-sunken)', color: 'var(--muted)', boxShadow: 'inset 0 0 0 1px var(--rule-strong)' }
          : { background: 'var(--accent)', color: '#ffffff' }
      }
    >
      {n}
    </span>
  );
}

/**
 * The grey line under a field, saying where its number came from.
 *
 * `lines` RESERVES HEIGHT, and it exists because the two city columns are
 * separate cards rather than rows of one grid: nothing makes a field in the
 * left column line up with the same field on the right, so a hint that wrapped
 * to two lines in one and one line in the other pushed everything below it
 * half a line out of step — the rent boxes, the car steppers, the take-home
 * figures, all of it. Reserving the same space in both keeps them level
 * whatever either sentence happens to say.
 */
export function PrefillNote({ children, lines }: { children: React.ReactNode; lines?: number }) {
  return (
    <p
      className="mt-0.5 text-[0.76rem] leading-snug"
      // leading-snug is 1.375, so a line is 1.375em of this element's own size.
      style={{ color: 'var(--muted)', minHeight: lines ? `${lines * 1.375}em` : undefined }}
    >
      {children}
    </p>
  );
}

/**
 * A small ⓘ that opens a note over the page, and closes on the next click.
 *
 * IT MUST NOT ADD A LINE TO THE TABLE. The first version expanded the note in
 * place, which pushed every row below it down and made a table built to be
 * skimmed reflow whenever somebody asked a question about one line of it. A
 * note about a row should not rearrange the rows.
 *
 * A BUTTON, NOT A HOVER TOOLTIP. The same argument that moved the data page's
 * source links out of a `title` attribute: a phone cannot hover and a keyboard
 * cannot reach one, so on the two devices most likely to be used the
 * explanation would not be there at all.
 *
 * ANY click closes it, not only a click outside — an explanation that takes
 * two gestures to dismiss is worse than one that takes one, and there is
 * nothing inside to interact with. Escape closes it too, and the listener is
 * attached a tick late so the click that opened it does not immediately shut
 * it again.
 */
export function InfoDot({ label, children }: { label: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const id = useId();

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    const timer = window.setTimeout(() => {
      document.addEventListener('click', close);
      document.addEventListener('keydown', onKey);
    }, 0);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('click', close);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <span className="relative inline-flex align-baseline">
      <button
        type="button"
        onClick={() => setOpen((was) => !was)}
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        aria-label={label}
        className="inline-flex h-[1.05rem] w-[1.05rem] shrink-0 items-center justify-center rounded-full border text-[0.66rem] font-bold leading-none"
        style={{
          borderColor: 'var(--accent)',
          color: open ? '#ffffff' : 'var(--accent)',
          background: open ? 'var(--accent)' : 'transparent',
        }}
      >
        i
      </button>
      {open && (
        <span
          id={id}
          role="note"
          /*
           * Anchored to the marker and floating over the rows. Right-aligned
           * would run off a narrow panel; the marker is always near the left
           * edge of its column, so opening rightward from it is safe.
           */
          className="absolute left-0 top-[1.4rem] z-30 w-[min(17rem,70vw)] rounded-lg border p-2.5 text-left text-[0.76rem] font-normal leading-snug shadow-lg"
          style={{
            borderColor: 'var(--rule-strong)',
            background: 'var(--surface-raised)',
            color: 'var(--ink-soft)',
            boxShadow: '0 8px 24px rgba(0, 0, 0, 0.14)',
          }}
        >
          {children}
        </span>
      )}
    </span>
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
  /** The salary is the field the whole column turns on, so it renders larger. */
  emphasis?: boolean;
  /** Reserve this many lines under the field. See PrefillNote. */
  hintLines?: number;
}

export function MoneyField({
  label,
  value,
  onChange,
  hint,
  suffix,
  min = 0,
  max = 100_000_000,
  emphasis = false,
  hintLines,
}: MoneyFieldProps) {
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
          className={`${inputClass} pl-6 ${suffix ? 'pr-12' : ''} ${emphasis ? 'py-2.5 text-xl font-semibold' : ''}`}
          style={emphasis ? { ...inputStyle, borderColor: 'var(--rule-input)' } : inputStyle}
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
      {hint && <PrefillNote lines={hintLines}>{hint}</PrefillNote>}
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
  /**
   * Narrow variant for rates that belong side by side.
   *
   * Down payment, mortgage rate and property tax are one decision about one
   * purchase, so they read as a row rather than a stack. Three uppercase,
   * wide-tracked labels do not survive a third of a column, so the label drops
   * to sentence case and the input sheds its horizontal padding. Nothing else
   * changes: same control, same value, same keyboard behaviour.
   */
  compact?: boolean;
}

export function PercentField({
  label,
  value,
  onChange,
  hint,
  max = 100,
  step = 0.01,
  compact = false,
}: PercentFieldProps) {
  const id = useId();
  return (
    <div>
      <label
        htmlFor={id}
        className={
          compact ? 'mb-1 block text-[0.74rem] font-medium leading-tight' : labelClass
        }
        style={labelStyle}
      >
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
          className={
            compact
              ? 'tnum w-full rounded border px-1.5 py-1.5 pr-5 text-[0.85rem]'
              : `${inputClass} pr-7`
          }
          style={inputStyle}
          value={Number((value * 100).toFixed(3))}
          onChange={(e) => {
            const next = Number(e.target.value);
            onChange(Number.isFinite(next) ? Math.min(Math.max(next, 0), max) / 100 : 0);
          }}
        />
        <span
          className={`pointer-events-none absolute top-1/2 -translate-y-1/2 ${compact ? 'right-1.5 text-xs' : 'right-2.5 text-sm'}`}
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

interface InlineSelectProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
}

/**
 * A select that reads as a word inside a sentence.
 *
 * The redesign states the household as prose — "I file as single with no
 * children" — so the control has to sit in the text baseline rather than in a
 * labelled box. It stays a real <select>: the accessible name comes from
 * aria-label, the keyboard and screen-reader behaviour are the platform's, and
 * only the painting changes.
 *
 * Painted as a filled chip rather than a dashed underline. Underlined words
 * read as links or as emphasis; a chip reads as something you press, which is
 * what this is, and the sentence is the one part of the form people were
 * walking past.
 */
export function InlineSelect({ label, value, onChange, options }: InlineSelectProps) {
  const selected = options.find((o) => o.value === value);

  return (
    <span className="relative inline-flex items-baseline">
      <span
        aria-hidden="true"
        className="rounded-md px-2 py-0.5 font-semibold"
        style={{ background: 'var(--accent-dim)', color: 'var(--accent)' }}
      >
        {selected?.label ?? value}
        <span className="pl-1.5 text-[0.7em]">&#9662;</span>
      </span>
      <select
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="absolute inset-0 cursor-pointer opacity-0"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </span>
  );
}
