/**
 * Typed access to the tax rules of a dataset version.
 *
 * Everything downstream takes rules as a parameter, so the engine stays
 * testable against synthetic schedules.
 *
 * This module used to import `data/2026.1` directly while engine/dataset.ts
 * imported `data/2026.2` — each claiming in its own header to be the only place
 * the engine reached into `data/`. Both now read through engine/datasets.ts,
 * which is the one place that is actually true of.
 */

import { datasetBundle } from '../datasets';
import type { FilingStatus, USD } from '../types';
import type { Bracket } from './brackets';
import type { EitcRules, FederalRules, MortgageInterestRules } from './federal';
import type { FicaRules } from './fica';
import type { StateTaxRules } from './state';

export function federalRules(version?: string): FederalRules {
  const federal = datasetBundle(version).federal;
  return {
    brackets: federal.brackets as Record<FilingStatus, Bracket[]>,
    standardDeduction: federal.standardDeduction,
    saltCap: federal.saltCap,
    childTaxCredit: federal.childTaxCredit,
    // Absent on releases cut before the EITC was modelled, and the engine
    // treats that as "no credit" so those links keep reproducing exactly what
    // they showed when they were shared.
    earnedIncomeCredit: (federal as { earnedIncomeCredit?: EitcRules }).earnedIncomeCredit,
    // Likewise absent before the acquisition debt limit was modelled, which the
    // engine reads as "no limit" — every dollar of interest deductible, as
    // those releases computed it.
    mortgageInterest: (federal as { mortgageInterest?: MortgageInterestRules }).mortgageInterest,
  };
}

export function ficaRules(version?: string): FicaRules {
  return datasetBundle(version).federal.fica as FicaRules;
}

export const FEDERAL_RULES_2026: FederalRules = federalRules();
export const FICA_RULES_2026: FicaRules = ficaRules();

/**
 * Cumulative tax at each bracket floor, transcribed verbatim from the IRS
 * rate tables. Our arithmetic must reproduce these exactly — see
 * federal.test.ts.
 */
export const IRS_GOLDEN_VALUES: Record<
  FilingStatus,
  ReadonlyArray<{ taxableIncome: USD; tax: USD }>
> = datasetBundle().federal.goldenValues;

export const TAX_YEAR = datasetBundle().federal.taxYear as number;

export const ALL_FILING_STATUSES: readonly FilingStatus[] = [
  'single',
  'marriedJointly',
  'marriedSeparately',
  'headOfHousehold',
];

// ---------------------------------------------------------------------------
// State rules
// ---------------------------------------------------------------------------

const allStateRules = (version?: string) =>
  datasetBundle(version).states.states as Record<string, StateTaxRules>;

export const STATE_RULES_2026 = allStateRules();

export const ALL_STATE_CODES: readonly string[] = Object.keys(STATE_RULES_2026).sort();

/** The nine states that levy no tax on wage income. */
export const NO_WAGE_TAX_STATES: readonly string[] = ALL_STATE_CODES.filter(
  (code) => !STATE_RULES_2026[code].hasWageIncomeTax,
);

export function stateRules(code: string, version?: string): StateTaxRules {
  const rules = allStateRules(version)[code];
  if (!rules) throw new Error(`unknown state code: ${code}`);
  return rules;
}

/** Known modelling limitations, surfaced on the methodology page. */
export const STATE_LIMITATIONS: readonly string[] = datasetBundle().states.limitations;
export const STATE_SOURCE = datasetBundle().states.source;
