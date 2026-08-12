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
 * It has to be inline and synchronous in <head> — anything deferred is too
 * late. Wrapped in try/catch because localStorage throws in some privacy modes,
 * and a theme preference is never worth breaking the page over.
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
      <body>
        <div className="mx-auto w-full max-w-[76rem] px-5 py-8 sm:px-8 lg:py-12">
          <header className="mb-8 flex items-start justify-between gap-4 lg:mb-12">
            <div>
              <p
                className="text-[0.7rem] font-semibold uppercase tracking-[0.14em]"
                style={{ color: 'var(--muted)' }}
              >
                LessTaxes
              </p>
              <h1
                className="mt-1 text-balance font-serif text-2xl font-semibold tracking-tight sm:text-3xl"
                style={{ color: 'var(--ink)' }}
              >
                Will moving actually leave you better off?
              </h1>
            </div>
            <ThemeToggle />
          </header>

          {children}

          <footer
            className="mt-16 border-t pt-6 text-xs"
            style={{ borderColor: 'var(--rule)', color: 'var(--muted)' }}
          >
            <p className="max-w-[62ch]">
              Estimates from public federal data — Census, BEA, BLS, IRS and state revenue
              departments. <strong>Not financial, tax or legal advice.</strong> No accounts, no
              tracking, nothing stored.
            </p>
          </footer>
        </div>
      </body>
    </html>
  );
}
