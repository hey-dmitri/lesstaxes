/**
 * Every dataset version the site has ever shipped, addressable by version.
 *
 * WHY THIS EXISTS. PROJECT.md §9.2 promises that a shared link recomputes
 * against the data it was made with, so that the recipient sees the sender's
 * numbers even after a refresh. The link format has always carried the version
 * and the engine has always ignored it: two boundary modules each imported one
 * hardcoded directory, and by the time 2026.2 was built they had drifted to
 * DIFFERENT directories, so the engine was reading two versions at once.
 *
 * Old versions are never deleted (§16.2). That is the whole mechanism: a link
 * from 2026.1 still resolves to 2026.1 data here, indefinitely.
 *
 * OLD VERSIONS KEEP OLD BEHAVIOUR, NOT JUST OLD NUMBERS. Schemas grow — 2026.2
 * added rent by bedroom count and an income curve that 2026.1 has no field for.
 * Rather than backfill a shipped dataset, which would break the immutability the
 * promise rests on, the accessors detect what a bundle actually carries and fall
 * back to how that version computed things. A 2026.1 link reproduces 2026.1,
 * including the cruder rent model it shipped with.
 */

import federal20261 from '../data/2026.1/federal.json';
import housing20261 from '../data/2026.1/housing.json';
import localTax20261 from '../data/2026.1/local-income-tax.json';
import metros20261 from '../data/2026.1/metros.json';
import salesTax20261 from '../data/2026.1/sales-tax.json';
import spending20261 from '../data/2026.1/spending.json';
import states20261 from '../data/2026.1/states.json';
import transport20261 from '../data/2026.1/transport.json';

import federal20262 from '../data/2026.2/federal.json';
import housing20262 from '../data/2026.2/housing.json';
import localTax20262 from '../data/2026.2/local-income-tax.json';
import metros20262 from '../data/2026.2/metros.json';
import salesTax20262 from '../data/2026.2/sales-tax.json';
import spending20262 from '../data/2026.2/spending.json';
import states20262 from '../data/2026.2/states.json';
import transport20262 from '../data/2026.2/transport.json';

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface DatasetBundle {
  version: string;
  federal: any;
  housing: any;
  localTax: any;
  metros: any;
  salesTax: any;
  spending: any;
  states: any;
  transport: any;
}

const BUNDLES: Record<string, DatasetBundle> = {
  '2026.1': {
    version: '2026.1',
    federal: federal20261,
    housing: housing20261,
    localTax: localTax20261,
    metros: metros20261,
    salesTax: salesTax20261,
    spending: spending20261,
    states: states20261,
    transport: transport20261,
  },
  '2026.2': {
    version: '2026.2',
    federal: federal20262,
    housing: housing20262,
    localTax: localTax20262,
    metros: metros20262,
    salesTax: salesTax20262,
    spending: spending20262,
    states: states20262,
    transport: transport20262,
  },
};

/**
 * What a fresh visit computes with. Bumping this is the ONLY edit a new dataset
 * release needs on the engine side — everything downstream reads it from here,
 * which is what the two hardcoded boundary modules failed to provide.
 */
export const CURRENT_DATASET_VERSION = '2026.2';

export const ALL_DATASET_VERSIONS: readonly string[] = Object.keys(BUNDLES).sort();

/** Every shipped bundle agrees with the version stamped inside its own files. */
for (const [version, bundle] of Object.entries(BUNDLES)) {
  for (const [name, file] of Object.entries(bundle)) {
    if (name === 'version') continue;
    const stamped = (file as { datasetVersion?: string }).datasetVersion;
    if (stamped && stamped !== version) {
      throw new Error(
        `dataset ${version} contains ${name}.json stamped ${stamped} — ` +
          `a mismatched file here silently changes what shared links resolve to`,
      );
    }
  }
}

if (!BUNDLES[CURRENT_DATASET_VERSION]) {
  throw new Error(`CURRENT_DATASET_VERSION ${CURRENT_DATASET_VERSION} is not a shipped dataset`);
}

/**
 * Resolve a version to its data.
 *
 * An unknown version falls back to the current one rather than throwing. A link
 * from a FUTURE release — someone on an older cached build opening a colleague's
 * newer link — should still produce an answer, and a slightly-off answer beats a
 * blank page. A link from a version we simply never had is the same case.
 */
export function datasetBundle(version?: string): DatasetBundle {
  if (!version) return BUNDLES[CURRENT_DATASET_VERSION];
  return BUNDLES[version] ?? BUNDLES[CURRENT_DATASET_VERSION];
}

/** Whether a version is one we actually hold data for. */
export function isKnownDatasetVersion(version: string): boolean {
  return Object.hasOwn(BUNDLES, version);
}
