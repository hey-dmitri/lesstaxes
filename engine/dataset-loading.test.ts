/**
 * ONE RELEASE IS BUNDLED. THE REST ARE FETCHED, AND NEVER GUESSED.
 *
 * Importing all 29 shipped releases statically put 12.5MB of JSON in every
 * browser and parsed it on every cold start, to answer a question that needs
 * exactly one release: the one the link is pinned to. Older releases are behind
 * a dynamic import now.
 *
 * The saving is only safe if the failure mode is loud. Falling back to the
 * current release when an older one has not been fetched would answer with this
 * year's numbers under a link that promises the sender's — which is precisely
 * the failure PROJECT.md §9.2 exists to rule out, and it would be invisible.
 *
 * These tests run against a FRESH module registry, because the suite's setup
 * file loads every release up front so the rest of the tests can read them
 * synchronously. vi.resetModules() undoes that for this file only.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

async function freshRegistry() {
  vi.resetModules();
  return import('./datasets');
}

describe('loading a dataset release', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('has the current release ready without being asked', async () => {
    const { datasetBundle, CURRENT_DATASET_VERSION } = await freshRegistry();
    const bundle = datasetBundle(CURRENT_DATASET_VERSION);
    expect(bundle.version).toBe(CURRENT_DATASET_VERSION);
    expect(bundle.federal).toBeTruthy();
  });

  it('refuses to answer for a shipped release it has not fetched', async () => {
    const { datasetBundle, CURRENT_DATASET_VERSION, ALL_DATASET_VERSIONS } =
      await freshRegistry();
    const older = ALL_DATASET_VERSIONS.filter((v) => v !== CURRENT_DATASET_VERSION);
    expect(older.length).toBeGreaterThan(0);

    for (const version of older) {
      // Not "returns the wrong numbers quietly". The whole point of keeping old
      // releases is that a link pinned to one resolves to it.
      expect(() => datasetBundle(version), version).toThrow(/has not been loaded/);
    }
  });

  it('hands back the real release once it is fetched', async () => {
    const { datasetBundle, loadDataset, CURRENT_DATASET_VERSION, ALL_DATASET_VERSIONS } =
      await freshRegistry();
    const oldest = ALL_DATASET_VERSIONS[0];
    expect(oldest).not.toBe(CURRENT_DATASET_VERSION);

    await loadDataset(oldest);
    const bundle = datasetBundle(oldest);
    expect(bundle.version).toBe(oldest);
    // The files inside stamp their own release, and the loader checks it.
    expect(bundle.metros.datasetVersion ?? oldest).toBe(oldest);
  });

  it('still falls back for a version it never shipped', async () => {
    const { datasetBundle, CURRENT_DATASET_VERSION } = await freshRegistry();
    // A link from a FUTURE release, opened on an older cached build. A
    // slightly-off answer beats a blank page, and there is nothing else to use.
    expect(datasetBundle('2099.1').version).toBe(CURRENT_DATASET_VERSION);
    expect(datasetBundle('not-a-version').version).toBe(CURRENT_DATASET_VERSION);
  });

  it('is safe to ask for the same release twice, or at the same time', async () => {
    const { datasetBundle, loadDataset, ALL_DATASET_VERSIONS } = await freshRegistry();
    const version = ALL_DATASET_VERSIONS[1];

    await Promise.all([loadDataset(version), loadDataset(version), loadDataset(version)]);
    await loadDataset(version);
    expect(datasetBundle(version).version).toBe(version);
  });

  it('shrugs at the current release and at one it has never heard of', async () => {
    const { loadDataset, CURRENT_DATASET_VERSION } = await freshRegistry();
    await expect(loadDataset(CURRENT_DATASET_VERSION)).resolves.toBeUndefined();
    await expect(loadDataset('2099.1')).resolves.toBeUndefined();
  });

  it('lists every release on disk, loaded or not', async () => {
    const { ALL_DATASET_VERSIONS, isKnownDatasetVersion, CURRENT_DATASET_VERSION } =
      await freshRegistry();
    const { readdirSync } = await import('node:fs');
    const onDisk = readdirSync(new URL('../data', import.meta.url))
      .filter((name) => /^\d{4}\.\d+$/.test(name))
      .sort();

    expect([...ALL_DATASET_VERSIONS].sort()).toEqual(onDisk);
    expect(ALL_DATASET_VERSIONS).toContain(CURRENT_DATASET_VERSION);
    for (const version of onDisk) expect(isKnownDatasetVersion(version), version).toBe(true);
  });
});
