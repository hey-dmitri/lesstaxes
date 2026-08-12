/**
 * Turning a decoded share link into a computed result, and into words.
 *
 * Three places need this: the page, the link-preview metadata, and the card
 * image. Keeping it here means a shared link, its preview text and its picture
 * can never disagree about what the answer is.
 */

import {
  compare,
  formatPercent,
  formatUSD,
  localJurisdiction,
  localTaxOptions,
  metro,
  type ComparisonResult,
} from '@/engine';
import type { SharedCity, SharedComparison } from '@/lib/share-link';

/** The local jurisdictions a city's opt-in choices resolve to. */
export function jurisdictionsFor(city: SharedCity) {
  return localTaxOptions(city.metroId)
    .filter((option) =>
      option.optional ? (city.localOptIns[option.jurisdictionId] ?? false) : option.defaultApplies,
    )
    .map((option) => localJurisdiction(option.jurisdictionId));
}

export function comparisonFromShared(input: SharedComparison): ComparisonResult {
  return compare(
    {
      datasetVersion: input.datasetVersion,
      household: { filingStatus: input.filingStatus, children: input.children },
      origin: input.origin,
      destination: input.destination,
    },
    {
      origin: { localJurisdictions: jurisdictionsFor(input.origin) },
      destination: { localJurisdictions: jurisdictionsFor(input.destination) },
    },
  );
}

export interface ComparisonSummary {
  title: string;
  description: string;
  /** Safe for a filename: "chicago-il-to-austin-tx". */
  slug: string;
}

/** Plain-language summary, used for link previews and the download filename. */
export function describeComparison(result: ComparisonResult): ComparisonSummary {
  const from = metro(result.origin.metroId).shortName;
  const to = metro(result.destination.metroId).shortName;
  const better = result.delta >= 0;
  const amount = formatUSD(Math.abs(result.delta));

  const slugify = (value: string) =>
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');

  return {
    title: `${from} → ${to}: ${amount} a year ${better ? 'better off' : 'worse off'}`,
    description:
      `${formatPercent(Math.abs(result.deltaPct))} ${better ? 'more' : 'less'} spare cash, ` +
      `${formatUSD(Math.abs(result.deltaMonthly))} a month. ` +
      `Break-even salary in ${to}: ${formatUSD(result.breakEvenSalary)}. ` +
      `Income tax, property tax, sales tax, housing, cars and cost of living, from public federal data.`,
    slug: `${slugify(from)}-to-${slugify(to)}`,
  };
}
