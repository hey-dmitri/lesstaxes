/**
 * LessTaxes calculation engine — public API.
 *
 * Plain TypeScript, no framework dependencies. Imported by the interface, by
 * the tests, and by the link-preview image function. See engine/README.md.
 */

export * from './types';

export {
  compare,
  computeCity,
  defaultCityInputs,
  defaultRent,
  breakEvenSalary,
  quickCompare,
} from './compare';

export {
  ALL_METRO_IDS,
  ALL_SPENDING_PROFILES,
  DATASET_VERSION,
  INCOME_RENT_CURVE,
  allMetros,
  bedroomsFor,
  defaultLocalJurisdictions,
  housingDefaults,
  rentDefault,
  rentFactorForIncome,
  localJurisdiction,
  localTaxOptions,
  metro,
  salesTaxRules,
  spendingProfile,
  transportDefaults,
  type Metro,
  type PriceParity,
  type SpendingProfile,
} from './dataset';

export { computeHousing, firstYearInterest, monthlyMortgagePayment } from './housing';
export { computeLiving, computeSalesTax, computeTransport, defaultCarCount } from './living';

export { formatPercent, formatUSD, monthly, toDollars } from './money';

export {
  breakEvenNarrative,
  breakEvenReference,
  breakEvenSentence,
  percentIsMeaningful,
  shortfalls,
  whyClause,
  whyNarrative,
  whySentence,
  type BreakEvenNarrative,
  type Shortfall,
  type WhyNarrative,
} from './narrative';

export { applyBrackets, effectiveRate, marginalRate, type Bracket } from './tax/brackets';
export { computeFederal } from './tax/federal';
export { computeFica } from './tax/fica';
export { computeLocalTax } from './tax/local';
export { computeStateTax, adultsIn, scheduleFor } from './tax/state';
export {
  ALL_FILING_STATUSES,
  ALL_STATE_CODES,
  NO_WAGE_TAX_STATES,
  STATE_LIMITATIONS,
  stateRules,
  TAX_YEAR,
} from './tax/rules';
