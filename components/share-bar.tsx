'use client';

import { useEffect, useRef, useState } from 'react';

import { cardFilename, cardPath } from '@/lib/share-card';

interface Props {
  /** Path for this comparison, e.g. "/r/AeoPAQ...". */
  path: string;
  /** The encoded payload, used to fetch the card image. */
  payload: string;
  /** Filename stem, e.g. "chicago-il-to-austin-tx". */
  slug: string;
  /** Non-null when the current inputs cannot be encoded. */
  error?: string | null;
}

type CopyStatus = 'idle' | 'copied' | 'manual';
type SaveStatus = 'idle' | 'saving' | 'saved' | 'failed';

const buttonClass = 'rounded border px-3 py-1.5 text-[0.8rem] font-medium';

export function ShareBar({ path, payload, slug, error }: Props) {
  const [copyStatus, setCopyStatus] = useState<CopyStatus>('idle');
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const timers = useRef<number[]>([]);

  useEffect(
    () => () => {
      for (const id of timers.current) window.clearTimeout(id);
    },
    [],
  );

  function resetLater(reset: () => void) {
    timers.current.push(window.setTimeout(reset, 2600));
  }

  async function copyLink() {
    const url = `${window.location.origin}${path}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopyStatus('copied');
    } catch {
      // Clipboard access can be blocked. Put the link in the address bar so it
      // can still be copied by hand, rather than failing with nothing to show.
      window.history.replaceState(null, '', path);
      setCopyStatus('manual');
    }
    resetLater(() => setCopyStatus('idle'));
  }

  async function saveImage() {
    setSaveStatus('saving');
    try {
      const response = await fetch(cardPath(payload));
      if (!response.ok) throw new Error(String(response.status));

      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = objectUrl;
      anchor.download = cardFilename(slug);
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      // Revoke on the next tick — Safari needs the URL alive through the click.
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0);

      setSaveStatus('saved');
    } catch {
      setSaveStatus('failed');
    }
    resetLater(() => setSaveStatus('idle'));
  }

  if (error) {
    return (
      <p className="text-[0.7rem]" style={{ color: 'var(--muted)' }}>
        This comparison can&rsquo;t be turned into a link: {error}
      </p>
    );
  }

  const copyLabel =
    copyStatus === 'copied'
      ? '✓ Link copied'
      : copyStatus === 'manual'
        ? 'Link is in the address bar'
        : 'Copy share link';

  const saveLabel =
    saveStatus === 'saving'
      ? 'Preparing…'
      : saveStatus === 'saved'
        ? '✓ Saved to Downloads'
        : saveStatus === 'failed'
          ? 'Couldn’t save'
          : 'Save image';

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={copyLink}
          className={buttonClass}
          style={{
            borderColor: copyStatus === 'copied' ? 'var(--good)' : 'var(--rule-strong)',
            color: copyStatus === 'copied' ? 'var(--good)' : 'var(--ink)',
            background: 'var(--surface)',
          }}
        >
          {copyLabel}
        </button>
        <button
          type="button"
          onClick={saveImage}
          disabled={saveStatus === 'saving'}
          className={`${buttonClass} disabled:opacity-60`}
          style={{
            borderColor:
              saveStatus === 'saved'
                ? 'var(--good)'
                : saveStatus === 'failed'
                  ? 'var(--bad)'
                  : 'var(--rule-strong)',
            color:
              saveStatus === 'saved'
                ? 'var(--good)'
                : saveStatus === 'failed'
                  ? 'var(--bad)'
                  : 'var(--ink)',
            background: 'var(--surface)',
          }}
        >
          {saveLabel}
        </button>
      </div>
      <span aria-live="polite" className="text-[0.68rem] leading-snug" style={{ color: 'var(--muted)' }}>
        {copyStatus === 'copied'
          ? 'Whoever opens it sees exactly these numbers — and the result shows up in the message itself.'
          : saveStatus === 'saved'
            ? 'A picture of this result, ready to send.'
            : 'The link carries every input and the data version. Nothing is stored.'}
      </span>
    </div>
  );
}
