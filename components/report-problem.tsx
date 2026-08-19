'use client';

import { useSyncExternalStore } from 'react';

import { InfoDot } from '@/components/fields';
import { reportByEmail, reportOnGitHub, type ReportContext } from '@/lib/site';

/** Why a stranger's report is worth having. Shown, or behind the ⓘ. */
const WHY = (
  <>
    Most figures here describe a whole area &mdash; some are medians, some averages, some index
    numbers, some statutory rates &mdash; and the people who live there spot a wrong one first.
  </>
);

/**
 * "Something look wrong?" — the two ways to say so.
 *
 * Placed wherever a reader is looking at a specific figure, because that is
 * when they notice, and because a report is worth far more when it arrives
 * carrying the city and the dataset version rather than "the rent seems high".
 *
 * `compact` is for the answer screen, where this sits in the row of buttons
 * rather than in a column of prose. Same two links, and the paragraph saying
 * why a stranger's report is worth having moves behind the ⓘ — it is a good
 * reason and it was a third grey paragraph in a stack of three.
 */
export function ReportProblem({
  subject,
  datasetVersion,
  prompt = 'Something look wrong?',
  className = '',
  compact = false,
  explain = true,
}: {
  subject: string;
  datasetVersion: string;
  prompt?: string;
  className?: string;
  compact?: boolean;
  /**
   * Whether to append the reason. Off where the page has already given it at
   * length — /data and /methodology both spend a paragraph on why a stranger's
   * report is worth having, and this repeated it in smaller type directly
   * underneath, in almost the same words.
   */
  explain?: boolean;
}) {
  // The page URL is only knowable in the browser. Reading it through
  // useSyncExternalStore gives the server an explicit "not yet" snapshot rather
  // than a hydration mismatch, and needs no effect and no state. It never
  // changes without a navigation, so the subscribe function has nothing to do.
  //
  // On the calculator this matters: the URL carries the encoded inputs, so a
  // report arrives with the exact scenario the reader was looking at.
  const url = useSyncExternalStore(
    () => () => {},
    () => window.location.href,
    () => undefined,
  );

  const context: ReportContext = { subject, datasetVersion, url };
  const link = 'underline underline-offset-2';
  const style = { color: 'var(--accent)' } as const;

  const email = (
    <a href={reportByEmail(context)} className={link} style={style}>
      Email me
    </a>
  );
  const issue = (
    <a
      href={reportOnGitHub(context)}
      className={link}
      style={style}
      target="_blank"
      rel="noreferrer"
    >
      open an issue
    </a>
  );

  if (compact) {
    return (
      <span
        className={`inline-flex items-baseline gap-1.5 text-[0.88rem] ${className}`}
        style={{ color: 'var(--muted-strong)' }}
      >
        {prompt} {email} or {issue}
        {explain && <InfoDot label="Why report a figure?">{WHY}</InfoDot>}
      </span>
    );
  }

  return (
    <p className={`text-[0.84rem] leading-snug ${className}`} style={{ color: 'var(--muted)' }}>
      {prompt} {email} or {issue}.{explain ? <> {WHY}</> : null}
    </p>
  );
}
