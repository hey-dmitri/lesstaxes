import type { Metadata, Viewport } from 'next';

import './globals.css';
import { ThemeToggle } from '@/components/theme-toggle';

export const metadata: Metadata = {
  title: 'LessTaxes — will moving actually leave you better off?',
  description:
    'Compare two US cities on what you would actually have left over: income tax, property tax, sales tax, housing, cars and cost of living. Free, no accounts, no tracking.',
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f7f8fa' },
    { media: '(prefers-color-scheme: dark)', color: '#101319' },
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
  var t = localStorage.getItem('lesstaxes-theme');
  if (t === 'dark' || t === 'light') document.documentElement.dataset.theme = t;
} catch (e) {}
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      {/*
        The whole tool is designed to fit one viewport on a desktop screen, so
        the page itself never scrolls. Panels scroll internally instead — a
        safety valve for short windows, rather than pushing the answer below
        the fold where it stops being an answer.
      */}
      <body className="lg:h-dvh lg:overflow-hidden">
        <div className="mx-auto flex h-full w-full max-w-[112rem] flex-col px-4 py-3 sm:px-6">
          <header className="flex shrink-0 items-center justify-between gap-4 pb-3">
            <div className="flex items-baseline gap-3">
              <span
                className="text-[0.7rem] font-semibold uppercase tracking-[0.14em]"
                style={{ color: 'var(--muted)' }}
              >
                LessTaxes
              </span>
              <h1
                className="font-serif text-base font-semibold tracking-tight sm:text-lg"
                style={{ color: 'var(--ink)' }}
              >
                Will moving actually leave you better off?
              </h1>
            </div>
            <ThemeToggle />
          </header>

          {children}

          <footer
            className="shrink-0 pt-2 text-[0.68rem] leading-snug"
            style={{ color: 'var(--muted)' }}
          >
            Estimates from public federal data — Census, BEA, BLS, IRS and state revenue
            departments. <strong>Not financial, tax or legal advice.</strong> No accounts, no
            tracking, nothing stored.
          </footer>
        </div>
      </body>
    </html>
  );
}
