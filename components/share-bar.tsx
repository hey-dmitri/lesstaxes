'use client';

import { useEffect, useRef, useState } from 'react';

interface Props {
  /** Path for this comparison, e.g. "/r/AeoPAQ...". */
  path: string;
  /** Non-null when the current inputs cannot be encoded. */
  error?: string | null;
}

type Status = 'idle' | 'copied' | 'failed';

export function ShareBar({ path, error }: Props) {
  const [status, setStatus] = useState<Status>('idle');
  const timerRef = useRef<number | null>(null);

  useEffect(() => () => {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
  }, []);

  async function copy() {
    const url = `${window.location.origin}${path}`;
    try {
      await navigator.clipboard.writeText(url);
      setStatus('copied');
    } catch {
      // Clipboard access can be blocked. Put the link in the address bar so it
      // can still be copied by hand, rather than failing with nothing to show.
      window.history.replaceState(null, '', path);
      setStatus('failed');
    }
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => setStatus('idle'), 2600);
  }

  if (error) {
    return (
      <p className="text-[0.7rem]" style={{ color: 'var(--muted)' }}>
        This comparison can&rsquo;t be turned into a link: {error}
      </p>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={copy}
        className="rounded border px-3 py-1.5 text-[0.8rem] font-medium"
        style={{
          borderColor: status === 'copied' ? 'var(--good)' : 'var(--rule-strong)',
          color: status === 'copied' ? 'var(--good)' : 'var(--ink)',
          background: 'var(--surface)',
        }}
      >
        {status === 'copied' ? '✓ Link copied' : status === 'failed' ? 'Link is in the address bar' : 'Copy share link'}
      </button>
      <span aria-live="polite" className="text-[0.68rem] leading-snug" style={{ color: 'var(--muted)' }}>
        {status === 'copied'
          ? 'Whoever opens it sees exactly these numbers.'
          : 'Carries every input and the data version — no account, nothing stored.'}
      </span>
    </div>
  );
}
