import { formatPercent, scheduleFor, stateRules, type FilingStatus } from '@/engine';

/**
 * The state-tax line above each city.
 *
 * It said "GA · 4.99% flat", which names neither the tax nor who charges it —
 * 4.99% of what, and to whom? A reader who does not already know that states
 * levy their own income tax on top of the federal one has no way in, and that
 * tax is the single fact that most often decides the whole comparison. It is
 * also knowable before any number is entered, which is why it sits at the top
 * of the column rather than waiting in the breakdown.
 *
 * So it says what it is, in full: "Georgia income tax: 4.99% flat", "Texas
 * charges no income tax". Long enough to read, short enough for a card header.
 */
export function stateTaxBadge(stateCode: string, filingStatus: FilingStatus): string {
  const rules = stateRules(stateCode);
  const name = stateName(stateCode);

  if (!rules.hasWageIncomeTax) return `${name} charges no income tax`;

  // States publish single and joint schedules only, so this maps the other
  // two statuses the same way the engine does rather than indexing blindly.
  const brackets = rules.brackets?.[scheduleFor(filingStatus)] ?? [];
  if (brackets.length === 0) return `${name} charges income tax`;
  if (brackets.length === 1) {
    return `${name} income tax: ${formatPercent(brackets[0].rate, 2)} flat`;
  }

  const top = brackets[brackets.length - 1].rate;
  return `${name} income tax: up to ${formatPercent(top, 2)}`;
}

/**
 * A state's name in full.
 *
 * Written out, because the badge is a sentence now: "GA income tax" reads like
 * a form field where "Georgia income tax" reads like English. The two letters
 * are still beside the city name a line below, for anyone scanning.
 *
 * Falls back to the code, which is right for DC and would be a visible gap for
 * anywhere else — a test pins that every state the engine knows has a name
 * here, so a new entry cannot arrive unnamed.
 */
export function stateName(code: string): string {
  return STATE_NAMES[code] ?? code;
}

const STATE_NAMES: Record<string, string> = {
  AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California',
  CO: 'Colorado', CT: 'Connecticut', DE: 'Delaware', DC: 'DC', FL: 'Florida',
  GA: 'Georgia', HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois', IN: 'Indiana',
  IA: 'Iowa', KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana', ME: 'Maine',
  MD: 'Maryland', MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota',
  MS: 'Mississippi', MO: 'Missouri', MT: 'Montana', NE: 'Nebraska', NV: 'Nevada',
  NH: 'New Hampshire', NJ: 'New Jersey', NM: 'New Mexico', NY: 'New York',
  NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio', OK: 'Oklahoma',
  OR: 'Oregon', PA: 'Pennsylvania', RI: 'Rhode Island', SC: 'South Carolina',
  SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah', VT: 'Vermont',
  VA: 'Virginia', WA: 'Washington', WV: 'West Virginia', WI: 'Wisconsin',
  WY: 'Wyoming',
};
