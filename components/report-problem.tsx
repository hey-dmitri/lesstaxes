'use client';

import { useSyncExternalStore } from 'react';

import { reportByEmail, reportOnGitHub, type ReportContext } from '@/lib/site';

/**
 * "Something look wrong?" — the two ways to say so.
 *
 * Placed wherever a reader is looking at a specific figure, because that is
 * when they notice, and because a report is worth far more when it arrives
 * carrying the city and the dataset version rather than "the rent seems high".
 */
export function ReportProblem({
  subject,
  datasetVersion,
  prompt = 'Something look wrong?',
  className = '',
}: {
  subject: string;
  datasetVersion: string;
  prompt?: string;
  className?: string;
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

  return (
    <p className={`text-[0.68rem] leading-snug ${className}`} style={{ color: 'var(--muted)' }}>
      {prompt}{' '}
      <a href={reportByEmail(context)} className={link} style={style}>
        Email me
      </a>{' '}
      or{' '}
      <a
        href={reportOnGitHub(context)}
        className={link}
        style={style}
        target="_blank"
        rel="noreferrer"
      >
        open an issue
      </a>
      . Every figure is a local median, and the people who live somewhere spot a
      wrong one first.
    </p>
  );
}
