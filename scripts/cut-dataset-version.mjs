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
 * This edits engine/current-dataset.ts and engine/datasets.ts, which are
 * generated-ish but deliberately not generated: the imports have to be visible
 * to the bundler — it can only code-split what it can see — and a reviewer
 * should be able to see exactly which versions ship.
 */

import { cpSync, existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { CURRENT_DATASET_VERSION } from './lib/version.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const REGISTRY = resolve(ROOT, 'engine', 'datasets.ts');
const CURRENT_MODULE = resolve(ROOT, 'engine', 'current-dataset.ts');

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

/*
 * 3. Register it, and make it current.
 *
 * TWO FILES, because only one release is bundled eagerly. The incoming release
 * takes over engine/current-dataset.ts, which is regenerated whole — it is
 * nothing but eight imports and a bundle. The OUTGOING release moves into the
 * loader registry in engine/datasets.ts, behind a dynamic import, where it
 * costs a chunk on disk and nothing at all until a link asks for it.
 */
const bundleKey = (name) => {
  const camel = name.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
  return camel === 'localIncomeTax' ? 'localTax' : camel;
};
/** Match the style already in the file: `housing20262`. */
const varName = (name, version) => `${bundleKey(name)}${version.replace('.', '')}`;

const outgoing = CURRENT_DATASET_VERSION;

let registry = readFileSync(REGISTRY, 'utf8');
if (registry.includes(`'${target}':`) || registry.includes(`data/${target}/`)) {
  throw new Error(`engine/datasets.ts already registers ${target}`);
}
if (registry.includes(`'${outgoing}': async`)) {
  throw new Error(`engine/datasets.ts already demoted ${outgoing}`);
}

// The outgoing release joins the lazily-loaded ones, at the end, oldest first.
const loaderBlock =
  `  '${outgoing}': async () => ({\n` +
  `    version: '${outgoing}',\n` +
  FILES.map(
    (name) =>
      `    ${bundleKey(name)}: (await import('../data/${outgoing}/${name}.json')).default,`,
  ).join('\n') +
  `\n  }),\n`;

registry = registry.replace(
  /(\n};\n\n\/\*\* Oldest first)/,
  `\n${loaderBlock}};\n\n/** Oldest first`,
);
writeFileSync(REGISTRY, registry);

// The incoming release becomes the one bundled eagerly.
writeFileSync(
  CURRENT_MODULE,
  `/**
 * The release a fresh visit computes with, and the ONLY one bundled eagerly.
 *
 * It lives in its own module so that cutting a release is a whole-file rewrite
 * of nine lines rather than a surgical edit inside a registry — see
 * scripts/cut-dataset-version.mjs, which regenerates this from a template.
 *
 * Everything else is behind a dynamic import in ./datasets. Static imports of
 * all of them put 14.7MB of JSON in every bundle and parsed it on every cold
 * start, to answer a question that only ever needs one release at a time.
 */

${FILES.map((name) => `import ${varName(name, target)} from '../data/${target}/${name}.json';`).join('\n')}

/**
 * What a fresh visit computes with. Bumping this is the ONLY edit a new dataset
 * release needs on the engine side — everything downstream reads it from here,
 * which is what the two hardcoded boundary modules failed to provide.
 */
export const CURRENT_DATASET_VERSION = '${target}';

/* eslint-disable @typescript-eslint/no-explicit-any */

export const CURRENT_BUNDLE = {
  version: CURRENT_DATASET_VERSION,
${FILES.map((name) => `  ${bundleKey(name)}: ${varName(name, target)} as any,`).join('\n')}
};
`,
);

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
