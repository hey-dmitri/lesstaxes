/**
 * Writes a dataset file, and REFUSES to silently change one that has shipped.
 *
 * PROJECT.md §9.2 says a released dataset is immutable: share links carry a
 * version, and anyone reopening an old link must get the numbers they were
 * shown. Nothing enforced that. The build scripts default to whatever version
 * engine/datasets.ts currently names, so running one before cutting a new
 * release quietly rewrites the shipped one — same filename, different answers,
 * no warning.
 *
 * That is not hypothetical. It happened while eight states were being checked
 * for head of household: the tax build ran twice against 2026.23 before the
 * cut, and 2026.23 came out of it with head-of-household rules it had never
 * shipped with. It was caught only because a before-and-after comparison
 * against that version showed a suspicious zero difference everywhere.
 *
 * The rule: a file that git already tracks may only be rewritten with the same
 * bytes. Anything else needs a new version, which `cut-dataset-version.mjs`
 * makes. Set ALLOW_DATASET_REWRITE=1 to override, which is for fixing a
 * release that has not left the machine yet and nothing else.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { relative } from 'node:path';

const REPO_ROOT = process.cwd();

/** True when git has this path in the index — i.e. it is part of a release. */
function isTracked(path) {
  try {
    const out = execFileSync('git', ['ls-files', '--error-unmatch', '--', path], {
      cwd: REPO_ROOT,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return out.toString().trim().length > 0;
  } catch {
    // Not tracked, or not a git checkout at all. Either way, nothing to protect.
    return false;
  }
}

/** The bytes git holds for this path, or null if it cannot be read. */
function committedContents(path) {
  try {
    return execFileSync('git', ['show', `HEAD:./${relative(REPO_ROOT, path)}`], {
      cwd: REPO_ROOT,
      stdio: ['ignore', 'pipe', 'ignore'],
      maxBuffer: 256 * 1024 * 1024,
    }).toString();
  } catch {
    return null;
  }
}

export function writeDataset(path, contents) {
  if (process.env.ALLOW_DATASET_REWRITE === '1' || !isTracked(path)) {
    writeFileSync(path, contents);
    return;
  }

  /*
   * Compare against the COMMITTED bytes, not the ones on disk. Comparing to
   * disk would happily accept a file an earlier run in the same session had
   * already corrupted, which is precisely the case this guard exists for.
   */
  const shipped = committedContents(path) ?? readFileSync(path, 'utf8');
  if (shipped === contents) {
    writeFileSync(path, contents);
    return;
  }

  throw new Error(
    `${relative(REPO_ROOT, path)} has already shipped and this build would change it.\n` +
      `A released dataset is immutable — share links pinned to it must keep resolving\n` +
      `to the numbers they were created with.\n\n` +
      `Cut a new release first:\n` +
      `  node scripts/cut-dataset-version.mjs\n` +
      `  DATASET_VERSION=<new> node scripts/build-all.mjs`,
  );
}
