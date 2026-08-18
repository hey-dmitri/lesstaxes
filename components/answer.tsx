'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';

import { CityRow } from '@/components/city-panel';
import { HouseholdSentence } from '@/components/household';
import { Results } from '@/components/results';
import { ShareBar } from '@/components/share-bar';
import { useComparisonForm } from '@/lib/use-comparison-form';
import { describeComparison, describeHousehold } from '@/lib/shared-comparison';
import type { SharedComparison } from '@/lib/share-link';
import { formatUSD, cityName } from '@/engine';

function ArrowIcon() {
  return (
    <svg
      width="17"
      height="17"
      viewBox="0 0 24 24"
      fill="none"
      stroke="var(--accent)"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="shrink-0"
    >
      <path d="M4 12h15" />
      <path d="M14 7l5 5-5 5" />
    </svg>
  );
}

function PencilIcon({ colour }: { colour: string }) {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke={colour}
      strokeWidth="2.1"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="shrink-0"
    >
      <path d="M4 20h4.5L20 8.5a2.5 2.5 0 0 0-3.5-3.5L5 16.5V20z" />
      <path d="M14.5 6.5 18 10" />
    </svg>
  );
}

/**
 * Screen two: the answer, with the inputs a click away rather than a page away.
 *
 * Artboards 5b and 5c. The whole point of splitting the interface in two was
 * that the answer could have the full width — and the whole risk of splitting
 * it was that trying $135,000 instead of $140,000 would mean going back to a
 * form. It does not. "Change anything" drops every field out from under the
 * summary line, the answer keeps recomputing behind it, and the address in the
 * bar follows, so the link copied afterwards is the version on screen.
 */
export function Answer({ initial }: { initial: SharedComparison }) {
  const form = useComparisonForm(initial);
  const { origin, destination, result, share, sameCity, shared } = form;

  const [editing, setEditing] = useState(false);
  /*
   * Rolled up once, when the answer first lands. Re-rolling on every keystroke
   * while somebody drags a salary around would be noise, not delight — so the
   * flag is spent on mount and never set again.
   */
  const [animate, setAnimate] = useState(true);
  useEffect(() => {
    const timer = window.setTimeout(() => setAnimate(false), 1200);
    return () => window.clearTimeout(timer);
  }, []);

  /*
   * THE ADDRESS FOLLOWS THE INPUTS.
   *
   * replaceState rather than push: a comparison edited five times should not
   * bury the page the reader arrived on under five history entries they have to
   * press Back through. The link they copy is still whatever is on screen,
   * which is the promise the panel makes.
   */
  const lastPath = useRef(share.path);
  useEffect(() => {
    if (!share.path || share.path === lastPath.current) return;
    lastPath.current = share.path;
    window.history.replaceState(null, '', share.path);
  }, [share.path]);

  const household = shared ? describeHousehold(shared) : describeHousehold(initial);

  return (
    <main id="main" className="flex flex-1 flex-col gap-5 pb-8">
      {/*
        What the answer below rests on, in one line, always visible. A figure
        like "+$8,967 a year" is meaningless without it — it is an answer for a
        particular household at a particular salary, and a page that shows only
        the answer invites the reader to apply it to themselves.
      */}
      <div
        className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border px-4 py-3"
        style={{
          borderColor: editing ? 'var(--picked-rule)' : 'var(--rule-strong)',
          background: editing ? 'var(--picked)' : 'var(--surface-sunken)',
        }}
      >
        <span className="text-[0.92rem]" style={{ color: 'var(--muted-strong)' }}>
          {household}
        </span>
        {/* Only a separator, and only while the two halves share a line. */}
        <span aria-hidden="true" className="hidden sm:inline" style={{ color: 'var(--rule-strong)' }}>
          &middot;
        </span>
        <span className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[0.95rem] font-semibold" style={{ color: 'var(--ink)' }}>
          <span>
            {origin.metroId ? cityName(origin.metroId) : 'Nowhere yet'}{' '}
            <span className="tnum font-normal" style={{ color: 'var(--muted-strong)' }}>
              {formatUSD(origin.grossSalary)}
            </span>
          </span>
          <ArrowIcon />
          <span>
            {destination.metroId ? cityName(destination.metroId) : 'Nowhere yet'}{' '}
            <span className="tnum font-normal" style={{ color: 'var(--muted-strong)' }}>
              {formatUSD(destination.grossSalary)}
            </span>
          </span>
        </span>
        <button
          type="button"
          onClick={() => setEditing((open) => !open)}
          aria-expanded={editing}
          aria-controls="change-anything"
          className="ml-auto inline-flex items-center gap-2 rounded-lg border px-3.5 py-2 text-[0.88rem] font-semibold"
          style={{
            borderColor: editing ? 'var(--accent)' : 'var(--rule-input)',
            background: editing ? 'var(--accent-dim)' : 'var(--surface-raised)',
            color: editing ? 'var(--accent)' : 'var(--ink)',
          }}
        >
          <PencilIcon colour={editing ? 'var(--accent)' : 'var(--muted-strong)'} />
          Change anything <span aria-hidden="true">{editing ? '▴' : '▾'}</span>
        </button>
      </div>

      {editing && (
        <div
          id="change-anything"
          className="flex flex-col gap-4 rounded-xl border px-4 py-4 sm:px-5"
          style={{
            borderColor: 'var(--rule-strong)',
            background: 'var(--surface-sunken)',
            animation: 'drop 220ms ease-out both',
          }}
        >
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="eyebrow" style={{ color: 'var(--muted)' }}>
              About you
            </span>
            <HouseholdSentence form={form} size="small" />
          </div>

          <div className="grid items-start gap-3 lg:grid-cols-2">
            <CityRow
              title="Living now"
              emptyPrompt="Where do you live now?"
              state={origin}
              filingStatus={form.filingStatus}
              childCount={form.children}
              tenure={form.tenure}
              onChange={form.setOrigin}
              onSalaryChange={form.changeSalary('origin')}
              salaryLabel={form.salaryLabels.here}
            />
            <CityRow
              title="Moving to"
              emptyPrompt="Where are you thinking of going?"
              highlight
              state={destination}
              filingStatus={form.filingStatus}
              childCount={form.children}
              tenure={form.tenure}
              onChange={form.setDestination}
              onSalaryChange={form.changeSalary('destination')}
              salaryLabel={form.salaryLabels.there}
              against={
                origin.metroId
                  ? {
                      grossSalary: origin.grossSalary,
                      monthlyRent:
                        origin.housing.tenure === 'rent' ? origin.housing.monthlyRent : 0,
                    }
                  : null
              }
            />
          </div>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <span
              className="inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-[0.88rem]"
              style={{
                borderColor: 'var(--picked-rule)',
                background: 'var(--accent-dim)',
                color: 'var(--accent)',
              }}
            >
              <span
                aria-hidden="true"
                className="inline-block h-[7px] w-[7px] rounded-full"
                style={{ background: 'var(--accent)' }}
              />
              The answer updates as you type
            </span>
            <span className="text-[0.88rem]" style={{ color: 'var(--muted)' }}>
              The address in your bar changes too, so the link you copy is this version.
            </span>
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="ml-auto border-b border-dashed text-[0.92rem]"
              style={{ borderColor: 'var(--rule-input)', color: 'var(--muted-strong)' }}
            >
              Done
            </button>
          </div>
        </div>
      )}

      {result ? (
        <Results
          result={result}
          animate={animate}
          share={
            <ShareBar
              path={share.path}
              payload={share.payload}
              slug={describeComparison(result).slug}
              error={share.error}
            />
          }
        />
      ) : (
        /*
          Only reachable from the panel above: a link cannot encode a city
          against itself, and a link with a city missing does not decode. So
          this says which edit caused it, and leaves the panel open to undo.
        */
        <div
          className="rounded-xl border px-5 py-4"
          style={{ borderColor: 'var(--rule-strong)', background: 'var(--surface-raised)' }}
        >
          <p className="text-[0.95rem]" style={{ color: 'var(--bad)' }}>
            {sameCity
              ? 'Both cities are the same now. Pick a different place to move to and the answer comes back.'
              : 'Both cities have to be filled in before there is an answer.'}
          </p>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <span className="text-[0.88rem]" style={{ color: 'var(--muted)' }}>
          This page has its own address &mdash; the link carries every input and the data version.
        </span>
        <Link href="/" className="ml-auto text-[0.92rem] underline underline-offset-4" style={{ color: 'var(--accent)' }}>
          Start over
        </Link>
      </div>
    </main>
  );
}
