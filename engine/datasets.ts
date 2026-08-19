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
 *
 * ONLY ONE RELEASE IS EVER LOADED, AND USUALLY IT IS THE CURRENT ONE.
 *
 * This module used to import all 29 releases statically — 14.7MB of JSON in
 * every bundle, parsed on every cold start of every function that touches the
 * engine, and shipped to every browser. A comparison needs exactly one release:
 * the one its link is pinned to, which for any link made today is the current
 * one. So the current release is imported eagerly (./current-dataset, 0.6MB)
 * and every older release sits behind a dynamic import that nothing fetches
 * until a link asks for it.
 *
 * The cost is that reading an old release is now a two-step thing: await
 * loadDataset(version), then read it synchronously as before. Only the two
 * places that replay a pinned link do that — the shared page's metadata and the
 * share card — and both were already async.
 *
 * A KNOWN VERSION THAT HAS NOT BEEN LOADED THROWS. It would be friendlier to
 * fall back to the current release, and that is exactly the bug this module was
 * built to prevent: quietly answering with the wrong year's numbers under a link
 * that promises otherwise. An UNKNOWN version still falls back, because there is
 * nothing else it could do.
 */

import { CURRENT_BUNDLE, CURRENT_DATASET_VERSION } from './current-dataset';

export { CURRENT_DATASET_VERSION };

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

/**
 * Releases already in memory. Starts with the current one and grows as older
 * links are opened; a release is never evicted, because the files are immutable
 * and a second reader of the same link should not pay for it twice.
 */
const BUNDLES: Record<string, DatasetBundle> = {
  [CURRENT_DATASET_VERSION]: CURRENT_BUNDLE,
};

/**
 * Every release before the current one, behind a dynamic import each.
 *
 * Written out rather than built from a template string, because a bundler can
 * only split what it can see. A new entry is appended here by
 * scripts/cut-dataset-version.mjs when the outgoing release stops being current.
 */
const LOADERS: Record<string, () => Promise<DatasetBundle>> = {
  '2026.1': async () => ({
    version: '2026.1',
    federal: (await import('../data/2026.1/federal.json')).default,
    housing: (await import('../data/2026.1/housing.json')).default,
    localTax: (await import('../data/2026.1/local-income-tax.json')).default,
    metros: (await import('../data/2026.1/metros.json')).default,
    salesTax: (await import('../data/2026.1/sales-tax.json')).default,
    spending: (await import('../data/2026.1/spending.json')).default,
    states: (await import('../data/2026.1/states.json')).default,
    transport: (await import('../data/2026.1/transport.json')).default,
  }),
  '2026.2': async () => ({
    version: '2026.2',
    federal: (await import('../data/2026.2/federal.json')).default,
    housing: (await import('../data/2026.2/housing.json')).default,
    localTax: (await import('../data/2026.2/local-income-tax.json')).default,
    metros: (await import('../data/2026.2/metros.json')).default,
    salesTax: (await import('../data/2026.2/sales-tax.json')).default,
    spending: (await import('../data/2026.2/spending.json')).default,
    states: (await import('../data/2026.2/states.json')).default,
    transport: (await import('../data/2026.2/transport.json')).default,
  }),
  '2026.3': async () => ({
    version: '2026.3',
    federal: (await import('../data/2026.3/federal.json')).default,
    housing: (await import('../data/2026.3/housing.json')).default,
    localTax: (await import('../data/2026.3/local-income-tax.json')).default,
    metros: (await import('../data/2026.3/metros.json')).default,
    salesTax: (await import('../data/2026.3/sales-tax.json')).default,
    spending: (await import('../data/2026.3/spending.json')).default,
    states: (await import('../data/2026.3/states.json')).default,
    transport: (await import('../data/2026.3/transport.json')).default,
  }),
  '2026.4': async () => ({
    version: '2026.4',
    federal: (await import('../data/2026.4/federal.json')).default,
    housing: (await import('../data/2026.4/housing.json')).default,
    localTax: (await import('../data/2026.4/local-income-tax.json')).default,
    metros: (await import('../data/2026.4/metros.json')).default,
    salesTax: (await import('../data/2026.4/sales-tax.json')).default,
    spending: (await import('../data/2026.4/spending.json')).default,
    states: (await import('../data/2026.4/states.json')).default,
    transport: (await import('../data/2026.4/transport.json')).default,
  }),
  '2026.5': async () => ({
    version: '2026.5',
    federal: (await import('../data/2026.5/federal.json')).default,
    housing: (await import('../data/2026.5/housing.json')).default,
    localTax: (await import('../data/2026.5/local-income-tax.json')).default,
    metros: (await import('../data/2026.5/metros.json')).default,
    salesTax: (await import('../data/2026.5/sales-tax.json')).default,
    spending: (await import('../data/2026.5/spending.json')).default,
    states: (await import('../data/2026.5/states.json')).default,
    transport: (await import('../data/2026.5/transport.json')).default,
  }),
  '2026.6': async () => ({
    version: '2026.6',
    federal: (await import('../data/2026.6/federal.json')).default,
    housing: (await import('../data/2026.6/housing.json')).default,
    localTax: (await import('../data/2026.6/local-income-tax.json')).default,
    metros: (await import('../data/2026.6/metros.json')).default,
    salesTax: (await import('../data/2026.6/sales-tax.json')).default,
    spending: (await import('../data/2026.6/spending.json')).default,
    states: (await import('../data/2026.6/states.json')).default,
    transport: (await import('../data/2026.6/transport.json')).default,
  }),
  '2026.7': async () => ({
    version: '2026.7',
    federal: (await import('../data/2026.7/federal.json')).default,
    housing: (await import('../data/2026.7/housing.json')).default,
    localTax: (await import('../data/2026.7/local-income-tax.json')).default,
    metros: (await import('../data/2026.7/metros.json')).default,
    salesTax: (await import('../data/2026.7/sales-tax.json')).default,
    spending: (await import('../data/2026.7/spending.json')).default,
    states: (await import('../data/2026.7/states.json')).default,
    transport: (await import('../data/2026.7/transport.json')).default,
  }),
  '2026.8': async () => ({
    version: '2026.8',
    federal: (await import('../data/2026.8/federal.json')).default,
    housing: (await import('../data/2026.8/housing.json')).default,
    localTax: (await import('../data/2026.8/local-income-tax.json')).default,
    metros: (await import('../data/2026.8/metros.json')).default,
    salesTax: (await import('../data/2026.8/sales-tax.json')).default,
    spending: (await import('../data/2026.8/spending.json')).default,
    states: (await import('../data/2026.8/states.json')).default,
    transport: (await import('../data/2026.8/transport.json')).default,
  }),
  '2026.9': async () => ({
    version: '2026.9',
    federal: (await import('../data/2026.9/federal.json')).default,
    housing: (await import('../data/2026.9/housing.json')).default,
    localTax: (await import('../data/2026.9/local-income-tax.json')).default,
    metros: (await import('../data/2026.9/metros.json')).default,
    salesTax: (await import('../data/2026.9/sales-tax.json')).default,
    spending: (await import('../data/2026.9/spending.json')).default,
    states: (await import('../data/2026.9/states.json')).default,
    transport: (await import('../data/2026.9/transport.json')).default,
  }),
  '2026.10': async () => ({
    version: '2026.10',
    federal: (await import('../data/2026.10/federal.json')).default,
    housing: (await import('../data/2026.10/housing.json')).default,
    localTax: (await import('../data/2026.10/local-income-tax.json')).default,
    metros: (await import('../data/2026.10/metros.json')).default,
    salesTax: (await import('../data/2026.10/sales-tax.json')).default,
    spending: (await import('../data/2026.10/spending.json')).default,
    states: (await import('../data/2026.10/states.json')).default,
    transport: (await import('../data/2026.10/transport.json')).default,
  }),
  '2026.11': async () => ({
    version: '2026.11',
    federal: (await import('../data/2026.11/federal.json')).default,
    housing: (await import('../data/2026.11/housing.json')).default,
    localTax: (await import('../data/2026.11/local-income-tax.json')).default,
    metros: (await import('../data/2026.11/metros.json')).default,
    salesTax: (await import('../data/2026.11/sales-tax.json')).default,
    spending: (await import('../data/2026.11/spending.json')).default,
    states: (await import('../data/2026.11/states.json')).default,
    transport: (await import('../data/2026.11/transport.json')).default,
  }),
  '2026.12': async () => ({
    version: '2026.12',
    federal: (await import('../data/2026.12/federal.json')).default,
    housing: (await import('../data/2026.12/housing.json')).default,
    localTax: (await import('../data/2026.12/local-income-tax.json')).default,
    metros: (await import('../data/2026.12/metros.json')).default,
    salesTax: (await import('../data/2026.12/sales-tax.json')).default,
    spending: (await import('../data/2026.12/spending.json')).default,
    states: (await import('../data/2026.12/states.json')).default,
    transport: (await import('../data/2026.12/transport.json')).default,
  }),
  '2026.13': async () => ({
    version: '2026.13',
    federal: (await import('../data/2026.13/federal.json')).default,
    housing: (await import('../data/2026.13/housing.json')).default,
    localTax: (await import('../data/2026.13/local-income-tax.json')).default,
    metros: (await import('../data/2026.13/metros.json')).default,
    salesTax: (await import('../data/2026.13/sales-tax.json')).default,
    spending: (await import('../data/2026.13/spending.json')).default,
    states: (await import('../data/2026.13/states.json')).default,
    transport: (await import('../data/2026.13/transport.json')).default,
  }),
  '2026.14': async () => ({
    version: '2026.14',
    federal: (await import('../data/2026.14/federal.json')).default,
    housing: (await import('../data/2026.14/housing.json')).default,
    localTax: (await import('../data/2026.14/local-income-tax.json')).default,
    metros: (await import('../data/2026.14/metros.json')).default,
    salesTax: (await import('../data/2026.14/sales-tax.json')).default,
    spending: (await import('../data/2026.14/spending.json')).default,
    states: (await import('../data/2026.14/states.json')).default,
    transport: (await import('../data/2026.14/transport.json')).default,
  }),
  '2026.15': async () => ({
    version: '2026.15',
    federal: (await import('../data/2026.15/federal.json')).default,
    housing: (await import('../data/2026.15/housing.json')).default,
    localTax: (await import('../data/2026.15/local-income-tax.json')).default,
    metros: (await import('../data/2026.15/metros.json')).default,
    salesTax: (await import('../data/2026.15/sales-tax.json')).default,
    spending: (await import('../data/2026.15/spending.json')).default,
    states: (await import('../data/2026.15/states.json')).default,
    transport: (await import('../data/2026.15/transport.json')).default,
  }),
  '2026.16': async () => ({
    version: '2026.16',
    federal: (await import('../data/2026.16/federal.json')).default,
    housing: (await import('../data/2026.16/housing.json')).default,
    localTax: (await import('../data/2026.16/local-income-tax.json')).default,
    metros: (await import('../data/2026.16/metros.json')).default,
    salesTax: (await import('../data/2026.16/sales-tax.json')).default,
    spending: (await import('../data/2026.16/spending.json')).default,
    states: (await import('../data/2026.16/states.json')).default,
    transport: (await import('../data/2026.16/transport.json')).default,
  }),
  '2026.17': async () => ({
    version: '2026.17',
    federal: (await import('../data/2026.17/federal.json')).default,
    housing: (await import('../data/2026.17/housing.json')).default,
    localTax: (await import('../data/2026.17/local-income-tax.json')).default,
    metros: (await import('../data/2026.17/metros.json')).default,
    salesTax: (await import('../data/2026.17/sales-tax.json')).default,
    spending: (await import('../data/2026.17/spending.json')).default,
    states: (await import('../data/2026.17/states.json')).default,
    transport: (await import('../data/2026.17/transport.json')).default,
  }),
  '2026.18': async () => ({
    version: '2026.18',
    federal: (await import('../data/2026.18/federal.json')).default,
    housing: (await import('../data/2026.18/housing.json')).default,
    localTax: (await import('../data/2026.18/local-income-tax.json')).default,
    metros: (await import('../data/2026.18/metros.json')).default,
    salesTax: (await import('../data/2026.18/sales-tax.json')).default,
    spending: (await import('../data/2026.18/spending.json')).default,
    states: (await import('../data/2026.18/states.json')).default,
    transport: (await import('../data/2026.18/transport.json')).default,
  }),
  '2026.19': async () => ({
    version: '2026.19',
    federal: (await import('../data/2026.19/federal.json')).default,
    housing: (await import('../data/2026.19/housing.json')).default,
    localTax: (await import('../data/2026.19/local-income-tax.json')).default,
    metros: (await import('../data/2026.19/metros.json')).default,
    salesTax: (await import('../data/2026.19/sales-tax.json')).default,
    spending: (await import('../data/2026.19/spending.json')).default,
    states: (await import('../data/2026.19/states.json')).default,
    transport: (await import('../data/2026.19/transport.json')).default,
  }),
  '2026.20': async () => ({
    version: '2026.20',
    federal: (await import('../data/2026.20/federal.json')).default,
    housing: (await import('../data/2026.20/housing.json')).default,
    localTax: (await import('../data/2026.20/local-income-tax.json')).default,
    metros: (await import('../data/2026.20/metros.json')).default,
    salesTax: (await import('../data/2026.20/sales-tax.json')).default,
    spending: (await import('../data/2026.20/spending.json')).default,
    states: (await import('../data/2026.20/states.json')).default,
    transport: (await import('../data/2026.20/transport.json')).default,
  }),
  '2026.21': async () => ({
    version: '2026.21',
    federal: (await import('../data/2026.21/federal.json')).default,
    housing: (await import('../data/2026.21/housing.json')).default,
    localTax: (await import('../data/2026.21/local-income-tax.json')).default,
    metros: (await import('../data/2026.21/metros.json')).default,
    salesTax: (await import('../data/2026.21/sales-tax.json')).default,
    spending: (await import('../data/2026.21/spending.json')).default,
    states: (await import('../data/2026.21/states.json')).default,
    transport: (await import('../data/2026.21/transport.json')).default,
  }),
  '2026.22': async () => ({
    version: '2026.22',
    federal: (await import('../data/2026.22/federal.json')).default,
    housing: (await import('../data/2026.22/housing.json')).default,
    localTax: (await import('../data/2026.22/local-income-tax.json')).default,
    metros: (await import('../data/2026.22/metros.json')).default,
    salesTax: (await import('../data/2026.22/sales-tax.json')).default,
    spending: (await import('../data/2026.22/spending.json')).default,
    states: (await import('../data/2026.22/states.json')).default,
    transport: (await import('../data/2026.22/transport.json')).default,
  }),
  '2026.23': async () => ({
    version: '2026.23',
    federal: (await import('../data/2026.23/federal.json')).default,
    housing: (await import('../data/2026.23/housing.json')).default,
    localTax: (await import('../data/2026.23/local-income-tax.json')).default,
    metros: (await import('../data/2026.23/metros.json')).default,
    salesTax: (await import('../data/2026.23/sales-tax.json')).default,
    spending: (await import('../data/2026.23/spending.json')).default,
    states: (await import('../data/2026.23/states.json')).default,
    transport: (await import('../data/2026.23/transport.json')).default,
  }),
  '2026.24': async () => ({
    version: '2026.24',
    federal: (await import('../data/2026.24/federal.json')).default,
    housing: (await import('../data/2026.24/housing.json')).default,
    localTax: (await import('../data/2026.24/local-income-tax.json')).default,
    metros: (await import('../data/2026.24/metros.json')).default,
    salesTax: (await import('../data/2026.24/sales-tax.json')).default,
    spending: (await import('../data/2026.24/spending.json')).default,
    states: (await import('../data/2026.24/states.json')).default,
    transport: (await import('../data/2026.24/transport.json')).default,
  }),
  '2026.25': async () => ({
    version: '2026.25',
    federal: (await import('../data/2026.25/federal.json')).default,
    housing: (await import('../data/2026.25/housing.json')).default,
    localTax: (await import('../data/2026.25/local-income-tax.json')).default,
    metros: (await import('../data/2026.25/metros.json')).default,
    salesTax: (await import('../data/2026.25/sales-tax.json')).default,
    spending: (await import('../data/2026.25/spending.json')).default,
    states: (await import('../data/2026.25/states.json')).default,
    transport: (await import('../data/2026.25/transport.json')).default,
  }),
  '2026.26': async () => ({
    version: '2026.26',
    federal: (await import('../data/2026.26/federal.json')).default,
    housing: (await import('../data/2026.26/housing.json')).default,
    localTax: (await import('../data/2026.26/local-income-tax.json')).default,
    metros: (await import('../data/2026.26/metros.json')).default,
    salesTax: (await import('../data/2026.26/sales-tax.json')).default,
    spending: (await import('../data/2026.26/spending.json')).default,
    states: (await import('../data/2026.26/states.json')).default,
    transport: (await import('../data/2026.26/transport.json')).default,
  }),
  '2026.27': async () => ({
    version: '2026.27',
    federal: (await import('../data/2026.27/federal.json')).default,
    housing: (await import('../data/2026.27/housing.json')).default,
    localTax: (await import('../data/2026.27/local-income-tax.json')).default,
    metros: (await import('../data/2026.27/metros.json')).default,
    salesTax: (await import('../data/2026.27/sales-tax.json')).default,
    spending: (await import('../data/2026.27/spending.json')).default,
    states: (await import('../data/2026.27/states.json')).default,
    transport: (await import('../data/2026.27/transport.json')).default,
  }),
  '2026.28': async () => ({
    version: '2026.28',
    federal: (await import('../data/2026.28/federal.json')).default,
    housing: (await import('../data/2026.28/housing.json')).default,
    localTax: (await import('../data/2026.28/local-income-tax.json')).default,
    metros: (await import('../data/2026.28/metros.json')).default,
    salesTax: (await import('../data/2026.28/sales-tax.json')).default,
    spending: (await import('../data/2026.28/spending.json')).default,
    states: (await import('../data/2026.28/states.json')).default,
    transport: (await import('../data/2026.28/transport.json')).default,
  }),
};

/** Oldest first, which is the order the releases were cut in. */
export const ALL_DATASET_VERSIONS: readonly string[] = [
  ...Object.keys(LOADERS),
  CURRENT_DATASET_VERSION,
];

/**
 * A bundle must agree with the version stamped inside its own files.
 *
 * A mismatch here silently changes what shared links resolve to, so it is a
 * throw rather than a warning. Checked as each release is loaded rather than
 * over all of them at startup, which is what loading them all at startup was
 * for.
 */
function verify(version: string, bundle: DatasetBundle): DatasetBundle {
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
  return bundle;
}

verify(CURRENT_DATASET_VERSION, CURRENT_BUNDLE);

/**
 * Fetch an older release so that datasetBundle() can hand it back.
 *
 * Idempotent, and safe to call with the current version or an unknown one — in
 * both cases there is nothing to fetch. Concurrent calls for the same version
 * share one fetch rather than racing to parse the same 0.6MB twice.
 */
const IN_FLIGHT = new Map<string, Promise<void>>();

export function loadDataset(version: string): Promise<void> {
  if (BUNDLES[version]) return Promise.resolve();
  const load = LOADERS[version];
  if (!load) return Promise.resolve();

  const existing = IN_FLIGHT.get(version);
  if (existing) return existing;

  const pending = load()
    .then((bundle) => {
      BUNDLES[version] = verify(version, bundle);
    })
    .finally(() => IN_FLIGHT.delete(version));
  IN_FLIGHT.set(version, pending);
  return pending;
}

/** Every release, loaded. Used by the test suite, which reads all of them. */
export function loadAllDatasets(): Promise<void[]> {
  return Promise.all(ALL_DATASET_VERSIONS.map((version) => loadDataset(version)));
}

/**
 * Resolve a version to its data.
 *
 * An unknown version falls back to the current one rather than throwing. A link
 * from a FUTURE release — someone on an older cached build opening a colleague's
 * newer link — should still produce an answer, and a slightly-off answer beats a
 * blank page. A link from a version we simply never had is the same case.
 *
 * A version we DO have but have not loaded is not that case. Falling back there
 * would answer with the current year's numbers under a link that promises the
 * sender's, which is the one failure §9.2 exists to rule out, so it throws and
 * names the call that was missing.
 */
export function datasetBundle(version?: string): DatasetBundle {
  if (!version) return BUNDLES[CURRENT_DATASET_VERSION];

  const loaded = BUNDLES[version];
  if (loaded) return loaded;

  if (LOADERS[version]) {
    throw new Error(
      `dataset ${version} is a shipped release that has not been loaded — ` +
        `await loadDataset('${version}') before computing against it`,
    );
  }
  return BUNDLES[CURRENT_DATASET_VERSION];
}

/** Whether a version is one we actually hold data for. */
export function isKnownDatasetVersion(version: string): boolean {
  return version === CURRENT_DATASET_VERSION || Object.hasOwn(LOADERS, version);
}
