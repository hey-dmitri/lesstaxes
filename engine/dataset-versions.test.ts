import { describe, expect, it } from 'vitest';

import { compare, defaultCityInputs, defaultRent } from './compare';
import {
  ALL_DATASET_VERSIONS,
  CURRENT_DATASET_VERSION,
  datasetBundle,
  isKnownDatasetVersion,
} from './datasets';
import { housingDefaults, incomeRentCurve, metro, spendingProfile } from './dataset';
import { decodeComparison, encodeComparison } from '../lib/share-link';
import { stateRules } from './tax/rules';
import type { Household } from './types';

const CHICAGO = '16980';
const AUSTIN = '12420';

const family: Household = { filingStatus: 'marriedJointly', children: 2 };
const single: Household = { filingStatus: 'single', children: 0 };

describe('the dataset registry', () => {
  it('ships more than one version, or none of this means anything', () => {
    expect(ALL_DATASET_VERSIONS.length).toBeGreaterThan(1);
    expect(ALL_DATASET_VERSIONS).toContain(CURRENT_DATASET_VERSION);
  });

  it('resolves each version to files stamped with that version', () => {
    for (const version of ALL_DATASET_VERSIONS) {
      const bundle = datasetBundle(version);
      expect(bundle.version).toBe(version);
      expect(bundle.metros.datasetVersion).toBe(version);
      expect(bundle.housing.datasetVersion).toBe(version);
      expect(bundle.federal.datasetVersion).toBe(version);
    }
  });

  it('falls back to the current release rather than throwing on an unknown one', () => {
    // Someone on a stale build opening a newer link should still get an answer.
    expect(isKnownDatasetVersion('1999.9')).toBe(false);
    expect(datasetBundle('1999.9').version).toBe(CURRENT_DATASET_VERSION);
    expect(datasetBundle(undefined).version).toBe(CURRENT_DATASET_VERSION);
  });

  it('reads tax rules and metros from the SAME version', () => {
    // engine/tax/rules.ts read 2026.1 while engine/dataset.ts read 2026.2, each
    // claiming to be the only door into data/. This is that bug's regression.
    for (const version of ALL_DATASET_VERSIONS) {
      expect(stateRules('IL', version)).toBeDefined();
      expect(metro(CHICAGO, version)).toBeDefined();
      expect(datasetBundle(version).states.datasetVersion).toBe(version);
    }
  });
});

describe('a shared link recomputes against its own release', () => {
  it('reproduces 2026.1 numbers from a 2026.1 link', () => {
    const versions = ALL_DATASET_VERSIONS.map((version) =>
      compare({
        datasetVersion: version,
        household: family,
        origin: defaultCityInputs(CHICAGO, 150_000, family, 'rent', 0.068, version),
        destination: defaultCityInputs(AUSTIN, 150_000, family, 'rent', 0.068, version),
      }),
    );

    for (const [i, version] of ALL_DATASET_VERSIONS.entries()) {
      expect(versions[i].datasetVersion).toBe(version);
    }

    // At least two releases must genuinely disagree, or this proves nothing.
    // Not ALL of them: a release cut by the quarterly workflow matches its
    // parent exactly until the refreshed sources land, and that is correct.
    const answers = new Set(versions.map((r) => Math.round(r.delta)));
    expect(answers.size).toBeGreaterThan(1);

    // 2026.1 shipped a different rent model, so it must differ from current.
    const first = versions[ALL_DATASET_VERSIONS.indexOf('2026.1')];
    const current = versions[ALL_DATASET_VERSIONS.indexOf(CURRENT_DATASET_VERSION)];
    expect(Math.round(first.delta)).not.toBe(Math.round(current.delta));
  });

  it('keeps an old release’s MODEL, not just its numbers', () => {
    // 2026.1 has no rent-by-bedroom table and no income curve. Every household
    // at every salary got one metro-wide median, and its links must keep doing
    // exactly that rather than silently gaining the 2026.2 behaviour.
    expect(incomeRentCurve('2026.1')).toBeNull();

    const flat = new Set(
      [single, family, { filingStatus: 'marriedJointly', children: 6 } as Household].flatMap((h) =>
        [30_000, 150_000, 400_000].map((salary) => defaultRent(CHICAGO, salary, h, '2026.1')),
      ),
    );
    expect(flat.size).toBe(1);
    expect([...flat][0]).toBe(housingDefaults(CHICAGO, '2026.1').medianRentMonthly);
  });

  it('varies rent by household and salary on the current release', () => {
    const varied = new Set(
      [single, family].flatMap((h) =>
        [30_000, 150_000].map((salary) => defaultRent(CHICAGO, salary, h, CURRENT_DATASET_VERSION)),
      ),
    );
    expect(varied.size).toBe(4);
  });

  it('survives the full encode → decode → compute round trip', () => {
    const inputs = {
      datasetVersion: '2026.1',
      filingStatus: family.filingStatus,
      children: family.children,
      origin: {
        ...defaultCityInputs(CHICAGO, 150_000, family, 'rent', 0.068, '2026.1'),
        localOptIns: {},
      },
      destination: {
        ...defaultCityInputs(AUSTIN, 150_000, family, 'rent', 0.068, '2026.1'),
        localOptIns: {},
      },
    };
    const decoded = decodeComparison(encodeComparison(inputs));
    expect(decoded.datasetVersion).toBe('2026.1');

    const result = compare({
      datasetVersion: decoded.datasetVersion,
      household: { filingStatus: decoded.filingStatus, children: decoded.children },
      origin: decoded.origin,
      destination: decoded.destination,
    });
    expect(result.datasetVersion).toBe('2026.1');
  });

  it('prices both cities from one release even if an option says otherwise', () => {
    // A per-city override must never be able to price half a comparison against
    // a different release — that would be a difference between two datasets
    // rather than between two cities.
    const result = compare(
      {
        datasetVersion: '2026.1',
        household: single,
        origin: defaultCityInputs(CHICAGO, 150_000, single, 'rent', 0.068, '2026.1'),
        destination: defaultCityInputs(AUSTIN, 150_000, single, 'rent', 0.068, '2026.1'),
      },
      { destination: { datasetVersion: CURRENT_DATASET_VERSION } },
    );
    expect(result.datasetVersion).toBe('2026.1');

    const pinned = compare({
      datasetVersion: '2026.1',
      household: single,
      origin: defaultCityInputs(CHICAGO, 150_000, single, 'rent', 0.068, '2026.1'),
      destination: defaultCityInputs(AUSTIN, 150_000, single, 'rent', 0.068, '2026.1'),
    });
    expect(result.delta).toBeCloseTo(pinned.delta, 6);
  });

  it('uses each release’s own spending profiles', () => {
    for (const version of ALL_DATASET_VERSIONS) {
      expect(spendingProfile(150_000, version).bracket).toBeTruthy();
    }
  });
});
