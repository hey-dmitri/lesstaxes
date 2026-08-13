/**
 * Re-downloads the upstream sources into data/<version>/sources/.
 *
 *   node scripts/refresh-sources.mjs
 *
 * Run by the quarterly GitHub Action, or by hand. It only touches the source
 * snapshots — run build-all.mjs afterwards to regenerate the datasets.
 *
 * WHAT IT CAN AND CANNOT REFRESH
 *
 * Sources published as CSV, JSON or HTML are fetched automatically. Two are
 * published only as .xlsx, and converting spreadsheets would mean adding a
 * dependency to a project that currently has none for this purpose — so those
 * are CHECKED but not replaced. When one changes, this script says so loudly
 * and tells you exactly what to do, rather than pretending the dataset is
 * fully current when part of it is not.
 *
 * Nothing here writes a dataset. A refresh that produced bad numbers silently
 * would be far worse than one that failed.
 */

import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { extractFromZip } from './lib/zip.mjs';
import { CURRENT_DATASET_VERSION } from './lib/version.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
/** Overridable so a new dated release can be built without editing every script. */
const VERSION = process.env.DATASET_VERSION || CURRENT_DATASET_VERSION;
const SRC = resolve(HERE, '..', 'data', VERSION, 'sources');

const BROWSER_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36';

/** BLS blocks automated requests whose User-Agent carries no contact address. */
const contact = process.env.DATA_CONTACT_EMAIL;
const BLS_UA = `PackOrStay/0.1 (personal cost-of-living project; ${contact ?? 'no contact set'})`;

const sha = (buffer) => createHash('sha256').update(buffer).digest('hex').slice(0, 12);

async function download(url, { userAgent = BROWSER_UA } = {}) {
  const response = await fetch(url, { headers: { 'User-Agent': userAgent } });
  if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
  return Buffer.from(await response.arrayBuffer());
}

/** Sources fetched and written in place. */
const REFRESHABLE = [
  {
    file: 'bea-rpp-metro-2024.csv',
    label: 'BEA Regional Price Parities (metro)',
    url: 'https://apps.bea.gov/regional/zip/MARPP.zip',
    transform: (buffer) => extractFromZip(buffer, (n) => /^MARPP_MSA_.*\.csv$/.test(n)),
  },
  {
    file: 'bea-rpp-state-2024.csv',
    label: 'BEA Regional Price Parities (state)',
    url: 'https://apps.bea.gov/regional/zip/SARPP.zip',
    transform: (buffer) => extractFromZip(buffer, (n) => /^SARPP_STATE_.*\.csv$/.test(n)),
  },
  {
    file: 'taxfoundation-state-income-tax-2026.html',
    label: 'Tax Foundation state income tax tables',
    url: 'https://taxfoundation.org/data/all/state/state-income-tax-rates-2026/',
    transform: (buffer) => buffer,
    // The page carries rotating markup around the table, so a byte diff is
    // noisy. The build script's own validation is the real gate.
    noisy: true,
  },
];

/**
 * Sources published only as spreadsheets. Checked for change, never replaced.
 * Each carries the exact instruction for updating it by hand.
 */
const MANUAL = [
  {
    file: 'census-cbsa-delineation-2023.csv',
    label: 'Census CBSA delineation',
    url: 'https://www2.census.gov/programs-surveys/metro-micro/geographies/reference-files/2023/delineation-files/list1_2023.xlsx',
    instruction:
      'OMB has published new metro delineations. Download list1_<year>.xlsx, export the sheet to CSV with the header row from row 3, and replace this file.',
  },
  {
    file: 'bls-ces-table1203-2024.csv',
    label: 'BLS Consumer Expenditure Survey, Table 1203',
    url: 'https://www.bls.gov/cex/tables/calendar-year/mean-item-share-average-standard-error/cu-income-before-taxes-2024.xlsx',
    userAgent: BLS_UA,
    instruction:
      'BLS has published a newer Consumer Expenditure table. Download the .xlsx for the new year, extract the labelled rows this CSV contains, and replace it.',
  },
];

// ---------------------------------------------------------------------------

const changed = [];
const unchanged = [];
const needsAttention = [];
const failures = [];

console.log(`Refreshing sources in data/${VERSION}/sources/\n`);

for (const source of REFRESHABLE) {
  const path = resolve(SRC, source.file);
  try {
    const raw = await download(source.url, { userAgent: source.userAgent });
    const next = source.transform(raw);
    const previous = existsSync(path) ? readFileSync(path) : null;

    if (previous && previous.equals(next)) {
      unchanged.push(source.label);
      console.log(`  = ${source.label}`);
      continue;
    }

    writeFileSync(path, next);
    const note = source.noisy ? ' (markup changes are often cosmetic)' : '';
    changed.push(`${source.label}${note}`);
    console.log(
      `  ~ ${source.label} — ${previous ? `${sha(previous)} -> ` : ''}${sha(next)}${note}`,
    );
  } catch (error) {
    failures.push(`${source.label}: ${error.message}`);
    console.log(`  ! ${source.label} — ${error.message}`);
  }
}

for (const source of MANUAL) {
  try {
    const upstream = await download(source.url, { userAgent: source.userAgent });
    const marker = resolve(SRC, `.${source.file}.upstream-sha`);
    const current = sha(upstream);
    const recorded = existsSync(marker) ? readFileSync(marker, 'utf8').trim() : null;

    if (recorded === null) {
      writeFileSync(marker, `${current}\n`);
      console.log(`  + ${source.label} — recorded baseline ${current}`);
      continue;
    }
    if (recorded === current) {
      unchanged.push(source.label);
      console.log(`  = ${source.label}`);
      continue;
    }

    writeFileSync(marker, `${current}\n`);
    needsAttention.push(`**${source.label}** — ${source.instruction}\n  Source: ${source.url}`);
    console.log(`  ! ${source.label} CHANGED upstream (${recorded} -> ${current}) — needs a human`);
  } catch (error) {
    failures.push(`${source.label}: ${error.message}`);
    console.log(`  ! ${source.label} — could not check: ${error.message}`);
  }
}

// ---------------------------------------------------------------------------

console.log(
  `\n  ${changed.length} refreshed, ${unchanged.length} unchanged, ` +
    `${needsAttention.length} need a human, ${failures.length} failed`,
);

// A summary the workflow turns into the pull request body.
const summary = [
  changed.length ? `### Refreshed\n${changed.map((c) => `- ${c}`).join('\n')}` : '',
  needsAttention.length
    ? `### Needs a human\nThese are published only as spreadsheets, so they were checked but not replaced.\n\n${needsAttention.map((n) => `- ${n}`).join('\n')}`
    : '',
  failures.length ? `### Could not be checked\n${failures.map((f) => `- ${f}`).join('\n')}` : '',
  unchanged.length ? `### Unchanged\n${unchanged.map((u) => `- ${u}`).join('\n')}` : '',
]
  .filter(Boolean)
  .join('\n\n');

writeFileSync(resolve(HERE, '..', '.refresh-summary.md'), `${summary}\n`);

// Only a hard failure stops the run. A source needing manual attention is
// information for the pull request, not a reason to abort the rest.
if (failures.length && !changed.length && !needsAttention.length) {
  console.error('\nEvery source failed — treating this as an error.');
  process.exit(1);
}
