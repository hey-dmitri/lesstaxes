/**
 * The release a fresh visit computes with, and the ONLY one bundled eagerly.
 *
 * It lives in its own module so that cutting a release is a whole-file rewrite
 * of nine lines rather than a surgical edit inside a registry — see
 * scripts/cut-dataset-version.mjs, which regenerates this from a template.
 *
 * Everything else — 28 older releases and counting — is behind a dynamic import
 * in ./datasets. Static imports of all of them put 14.7MB of JSON in every
 * bundle and parsed it on every cold start, to answer a question that only ever
 * needs one release at a time.
 */

import federal202629 from '../data/2026.29/federal.json';
import housing202629 from '../data/2026.29/housing.json';
import localTax202629 from '../data/2026.29/local-income-tax.json';
import metros202629 from '../data/2026.29/metros.json';
import salesTax202629 from '../data/2026.29/sales-tax.json';
import spending202629 from '../data/2026.29/spending.json';
import states202629 from '../data/2026.29/states.json';
import transport202629 from '../data/2026.29/transport.json';

/**
 * What a fresh visit computes with. Bumping this is the ONLY edit a new dataset
 * release needs on the engine side — everything downstream reads it from here,
 * which is what the two hardcoded boundary modules failed to provide.
 */
export const CURRENT_DATASET_VERSION = '2026.29';

/* eslint-disable @typescript-eslint/no-explicit-any */

export const CURRENT_BUNDLE = {
  version: CURRENT_DATASET_VERSION,
  federal: federal202629 as any,
  housing: housing202629 as any,
  localTax: localTax202629 as any,
  metros: metros202629 as any,
  salesTax: salesTax202629 as any,
  spending: spending202629 as any,
  states: states202629 as any,
  transport: transport202629 as any,
};
