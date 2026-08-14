/**
 * Site-level constants and the routes for getting in touch.
 *
 * PROJECT.md D24 says the name lives in one config value and is trivial to
 * change. That was aspirational until the 2026-08-13 rename from "LessTaxes"
 * to "Pack or Stay": SITE_NAME lived here, but every user-visible occurrence —
 * titles, the header wordmark, both share cards, the theme key, the download
 * filename — was a hand-typed literal in a dozen files. They import from here
 * now, so D24's claim is finally true. Keep it that way.
 *
 * The contact routes exist because every figure on this site is a local median
 * from a federal table, and the person best placed to notice that one of them
 * is wrong is someone who lives there. There is no backend and never will be
 * (PROJECT.md section 10), so a report is a link — a prefilled email or a
 * prefilled GitHub issue, whichever the reader prefers.
 */

export const SITE_NAME = 'Pack or Stay';

/**
 * Lowercase, no spaces — for anything machine-facing rather than read: the
 * theme storage key and the downloaded share-card filename. Kept separate from
 * SITE_NAME so neither has to be re-derived by hand at the call site.
 */
export const SITE_SLUG = 'packorstay';

/** The question the site exists to answer. Headline copy, and the share card. */
export const TAGLINE = 'Will moving actually leave you with more money?';

/**
 * The one button on the site. Names the act, not the product — "do the move
 * math" made the reader parse a coined noun before they could press it.
 */
export const ACTION = 'Run the numbers';

/**
 * The live domain — see PROJECT.md D24.
 *
 * Read by app/layout.tsx as the production fallback for link-preview image
 * URLs, so a deployment that is not on Vercel still produces absolute URLs a
 * messaging app can fetch.
 */
export const SITE_DOMAIN = 'packorstay.com';

export const CONTACT_EMAIL = 'dmitri.erchov@gmail.com';

export const REPO_URL = 'https://github.com/hey-dmitri/packorstay';

/**
 * A report is only useful if it says WHICH number, WHERE, and from WHICH
 * release of the data — the figures change between dataset versions, so a
 * report against last quarter's numbers can otherwise send someone chasing a
 * discrepancy that has already been fixed. All of that is known at the moment
 * the link is rendered, so none of it is left for the reader to reconstruct.
 */
export interface ReportContext {
  /** What the reader was looking at, e.g. "Chicago, IL to Austin, TX". */
  subject: string;
  datasetVersion: string;
  /** The page it was seen on, filled in from the browser where available. */
  url?: string;
}

function reportBody(context: ReportContext): string {
  return [
    `What looks wrong:`,
    ``,
    ``,
    `What you would expect instead, and why:`,
    ``,
    ``,
    `--`,
    `Looking at: ${context.subject}`,
    `Data version: ${context.datasetVersion}`,
    context.url ? `Page: ${context.url}` : null,
  ]
    .filter((line) => line !== null)
    .join('\n');
}

export function reportByEmail(context: ReportContext): string {
  const subject = `${SITE_NAME}: ${context.subject}`;
  return (
    `mailto:${CONTACT_EMAIL}` +
    `?subject=${encodeURIComponent(subject)}` +
    `&body=${encodeURIComponent(reportBody(context))}`
  );
}

export function reportOnGitHub(context: ReportContext): string {
  return (
    `${REPO_URL}/issues/new` +
    `?title=${encodeURIComponent(context.subject)}` +
    `&body=${encodeURIComponent(reportBody(context))}`
  );
}
