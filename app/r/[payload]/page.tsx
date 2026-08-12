import Link from 'next/link';

import { Calculator } from '@/components/calculator';
import { decodeComparison, type SharedComparison } from '@/lib/share-link';

/**
 * A shared comparison.
 *
 * The payload carries every input plus the dataset version, so this recomputes
 * to exactly what the sender saw — including years later, after the underlying
 * federal data has been refreshed (PROJECT.md section 9.2).
 *
 * Next 16 makes route params a Promise, hence the await.
 */
export default async function SharedResult({
  params,
}: {
  params: Promise<{ payload: string }>;
}) {
  const { payload } = await params;

  // Decode before building any JSX: a throw inside a render tree is caught by
  // an error boundary rather than by this handler, which would lose the
  // specific reason the link failed.
  let comparison: SharedComparison | null = null;
  let reason: string | null = null;
  try {
    comparison = decodeComparison(payload);
  } catch (error) {
    reason = error instanceof Error ? error.message : 'it could not be read';
  }

  if (comparison) return <Calculator initial={comparison} />;

  return (
    <main className="flex min-h-0 flex-1 items-center justify-center px-4 py-10">
      <div
        className="max-w-md rounded-lg border p-6 text-center"
        style={{ borderColor: 'var(--rule-strong)', background: 'var(--surface)' }}
      >
        <h2 className="font-serif text-lg font-semibold" style={{ color: 'var(--ink)' }}>
          That link didn&rsquo;t work
        </h2>
        <p className="mt-2 text-sm" style={{ color: 'var(--muted)' }}>
          {reason}. It may have been cut short when it was copied — long links sometimes wrap in
          email.
        </p>
        <Link
          href="/"
          className="mt-4 inline-block rounded-lg px-5 py-2.5 text-sm font-semibold"
          style={{ background: 'var(--accent)', color: '#ffffff' }}
        >
          Start a new comparison
        </Link>
      </div>
    </main>
  );
}
