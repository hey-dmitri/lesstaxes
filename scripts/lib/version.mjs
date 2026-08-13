/**
 * The dataset release the build scripts write to by default.
 *
 * Every script used to carry its own `const VERSION = '2026.1'`. When 2026.2
 * was built by overriding one of them, the other five kept writing 2026.1 —
 * so the quarterly refresh regenerated a dataset the site had stopped reading,
 * and would have opened a pull request full of changes to nothing.
 *
 * Read from the engine so there is exactly one place that decides, and set
 * DATASET_VERSION in the environment to build a new dated release.
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(resolve(HERE, '..', '..', 'engine', 'datasets.ts'), 'utf8');
const match = /CURRENT_DATASET_VERSION\s*=\s*'([^']+)'/.exec(source);

if (!match) {
  throw new Error('could not read CURRENT_DATASET_VERSION from engine/datasets.ts');
}

export const CURRENT_DATASET_VERSION = match[1];
