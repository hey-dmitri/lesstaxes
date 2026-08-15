/**
 * Cuts a new dated dataset release.
 *
 *   node scripts/cut-dataset-version.mjs           # next minor, e.g. 2026.2 -> 2026.3
 *   node scripts/cut-dataset-version.mjs 2027.1    # an explicit version
 *
 * WHY THIS EXISTS. PROJECT.md §16.2: dataset directories are immutable once
 * shipped, and a new release creates a NEW dated directory. The quarterly
 * refresh did not do that — it re-ran the build scripts over the current
 * directory, rewriting it in place. Now that share links genuinely resolve by
 * version (engine/datasets.ts), rebuilding in place would change the numbers
 * under every link already pinned to that version: exactly the failure the
 * pinning work was done to prevent, reintroduced automatically every quarter.
 *
 * So the refresh cuts a release first, and rebuilds into that.
 *
 * This edits engine/datasets.ts, which is generated-ish but deliberately not
 * generated: the static imports have to be visible to the bundler, and a
 * reviewer should be able to see exactly which versions ship.
 */

import { cpSync, existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { CURRENT_DATASET_VERSION } from './lib/version.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const REGISTRY = resolve(ROOT, 'engine', 'datasets.ts');

const FILES = [
  'federal',
  'housing',
  'local-income-tax',
  'metros',
  'sales-tax',
  'spending',
  'states',
  'transport',
];

/** "2026.2" -> "2026.3". Year rolls only when asked for explicitly. */
function nextVersion(current) {
  const match = /^(\d{4})\.(\d+)$/.exec(current);
  if (!match) throw new Error(`cannot parse dataset version: ${current}`);
  return `${match[1]}.${Number(match[2]) + 1}`;
}

const target = process.argv[2] || nextVersion(CURRENT_DATASET_VERSION);
if (!/^\d{4}\.\d+$/.test(target)) {
  throw new Error(`not a dataset version: ${target}`);
}

const from = resolve(ROOT, 'data', CURRENT_DATASET_VERSION);
const to = resolve(ROOT, 'data', target);

if (target === CURRENT_DATASET_VERSION) {
  throw new Error(`${target} is already the current release — nothing to cut`);
}
if (existsSync(to)) {
  throw new Error(`data/${target} already exists; refusing to overwrite a shipped release`);
}

console.log(`Cutting ${CURRENT_DATASET_VERSION} -> ${target}`);

// 1. Copy the current release, sources and all, so the new one can be rebuilt
//    offline and diffed against what it came from.
cpSync(from, to, { recursive: true });

// 2. Restamp every file. The registry asserts these match, so a missed stamp
//    fails loudly at import rather than quietly mislabelling a link.
/*
 * STAMP EVERY JSON IN THE DIRECTORY, not a hand-kept list, and rewrite the
 * PATHS inside as well as the version field.
 *
 * The list missed metros-counties.json, which went on announcing itself as
 * 2026.5 through nine releases. And stamping only the version field left
 * `"snapshot": "data/2026.5/sources/..."` strings pointing at a directory the
 * release does not own — so a reader tracing a figure back to its source was
 * sent to the wrong release.
 *
 * Neither changed a computed number. Both broke the one promise this immutable
 * per-release structure exists to keep: that you can tell exactly which data
 * produced an answer.
 */
const stamped = [];
for (const file of readdirSync(to)) {
  if (!file.endsWith('.json')) continue;
  const path = resolve(to, file);
  const raw = readFileSync(path, 'utf8');

  // Rewrite embedded references to the release directory, whichever release
  // they currently name — files rebuilt at different times name different ones.
  const repointed = raw.replace(/data\/\d{4}\.\d+\//g, `data/${target}/`);
  const json = JSON.parse(repointed);
  if (json.datasetVersion) json.datasetVersion = target;

  const next = `${JSON.stringify(json, null, 2)}\n`;
  if (next !== raw) {
    writeFileSync(path, next);
    stamped.push(file);
  }
}

// 3. Register it, and make it current.
/** Match the hand-written style already in the registry: `housing20262`. */
const suffix = target.replace('.', '');
const varName = (name) => {
  const camel = name.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
  return `${camel === 'localIncomeTax' ? 'localTax' : camel}${suffix}`;
};
const bundleKey = (name) => {
  const camel = name.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
  return camel === 'localIncomeTax' ? 'localTax' : camel;
};
let registry = readFileSync(REGISTRY, 'utf8');

const importBlock = FILES.map(
  (name) => `import ${varName(name)} from '../data/${target}/${name}.json';`,
).join('\n');

const bundleBlock =
  `  '${target}': {\n` +
  `    version: '${target}',\n` +
  FILES.map((name) => `    ${bundleKey(name)}: ${varName(name)},`).join('\n') +
  `\n  },\n`;

if (registry.includes(`'${target}':`)) {
  throw new Error(`engine/datasets.ts already registers ${target}`);
}

registry = registry.replace(
  /(\n\/\* eslint-disable)/,
  `\n${importBlock}\n$1`,
);
registry = registry.replace(/(\n};\n\n\/\*\*\n \* What a fresh visit)/, `\n${bundleBlock}};\n\n/**\n * What a fresh visit`);
registry = registry.replace(
  /export const CURRENT_DATASET_VERSION = '[^']+';/,
  `export const CURRENT_DATASET_VERSION = '${target}';`,
);

writeFileSync(REGISTRY, registry);

// Machine-readable, for the workflow that has to diff the two releases.
if (process.env.GITHUB_OUTPUT) {
  writeFileSync(
    process.env.GITHUB_OUTPUT,
    `version=${target}\nprevious=${CURRENT_DATASET_VERSION}\n`,
    { flag: 'a' },
  );
}

console.log(`  copied  data/${CURRENT_DATASET_VERSION} -> data/${target}`);
console.log(`  stamped ${stamped.length} files: ${stamped.join(', ')}`);
console.log(`  registered ${target} in engine/datasets.ts and made it current`);
console.log(`\nNow rebuild into it:  DATASET_VERSION=${target} node scripts/build-all.mjs --refresh`);
console.log(`data/${CURRENT_DATASET_VERSION} is untouched, so links pinned to it keep resolving.`);
