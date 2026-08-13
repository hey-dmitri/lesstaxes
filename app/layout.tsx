import type { Metadata, Viewport } from 'next';
import { Familjen_Grotesk, Space_Grotesk } from 'next/font/google';
import Link from 'next/link';

import './globals.css';

/*
 * Self-hosted at build time by next/font, not fetched from Google at runtime.
 * The site makes no third-party requests (PROJECT.md §10) and a webfont CDN
 * would be one, as well as a way to leak a visitor's IP to another party.
 */
const familjen = Familjen_Grotesk({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-familjen',
  display: 'swap',
});
const space = Space_Grotesk({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-space',
  display: 'swap',
});
import { ThemeToggle } from '@/components/theme-toggle';
import { DATASET_VERSION } from '@/engine';
import { SITE_NAME, SITE_SLUG, TAGLINE } from '@/lib/site';

/**
 * Absolute base for Open Graph URLs. Messaging apps fetch preview images from
 * their own servers, so a relative path is useless to them.
 * Vercel injects VERCEL_URL per deployment, including previews.
 */
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL
  ? process.env.NEXT_PUBLIC_SITE_URL
  : process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : 'http://localhost:3000';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: `${SITE_NAME} — ${TAGLINE.toLowerCase()}`,
  description:
    'Compare two US cities on what you would actually have left over: income tax, property tax, sales tax, housing, cars and cost of living. Free, no accounts, no tracking.',
  openGraph: {
    type: 'website',
    siteName: SITE_NAME,
    title: TAGLINE,
    description:
      'Income tax, property tax, sales tax, housing, cars and cost of living — for any two US cities.',
  },
  twitter: { card: 'summary_large_image' },
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#F4F1EA' },
    { media: '(prefers-color-scheme: dark)', color: '#0A0E16' },
  ],
};

/**
 * Applies the saved theme before first paint.
 *
 * Without this, a user who chose dark sees a white flash while React hydrates.
 * It must be inline and synchronous in <head> — anything deferred is too late.
 * Wrapped in try/catch because localStorage throws in some privacy modes, and
 * a theme preference is never worth breaking the page over.
 */
const THEME_SCRIPT = `
try {
  var t = localStorage.getItem('${SITE_SLUG}-theme');
  if (t === 'dark' || t === 'light') document.documentElement.dataset.theme = t;
} catch (e) {}
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${familjen.variable} ${space.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      {/*
        The whole tool is designed to fit one viewport on a desktop screen, so
        the page itself never scrolls. Panels scroll internally instead — a
        safety valve for short windows, rather than pushing the answer below
        the fold where it stops being an answer.
      */}
      <body>
        {/* Keyboard users land here first and can jump past the header. */}
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50 focus:rounded focus:px-3 focus:py-2 focus:text-sm focus:font-semibold"
          style={{ background: 'var(--accent)', color: '#ffffff' }}
        >
          Skip to the calculator
        </a>
        <div className="mx-auto flex min-h-dvh w-full max-w-[112rem] flex-col px-4 py-3 sm:px-6">
          {/*
            Per the Turn 3 redesign: wordmark and tagline on the left, the two
            credibility links and the dataset version on the right. The version
            is deliberately visible — it is what a shared link is pinned to.
          */}
          <header className="flex shrink-0 flex-wrap items-baseline gap-x-5 gap-y-2 pb-4">
            <div className="flex items-baseline gap-3">
              <span
                className="font-display text-[1.05rem] font-bold tracking-[-0.02em]"
                style={{ color: 'var(--ink)' }}
              >
                {SITE_NAME}
              </span>
              <h1 className="text-[0.9rem]" style={{ color: 'var(--ink-soft)' }}>
                {TAGLINE}
              </h1>
            </div>
            <nav className="ml-auto flex items-baseline gap-5 text-[0.82rem]" aria-label="About this site">
              <Link href="/methodology" style={{ color: 'var(--accent)' }}>
                How it works
              </Link>
              <Link href="/data" style={{ color: 'var(--accent)' }}>
                The data
              </Link>
              <span className="tnum text-[0.72rem]" style={{ color: 'var(--muted)' }}>
                Dataset {DATASET_VERSION}
              </span>
              <ThemeToggle />
            </nav>
          </header>

          {children}

          <footer
            className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-1 pt-2 text-[0.76rem] leading-snug"
            style={{ color: 'var(--muted)' }}
          >
            <nav className="flex gap-4" aria-label="More about this site">
              {/* Always reachable, on every page, for the reader who spots a wrong figure. */}
              <Link href="/data#report" className="underline underline-offset-2" style={{ color: 'var(--accent)' }}>
                Report a problem
              </Link>
            </nav>
            <span className="flex-1">
              Estimates from public federal data — Census, BEA, BLS, IRS and state revenue
              departments. <strong>Not financial, tax or legal advice.</strong> No accounts, no
              tracking, nothing stored.
            </span>
            <span className="whitespace-nowrap">
              Built by{' '}
              <a
                href="https://heydmitri.com/"
                className="underline underline-offset-2"
                style={{ color: 'var(--accent)' }}
              >
                Dmitri
              </a>
            </span>
          </footer>
        </div>
      </body>
    </html>
  );
}
