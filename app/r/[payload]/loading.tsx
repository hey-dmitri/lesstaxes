/**
 * What the answer screen looks like before the answer arrives.
 *
 * The button on the setup screen used to do nothing visible for the better part
 * of a second — longer on the first request after the server has been idle,
 * which is when a stranger is most likely to be the one clicking. Nothing was
 * broken: the page is rendered on demand, so there is a round trip, and the
 * click had gone through. The reader had no way to know that.
 *
 * This is a Suspense fallback, so the browser paints it the instant the
 * navigation starts. It traces the real layout — the strip, the verdict block,
 * the two cards, the two tables — because a skeleton in the shape of the thing
 * arriving reads as loading, where a centred spinner reads as waiting.
 *
 * NOT A PROGRESS BAR, and not a fake one. The wait is a network round trip of
 * unknown length, so nothing here claims to know how far along it is.
 */

/** One shimmering placeholder. Width in Tailwind classes, height in rem. */
function Bar({ className, height = '1rem' }: { className: string; height?: string }) {
  return (
    <span
      aria-hidden="true"
      className={`block rounded ${className}`}
      style={{
        height,
        /*
          The rule colour, not a surface colour. A placeholder painted in
          --surface-raised is white on a white card in the light theme, so the
          cards came out empty rather than pending — which reads as a page that
          rendered wrong rather than one that has not rendered yet.
        */
        background: 'var(--rule)',
        // Slow, low-contrast, and stopped entirely for anyone who asked for
        // reduced motion — see the media query in globals.css.
        animation: 'breathe 1.6s ease-in-out infinite',
      }}
    />
  );
}

function CardSkeleton() {
  return (
    <div
      className="flex flex-col gap-3 rounded-xl border px-5 py-4"
      style={{ borderColor: 'var(--rule-strong)', background: 'var(--surface-raised)' }}
    >
      <Bar className="w-1/3" height="1.1rem" />
      <Bar className="w-full" />
      <Bar className="w-full" />
      <Bar className="w-2/3" height="1.6rem" />
    </div>
  );
}

function TableSkeleton() {
  return (
    <div className="flex flex-col gap-2.5">
      <Bar className="w-1/2" height="0.8rem" />
      {[0, 1, 2, 3, 4].map((row) => (
        <Bar key={row} className="w-full" height="1.1rem" />
      ))}
    </div>
  );
}

export default function Loading() {
  return (
    <main id="main" className="flex flex-1 flex-col gap-5 pb-8">
      {/*
        The only words on the page, because they are the only ones that are
        certainly true: the click landed and the arithmetic is happening.
      */}
      <div
        className="flex flex-wrap items-center gap-3 rounded-xl border px-4 py-3"
        style={{ borderColor: 'var(--rule-strong)', background: 'var(--surface-sunken)' }}
      >
        <span
          aria-hidden="true"
          className="inline-block h-3 w-3 rounded-full"
          style={{ background: 'var(--accent)', animation: 'breathe 1.2s ease-in-out infinite' }}
        />
        <span
          role="status"
          className="font-display text-[1rem] font-semibold"
          style={{ color: 'var(--ink)' }}
        >
          Working out your answer&hellip;
        </span>
        <span className="text-[0.88rem]" style={{ color: 'var(--muted)' }}>
          Both cities, every tax and a household&rsquo;s worth of spending.
        </span>
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="flex flex-col gap-3">
          <Bar className="w-24" height="0.8rem" />
          <Bar className="w-3/4" height="3rem" />
          <Bar className="w-1/2" height="1.4rem" />
          <Bar className="w-2/3" />
        </div>
        <div className="flex flex-col gap-2.5">
          <CardSkeleton />
          <CardSkeleton />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <CardSkeleton />
        <CardSkeleton />
      </div>

      <div className="grid gap-x-8 gap-y-6 lg:grid-cols-2">
        <TableSkeleton />
        <TableSkeleton />
      </div>
    </main>
  );
}
