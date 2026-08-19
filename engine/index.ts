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
  differenceRows,
  housingAtSalary,
  housingIsPrefill,
  housingLabel,
  breakEvenSalary,
  quickCompare,
  type DifferenceRow,
  type DifferenceRows,
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
  defaultMortgageRate,
  defaultSalaryFor,
  medianEarnings,
  mortgageRateSource,
  housingDefaults,
  homePriceDefault,
  homeValueCurve,
  homeValueFactorForIncome,
  incomeRentCurve,
  rentDefault,
  rentFactorForIncome,
  taxableShares,
  utilitiesAreSplitOut,
  localJurisdiction,
  allLocalJurisdictions,
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

export { formatPercent, formatUSD, formatUSDShort, monthly, toDollars } from './money';

export {
  biggestReason,
  breakEvenNarrative,
  breakEvenReference,
  breakEvenSentence,
  changeInWords,
  cityName,
  federalMovedReason,
  percentIsMeaningful,
  shortfalls,
  whyClause,
  whyClauseParts,
  whyNarrative,
  whySentence,
  verdict,
  TOO_CLOSE_SHARE,
  TOO_CLOSE_FLOOR,
  type BreakEvenNarrative,
  type ChangeInWords,
  type Shortfall,
  type Verdict,
  type WhyClause,
  type WhyNarrative,
} from './narrative';

export { applyBrackets, effectiveRate, marginalRate, type Bracket } from './tax/brackets';
export { computeFederal } from './tax/federal';
export { computeFica } from './tax/fica';
export { computeLocalTax } from './tax/local';
export { computeStateTax, adultsIn, scheduleFor } from './tax/state';
export { taxReturnsFor, type TaxReturnShare } from './tax/returns';
export { priceFactor, priceLevel, toBaseYearIncome, type PriceLevel } from './dataset';
export { federalRules, ficaRules } from './tax/rules';
export {
  ALL_FILING_STATUSES,
  ALL_STATE_CODES,
  NO_WAGE_TAX_STATES,
  STATE_LIMITATIONS,
  stateRules,
  TAX_YEAR,
} from './tax/rules';
