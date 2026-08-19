/**
 * Every shipped release, in memory, before any test runs.
 *
 * The engine loads one release eagerly and fetches older ones on demand, which
 * is what keeps 14.7MB of JSON out of the browser and off every cold start. The
 * test suite is the one caller that genuinely wants all of them: several files
 * sweep `ALL_DATASET_VERSIONS` and assert that each release still computes what
 * it computed when it shipped, which is the whole point of keeping them.
 *
 * Doing it here rather than in each file keeps the tests reading as they did
 * before the split — no await, no beforeAll, no per-file setup that a new test
 * would have to remember to copy.
 */

import { loadAllDatasets } from './datasets';

await loadAllDatasets();
