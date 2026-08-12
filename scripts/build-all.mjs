/**
 * Rebuilds every dataset, in dependency order.
 *
 *   node scripts/build-all.mjs
 *
 * Each script validates its own output and exits non-zero on anything
 * implausible, so a corrupt upstream file stops the run rather than quietly
 * producing wrong numbers. Order matters: metros.json defines the locations
 * everything else is keyed by.
 */

import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));

/** Passed through to the scripts that can fetch, e.g. --refresh. */
const FLAGS = process.argv.slice(2);

const STEPS = [
  ['build-state-tax-rules.mjs', '51 tax jurisdictions', []],
  ['build-metros.mjs', '438 locations and price parities', []],
  ['build-housing-transport.mjs', 'rent, home prices, property tax, vehicles', FLAGS],
  ['build-spending.mjs', 'household spending by income', []],
  ['build-sales-tax.mjs', 'sales tax and grocery treatment', []],
  ['build-local-income-tax.mjs', 'local income tax jurisdictions', []],
];

for (const [script, description, flags] of STEPS) {
  console.log(`\n=== ${script} — ${description} ===`);
  execFileSync(process.execPath, [resolve(HERE, script), ...flags], { stdio: 'inherit' });
}

console.log('\nAll datasets rebuilt.');
