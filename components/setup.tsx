'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';

import { CityCard } from '@/components/city-panel';
import { StepBadge } from '@/components/fields';
import { HouseholdSentence } from '@/components/household';
import { useComparisonForm } from '@/lib/use-comparison-form';
import { decodeComparison, encodeComparison, type SharedComparison } from '@/lib/share-link';
import { ACTION, SITE_SLUG, TAGLINE } from '@/lib/site';

/**
 * Where a half-filled form is kept while the reader is on the answer screen.
 *
 * The interface is two pages now, and a browser Back from the answer used to
 * land on an empty form — every city, salary and rent gone, with no way to tell
 * that anything had been lost rather than never entered. It is the same payload
 * the share link carries, in session storage, so it dies with the tab and never
 * leaves the browser. Anything unreadable is discarded in silence: a stale
 * format is not worth an error message about a form nobody asked to restore.
 */
const DRAFT_KEY = `${SITE_SLUG}-draft`;

function readDraft(): SharedComparison | null {
  try {
    const stored = window.sessionStorage.getItem(DRAFT_KEY);
    return stored ? decodeComparison(stored) : null;
  } catch {
    return null;
  }
}

function writeDraft(comparison: SharedComparison | null) {
  try {
    if (comparison) window.sessionStorage.setItem(DRAFT_KEY, encodeComparison(comparison));
    else window.sessionStorage.removeItem(DRAFT_KEY);
  } catch {
    // Session storage throws in some privacy modes. A form that cannot be
    // restored is worth nothing at all next to a page that does not work.
  }
}

/** One thing still outstanding, in the list beside the button. */
function Waiting({ done, children }: { done: boolean; children: React.ReactNode }) {
  return (
    <li className="flex items-center gap-2" style={{ color: done ? 'var(--muted)' : 'var(--ink)' }}>
      <span aria-hidden="true" style={{ color: done ? 'var(--accent)' : 'var(--muted)' }}>
        {done ? '✓' : '·'}
      </span>
      <span style={{ textDecoration: done ? 'line-through' : undefined }}>{children}</span>
    </li>
  );
}

/** A promise the site can keep, with a tick against it. */
function Tick({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-2 text-[0.86rem]" style={{ color: 'var(--muted-strong)' }}>
      <span aria-hidden="true" style={{ color: 'var(--accent)' }}>
        ✓
      </span>
      {children}
    </span>
  );
}

/**
 * Screen one: what the site is, then what it needs from you.
 *
 * Artboard 5a. This screen used to carry the answer too, in a third column
 * beside the form, and the form was squeezed to make room for a panel that
 * spent most of its life saying "pick both cities". The answer has its own
 * screen and its own address now, so this one can put the question first at the
 * size a stranger deserves, and give the two cities half the page each.
 */
export function Setup() {
  const router = useRouter();
  const form = useComparisonForm();
  const { origin, destination, setOrigin, setDestination, bothChosen, sameCity, share } = form;

  /*
   * Restored after mount rather than in the initial state, because session
   * storage does not exist on the server and reading it during the first render
   * would make the markup React hydrates disagree with the markup it sent.
   */
  const restored = useRef(false);
  useEffect(() => {
    if (restored.current) return;
    restored.current = true;
    const draft = readDraft();
    if (draft) form.restore(draft);
    // Restoring runs once, on mount. The form's setters are stable enough for
    // that and listing them would re-run it on every keystroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Kept in step with the form so a Back from the answer screen finds it there.
  useEffect(() => {
    if (!restored.current) return;
    writeDraft(form.shared);
  }, [form.shared]);

  const ready = bothChosen && !sameCity && share.path !== '';

  function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (ready) router.push(share.path);
  }

  return (
    <main id="main" className="flex flex-1 flex-col gap-5 pb-8">
      {/*
        The question, at the size of a question. The h1 is the thing a stranger
        can act on — not the brand, which is already in the header — and the
        sentence under it says what they get and what it accounts for, so
        nobody has to infer the product from a form.
      */}
      <section
        className="flex flex-col gap-4 rounded-2xl border px-6 py-10 sm:px-10 sm:py-14"
        style={{
          borderColor: 'var(--rule)',
          background:
            'radial-gradient(110% 95% at 16% 0%, var(--hero-glow) 0%, var(--surface) 62%)',
        }}
      >
        <span
          className="font-display text-[0.72rem] font-medium uppercase tracking-[0.2em]"
          style={{ color: 'var(--accent)' }}
        >
          Compare any two US cities
        </span>
        <h1
          className="max-w-[22ch] font-display text-[2.2rem] font-bold leading-[1.04] tracking-[-0.037em] sm:text-[3rem] xl:text-[3.6rem]"
          style={{ color: 'var(--ink)', textWrap: 'pretty' }}
        >
          {TAGLINE}
        </h1>
        <p
          className="max-w-[44ch] text-[1.05rem] leading-snug sm:text-[1.15rem]"
          style={{ color: 'var(--ink-soft)', textWrap: 'pretty' }}
        >
          Pick two cities and a salary. See what you&rsquo;d have left over each year, after tax,
          housing, cars and everyday costs.
        </p>
        <div className="flex flex-wrap gap-x-6 gap-y-2 pt-1">
          <Tick>Free, no account</Tick>
          <Tick>Nothing leaves your browser</Tick>
          <Tick>Public federal data, cited</Tick>
        </div>
      </section>

      {/*
        noValidate, and it is not laziness.

        The mortgage rate and property tax boxes are number inputs with a step
        of 0.05 and 0.01, which is how their up and down arrows should move.
        The browser also reads `step` as a RULE: 6.41% is not a multiple of
        0.05, so Chrome marked the field invalid and silently refused to submit
        the form — the button did nothing at all for anybody buying rather than
        renting, with no message to say why. Every field here sanitises its own
        value on change and none of them is required, so there is nothing left
        for browser validation to do except that.
      */}
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
        <section
          className="flex flex-col gap-3 rounded-2xl border px-5 py-4 sm:px-6"
          style={{ borderColor: 'var(--rule-strong)', background: 'var(--surface-sunken)' }}
        >
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <StepBadge n={1} />
            <h2
              className="font-display text-[1.25rem] font-semibold tracking-[-0.01em]"
              style={{ color: 'var(--ink)' }}
            >
              About you
            </h2>
            <span className="text-[0.84rem]" style={{ color: 'var(--muted)' }}>
              applies to both cities &middot; filing status alone can swing this by thousands
            </span>
          </div>
          <HouseholdSentence form={form} />
          <span className="text-[0.8rem]" style={{ color: 'var(--muted)' }}>
            Tap any green word to change it.
          </span>
        </section>

        <section className="flex flex-col gap-3">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <StepBadge n={2} done={bothChosen} />
            <h2
              className="font-display text-[1.25rem] font-semibold tracking-[-0.01em]"
              style={{ color: 'var(--ink)' }}
            >
              The two cities
            </h2>
            <span className="text-[0.84rem]" style={{ color: 'var(--muted)' }}>
              salary, rent and cars fill in with real local figures once you pick &mdash; change
              them to yours
            </span>
          </div>

          <div className="grid items-start gap-4 lg:grid-cols-2">
            <CityCard
              title="Living now"
              emptyPrompt="Where do you live now?"
              state={origin}
              filingStatus={form.filingStatus}
              childCount={form.children}
              tenure={form.tenure}
              onChange={setOrigin}
              onSalaryChange={form.changeSalary('origin')}
              salaryLabel={form.salaryLabels.here}
              salaryHint={form.salaryHint('origin')}
            />
            <CityCard
              /*
                Not "The offer". Plenty of people run this before anyone has
                offered them anything — moving for a partner, for family, for
                the weather — and a column headed "The offer" tells them the
                tool is for somebody else. The place is the thing they always
                have; the job is not.
              */
              title="Moving to"
              emptyPrompt="Where are you thinking of going?"
              highlight
              state={destination}
              filingStatus={form.filingStatus}
              childCount={form.children}
              tenure={form.tenure}
              onChange={setDestination}
              onSalaryChange={form.changeSalary('destination')}
              salaryLabel={form.salaryLabels.there}
              salaryHint={form.salaryHint('destination')}
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
        </section>

        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
            <button
              type="submit"
              className="rounded-xl px-7 py-4 font-display text-[1.15rem] font-bold disabled:opacity-45"
              style={{ background: 'var(--accent)', color: '#ffffff' }}
              disabled={!ready}
            >
              {ACTION} <span aria-hidden="true">→</span>
            </button>
            <span className="max-w-[34ch] text-[0.86rem]" style={{ color: 'var(--muted)' }}>
              You can change any of this on the next screen without coming back here.
            </span>
          </div>

          {/*
            Name the step that is outstanding rather than showing a dead button.
            The prompts match the headings on the cards above, so the reader is
            told where to look, not just that something is missing.
          */}
          {sameCity ? (
            <p className="text-[0.9rem]" style={{ color: 'var(--bad)' }}>
              Both cities are the same. Pick a different place to move to.
            </p>
          ) : share.error ? (
            <p className="text-[0.9rem]" style={{ color: 'var(--bad)' }}>
              This comparison can&rsquo;t be turned into a link: {share.error}
            </p>
          ) : (
            !bothChosen && (
              <ul className="flex flex-col gap-1 text-[0.9rem]">
                <Waiting done={origin.metroId !== ''}>Where you live now</Waiting>
                <Waiting done={destination.metroId !== ''}>
                  Where you&rsquo;re thinking of going
                </Waiting>
              </ul>
            )
          )}
        </div>
      </form>
    </main>
  );
}
