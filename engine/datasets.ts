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

import federal20263 from '../data/2026.3/federal.json';
import housing20263 from '../data/2026.3/housing.json';
import localTax20263 from '../data/2026.3/local-income-tax.json';
import metros20263 from '../data/2026.3/metros.json';
import salesTax20263 from '../data/2026.3/sales-tax.json';
import spending20263 from '../data/2026.3/spending.json';
import states20263 from '../data/2026.3/states.json';
import transport20263 from '../data/2026.3/transport.json';

import federal20264 from '../data/2026.4/federal.json';
import housing20264 from '../data/2026.4/housing.json';
import localTax20264 from '../data/2026.4/local-income-tax.json';
import metros20264 from '../data/2026.4/metros.json';
import salesTax20264 from '../data/2026.4/sales-tax.json';
import spending20264 from '../data/2026.4/spending.json';
import states20264 from '../data/2026.4/states.json';
import transport20264 from '../data/2026.4/transport.json';

import federal20265 from '../data/2026.5/federal.json';
import housing20265 from '../data/2026.5/housing.json';
import localTax20265 from '../data/2026.5/local-income-tax.json';
import metros20265 from '../data/2026.5/metros.json';
import salesTax20265 from '../data/2026.5/sales-tax.json';
import spending20265 from '../data/2026.5/spending.json';
import states20265 from '../data/2026.5/states.json';
import transport20265 from '../data/2026.5/transport.json';

import federal20266 from '../data/2026.6/federal.json';
import housing20266 from '../data/2026.6/housing.json';
import localTax20266 from '../data/2026.6/local-income-tax.json';
import metros20266 from '../data/2026.6/metros.json';
import salesTax20266 from '../data/2026.6/sales-tax.json';
import spending20266 from '../data/2026.6/spending.json';
import states20266 from '../data/2026.6/states.json';
import transport20266 from '../data/2026.6/transport.json';

import federal20267 from '../data/2026.7/federal.json';
import housing20267 from '../data/2026.7/housing.json';
import localTax20267 from '../data/2026.7/local-income-tax.json';
import metros20267 from '../data/2026.7/metros.json';
import salesTax20267 from '../data/2026.7/sales-tax.json';
import spending20267 from '../data/2026.7/spending.json';
import states20267 from '../data/2026.7/states.json';
import transport20267 from '../data/2026.7/transport.json';

import federal20268 from '../data/2026.8/federal.json';
import housing20268 from '../data/2026.8/housing.json';
import localTax20268 from '../data/2026.8/local-income-tax.json';
import metros20268 from '../data/2026.8/metros.json';
import salesTax20268 from '../data/2026.8/sales-tax.json';
import spending20268 from '../data/2026.8/spending.json';
import states20268 from '../data/2026.8/states.json';
import transport20268 from '../data/2026.8/transport.json';

import federal20269 from '../data/2026.9/federal.json';
import housing20269 from '../data/2026.9/housing.json';
import localTax20269 from '../data/2026.9/local-income-tax.json';
import metros20269 from '../data/2026.9/metros.json';
import salesTax20269 from '../data/2026.9/sales-tax.json';
import spending20269 from '../data/2026.9/spending.json';
import states20269 from '../data/2026.9/states.json';
import transport20269 from '../data/2026.9/transport.json';

import federal202610 from '../data/2026.10/federal.json';
import housing202610 from '../data/2026.10/housing.json';
import localTax202610 from '../data/2026.10/local-income-tax.json';
import metros202610 from '../data/2026.10/metros.json';
import salesTax202610 from '../data/2026.10/sales-tax.json';
import spending202610 from '../data/2026.10/spending.json';
import states202610 from '../data/2026.10/states.json';
import transport202610 from '../data/2026.10/transport.json';

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
  '2026.3': {
    version: '2026.3',
    federal: federal20263,
    housing: housing20263,
    localTax: localTax20263,
    metros: metros20263,
    salesTax: salesTax20263,
    spending: spending20263,
    states: states20263,
    transport: transport20263,
  },
  '2026.4': {
    version: '2026.4',
    federal: federal20264,
    housing: housing20264,
    localTax: localTax20264,
    metros: metros20264,
    salesTax: salesTax20264,
    spending: spending20264,
    states: states20264,
    transport: transport20264,
  },
  '2026.5': {
    version: '2026.5',
    federal: federal20265,
    housing: housing20265,
    localTax: localTax20265,
    metros: metros20265,
    salesTax: salesTax20265,
    spending: spending20265,
    states: states20265,
    transport: transport20265,
  },
  '2026.6': {
    version: '2026.6',
    federal: federal20266,
    housing: housing20266,
    localTax: localTax20266,
    metros: metros20266,
    salesTax: salesTax20266,
    spending: spending20266,
    states: states20266,
    transport: transport20266,
  },
  '2026.7': {
    version: '2026.7',
    federal: federal20267,
    housing: housing20267,
    localTax: localTax20267,
    metros: metros20267,
    salesTax: salesTax20267,
    spending: spending20267,
    states: states20267,
    transport: transport20267,
  },
  '2026.8': {
    version: '2026.8',
    federal: federal20268,
    housing: housing20268,
    localTax: localTax20268,
    metros: metros20268,
    salesTax: salesTax20268,
    spending: spending20268,
    states: states20268,
    transport: transport20268,
  },
  '2026.9': {
    version: '2026.9',
    federal: federal20269,
    housing: housing20269,
    localTax: localTax20269,
    metros: metros20269,
    salesTax: salesTax20269,
    spending: spending20269,
    states: states20269,
    transport: transport20269,
  },
  '2026.10': {
    version: '2026.10',
    federal: federal202610,
    housing: housing202610,
    localTax: localTax202610,
    metros: metros202610,
    salesTax: salesTax202610,
    spending: spending202610,
    states: states202610,
    transport: transport202610,
  },
};

/**
 * What a fresh visit computes with. Bumping this is the ONLY edit a new dataset
 * release needs on the engine side — everything downstream reads it from here,
 * which is what the two hardcoded boundary modules failed to provide.
 */
export const CURRENT_DATASET_VERSION = '2026.10';

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
