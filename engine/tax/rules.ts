/**
 * Typed access to the committed tax rules dataset.
 *
 * This is the ONLY place the engine reaches into `data/`. Everything else
 * takes rules as a parameter, so the engine stays testable against synthetic
 * schedules and a future dataset version is a one-line change here.
 */

import federal2026 from '../../data/2026.1/federal.json';
import states2026 from '../../data/2026.1/states.json';
import type { FilingStatus, USD } from '../types';
import type { Bracket } from './brackets';
import type { FederalRules } from './federal';
import type { FicaRules } from './fica';
import type { StateTaxRules } from './state';

export const FEDERAL_RULES_2026: FederalRules = {
  brackets: federal2026.brackets as Record<FilingStatus, Bracket[]>,
  standardDeduction: federal2026.standardDeduction,
  saltCap: federal2026.saltCap,
  childTaxCredit: federal2026.childTaxCredit,
};

export const FICA_RULES_2026: FicaRules = federal2026.fica;

/**
 * Cumulative tax at each bracket floor, transcribed verbatim from the IRS
 * rate tables. Our arithmetic must reproduce these exactly — see
 * federal.test.ts.
 */
export const IRS_GOLDEN_VALUES: Record<
  FilingStatus,
  ReadonlyArray<{ taxableIncome: USD; tax: USD }>
> = {
  single: federal2026.goldenValues.single,
  marriedJointly: federal2026.goldenValues.marriedJointly,
  marriedSeparately: federal2026.goldenValues.marriedSeparately,
  headOfHousehold: federal2026.goldenValues.headOfHousehold,
};

export const TAX_YEAR = federal2026.taxYear;
export const DATASET_VERSION = federal2026.datasetVersion;

export const ALL_FILING_STATUSES: readonly FilingStatus[] = [
  'single',
  'marriedJointly',
  'marriedSeparately',
  'headOfHousehold',
];

// ---------------------------------------------------------------------------
// State rules
// ---------------------------------------------------------------------------

export const STATE_RULES_2026 = states2026.states as unknown as Record<string, StateTaxRules>;

export const ALL_STATE_CODES: readonly string[] = Object.keys(STATE_RULES_2026).sort();

/** The nine states that levy no tax on wage income. */
export const NO_WAGE_TAX_STATES: readonly string[] = ALL_STATE_CODES.filter(
  (code) => !STATE_RULES_2026[code].hasWageIncomeTax,
);

export function stateRules(code: string): StateTaxRules {
  const rules = STATE_RULES_2026[code];
  if (!rules) throw new Error(`unknown state code: ${code}`);
  return rules;
}

/** Known modelling limitations, surfaced on the methodology page. */
export const STATE_LIMITATIONS: readonly string[] = states2026.limitations;
export const STATE_SOURCE = states2026.source;
