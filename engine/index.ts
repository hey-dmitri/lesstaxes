/**
 * Pack or Stay calculation engine — public API.
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
  housingAtSalary,
  housingIsPrefill,
  breakEvenSalary,
  quickCompare,
} from './compare';

export {
  ALL_DATASET_VERSIONS,
  CURRENT_DATASET_VERSION,
  datasetBundle,
  isKnownDatasetVersion,
  type DatasetBundle,
} from './datasets';

export {
  ALL_METRO_IDS,
  ALL_SPENDING_PROFILES,
  DATASET_VERSION,
  INCOME_RENT_CURVE,
  allMetros,
  bedroomsFor,
  defaultLocalJurisdictions,
  housingDefaults,
  homePriceDefault,
  homeValueCurve,
  homeValueFactorForIncome,
  incomeRentCurve,
  rentDefault,
  rentFactorForIncome,
  taxableShares,
  localJurisdiction,
  isMultiState,
  localTaxOptions,
  resolveLocalJurisdictions,
  resolveStateCode,
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
  biggestReason,
  breakEvenNarrative,
  breakEvenReference,
  breakEvenSentence,
  federalMovedReason,
  percentIsMeaningful,
  shortfalls,
  whyClause,
  whyNarrative,
  whySentence,
  verdict,
  TOO_CLOSE_SHARE,
  type BreakEvenNarrative,
  type Shortfall,
  type Verdict,
  type WhyNarrative,
} from './narrative';

export { applyBrackets, effectiveRate, marginalRate, type Bracket } from './tax/brackets';
export { computeFederal } from './tax/federal';
export { computeFica } from './tax/fica';
export { computeLocalTax } from './tax/local';
export { computeStateTax, adultsIn, scheduleFor } from './tax/state';
export { taxReturnsFor, type TaxReturnShare } from './tax/returns';
export { federalRules, ficaRules } from './tax/rules';
export {
  ALL_FILING_STATUSES,
  ALL_STATE_CODES,
  NO_WAGE_TAX_STATES,
  STATE_LIMITATIONS,
  stateRules,
  TAX_YEAR,
} from './tax/rules';
