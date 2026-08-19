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
  /**
   * What sits at the right-hand end of the button row.
   *
   * The bottom of the answer screen was four blocks stacked: two buttons, a
   * sentence about them, a sentence about reporting a wrong figure, and a
   * sentence about the address with "Start over" floating opposite it. Three
   * greys saying overlapping things, and the address sentence repeated what the
   * one under the buttons already said. It is one row and one line now, and
   * this is where everything that is not a button goes.
   */
  trailing?: React.ReactNode;
}

type CopyStatus = 'idle' | 'copied' | 'manual';
type SaveStatus = 'idle' | 'saving' | 'saved' | 'failed';

const buttonClass =
  'inline-flex items-center gap-2 rounded border px-3.5 py-2 text-[0.88rem] font-medium';

/*
 * Inline SVG rather than an icon font or a package: the site makes no
 * third-party requests, and two glyphs are not worth a dependency. They are
 * aria-hidden because the label beside each one already names the action —
 * an icon that repeats the text is decoration, and announcing it twice is
 * noise to a screen reader.
 */
const iconProps = {
  width: 15,
  height: 15,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
  className: 'shrink-0',
};

function LinkIcon() {
  return (
    <svg {...iconProps}>
      <path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7" />
      <path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7" />
    </svg>
  );
}

function ImageIcon() {
  return (
    <svg {...iconProps}>
      <rect x="3" y="4" width="18" height="13" rx="2" />
      <circle cx="8.5" cy="9" r="1.5" />
      <path d="m21 14-4.5-4.5L7 19" />
      <path d="M12 21h6" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg {...iconProps}>
      <path d="m4 12.5 5.5 5.5L20 6" />
    </svg>
  );
}

function AlertIcon() {
  return (
    <svg {...iconProps}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7.5v5.5" />
      <path d="M12 16.5h.01" />
    </svg>
  );
}

export function ShareBar({ path, payload, slug, error, trailing }: Props) {
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
      <p className="text-[0.88rem]" style={{ color: 'var(--muted)' }}>
        This comparison can&rsquo;t be turned into a link: {error}
      </p>
    );
  }

  const copyLabel =
    copyStatus === 'copied'
      ? 'Link copied'
      : copyStatus === 'manual'
        ? 'Link is in the address bar'
        : 'Copy share link';

  const copyIcon = copyStatus === 'copied' ? <CheckIcon /> : <LinkIcon />;

  const saveLabel =
    saveStatus === 'saving'
      ? 'Preparing…'
      : saveStatus === 'saved'
        ? 'Saved to Downloads'
        : saveStatus === 'failed'
          ? 'Couldn’t save'
          : 'Save image';

  const saveIcon =
    saveStatus === 'saved' ? <CheckIcon /> : saveStatus === 'failed' ? <AlertIcon /> : <ImageIcon />;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
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
          {copyIcon}
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
          {saveIcon}
          {saveLabel}
        </button>
        {trailing && (
          <span className="ml-auto flex flex-wrap items-baseline gap-x-5 gap-y-2">{trailing}</span>
        )}
      </div>
      {/*
        ONE SENTENCE, and it changes to confirm whichever button was pressed.
        The page used to carry a second one underneath saying the link carries
        every input and the data version — which is what this one says.
      */}
      <span aria-live="polite" className="text-[0.88rem] leading-snug" style={{ color: 'var(--muted)' }}>
        {copyStatus === 'copied'
          ? 'Whoever opens it sees exactly these numbers, and the result shows up in the message itself.'
          : saveStatus === 'saved'
            ? 'The whole calculation as a picture — both salaries, both bottom lines and every line of the gap.'
            : 'The link and the image both carry every input and the data version. Nothing is stored.'}
      </span>
    </div>
  );
}
