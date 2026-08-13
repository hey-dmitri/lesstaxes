import { formatPercent, scheduleFor, stateRules, type FilingStatus } from '@/engine';

/**
 * The short state-tax label the redesign puts above each city — "IL · 4.95%
 * flat", "TX · no income tax".
 *
 * It is the single fact that most often drives the whole comparison, and it is
 * knowable before any number is entered, so it belongs at the top of the column
 * rather than buried in the breakdown.
 */
export function stateTaxBadge(stateCode: string, filingStatus: FilingStatus): string {
  const rules = stateRules(stateCode);
  if (!rules.hasWageIncomeTax) return 'no income tax';

  // States publish single and joint schedules only, so this maps the other
  // two statuses the same way the engine does rather than indexing blindly.
  const brackets = rules.brackets?.[scheduleFor(filingStatus)] ?? [];
  if (brackets.length === 0) return 'income tax';
  if (brackets.length === 1) return `${formatPercent(brackets[0].rate, 2)} flat`;

  const top = brackets[brackets.length - 1].rate;
  return `up to ${formatPercent(top, 2)}`;
}
