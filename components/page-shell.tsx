import Link from 'next/link';

/** Shared chrome for the reading pages, which scroll normally unlike the tool. */
export function PageShell({
  title,
  standfirst,
  children,
}: {
  title: string;
  standfirst: string;
  children: React.ReactNode;
}) {
  return (
    <main id="main" className="flex flex-1 flex-col gap-6 pb-6">
      <div>
        <Link
          href="/"
          className="text-[0.8rem] underline underline-offset-4"
          style={{ color: 'var(--accent)' }}
        >
          ← Back to the calculator
        </Link>
        <h2 className="mt-3 font-serif text-2xl font-semibold tracking-tight" style={{ color: 'var(--ink)' }}>
          {title}
        </h2>
        <p className="mt-1.5 max-w-[68ch] text-sm" style={{ color: 'var(--muted)' }}>
          {standfirst}
        </p>
      </div>
      {children}
    </main>
  );
}

/** Readable prose column with consistent rhythm. */
export function Prose({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="flex max-w-[72ch] flex-col gap-3 text-sm [&_h2]:mt-5 [&_h2]:font-serif [&_h2]:text-lg [&_h2]:font-semibold [&_h3]:mt-3 [&_h3]:font-semibold [&_li]:my-1.5 [&_ul]:list-disc [&_ul]:pl-5"
      style={{ color: 'var(--ink-soft)' }}
    >
      {children}
    </div>
  );
}
