'use client';

import { InlineSelect } from '@/components/fields';
import {
  CHILD_OPTIONS,
  EARNER_OPTIONS,
  FILING_OPTIONS,
  MARRIED,
  TENURE_OPTIONS,
  type ComparisonForm,
} from '@/lib/use-comparison-form';
import type { FilingStatus } from '@/engine';

/**
 * "About you" as a sentence rather than a row of labelled fields.
 *
 * Filing status, children and whether you rent or buy are the only inputs
 * shared by both cities, and reading them as prose makes the shape of the
 * household obvious at a glance. It appears twice — once as step 1 of the setup
 * screen and once inside the answer screen's "Change anything" panel — so it
 * lives here rather than being written out on both, where the two copies would
 * eventually stop matching.
 */
export function HouseholdSentence({
  form,
  size = 'large',
}: {
  form: ComparisonForm;
  /** The panel on the answer screen is borrowing space, so it sets small. */
  size?: 'large' | 'small';
}) {
  const { filingStatus, children, earners, tenure, applyHousehold, applyTenure, setEarners } = form;

  return (
    <p
      className={`flex flex-wrap items-baseline gap-x-1.5 gap-y-2 ${
        size === 'large' ? 'text-[1.05rem]' : 'text-[0.92rem]'
      }`}
      style={{ color: 'var(--ink)' }}
    >
      I file as{' '}
      <InlineSelect
        label="Filing status"
        value={filingStatus}
        onChange={(next) => applyHousehold(next as FilingStatus, children)}
        options={FILING_OPTIONS}
      />{' '}
      with{' '}
      <InlineSelect
        label="Children"
        value={String(children)}
        onChange={(next: string) => applyHousehold(filingStatus, Number(next))}
        options={CHILD_OPTIONS}
      />
      ,{' '}
      {MARRIED.includes(filingStatus) && (
        <>
          <InlineSelect
            label="How many of you earn"
            value={String(earners)}
            onChange={(next: string) => setEarners(Number(next))}
            options={EARNER_OPTIONS}
          />
          ,{' '}
        </>
      )}
      and I&rsquo;d{' '}
      <InlineSelect
        label="Housing"
        value={tenure}
        onChange={(next: string) => applyTenure(next as 'rent' | 'own')}
        options={TENURE_OPTIONS}
      />{' '}
      in both.
    </p>
  );
}
