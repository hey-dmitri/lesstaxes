/**
 * Flattened dataset rows for the public /data browser.
 *
 * One row per selectable location, carrying every figure the calculator will
 * use for it. This is the product's credibility argument made inspectable:
 * anyone can look up a city they know and check the numbers against their own
 * experience (PROJECT.md D26).
 */

/*
 * Everything here reads through the engine's accessors rather than importing a
 * dataset directory by name. Two of these imports were pinned to 2026.3 while
 * the engine had moved to 2026.4: the values happened to match, so the page was
 * telling the truth by luck, and the next refresh that changed a sales-tax rate
 * would have had the browser quietly disagreeing with the calculator it exists
 * to explain. A version number should appear in exactly one place.
 */
import {
  allMetros,
  housingDefaults,
  localTaxOptions,
  localJurisdiction,
  salesTaxRules,
  stateRules,
  transportDefaults,
} from '@/engine';

export interface DatasetRow {
  /** Unique per ROW, which for a split metro means one id per state part. */
  id: string;
  label: string;
  detail: string;
  /** The state this row's tax figures are for. */
  state: string;
  /** Every state the metro touches. More than one for 43 of them. */
  states: string[];
  /**
   * True when this row is one state's slice of a metro that crosses a line.
   *
   * The page claims to show every number the calculator uses, and for those 43
   * metros it was showing only the primary state's — so a reader checking
   * Newark saw New York's sales tax and New York City's local tax, which is
   * precisely the combination the calculator was just fixed to stop applying.
   */
  isStatePart: boolean;
  isRural: boolean;
  /** Metro-wide median across all unit sizes — the raw published figure. */
  rent: number;
  /** Local median for a one-bedroom and a three-bedroom, before income scaling. */
  rent1br: number;
  rent3br: number;
  homePrice: number;
  /** Whose households the local medians describe — the anchor for both curves. */
  ownerIncome: number;
  renterIncome: number;
  propertyTaxRate: number;
  vehiclesPerAdult: number;
  parityAll: number;
  parityHousing: number;
  parityGoods: number;
  parityUtilities: number;
  parityServices: number;
  hasStateIncomeTax: boolean;
  /**
   * When this state's tax figures were last read off the state's own 2026
   * publication, or null if nobody has done that and they rest on the
   * aggregated table alone.
   *
   * This page exists to let a reader check our numbers against a place they
   * know. Telling them WHERE a number came from is most of that, and "a
   * reputable annual table published in February" and "the state's own
   * schedule, read in August" are not the same provenance.
   */
  taxChecked: string | null;
  taxCheckedUrl: string | null;
  salesTaxRate: number;
  groceryTreatment: string;
  localTax: string | null;
  /** Lowercased haystack so filtering does no work per keystroke. */
  search: string;
}

/*
 * One row per state part, not per metro.
 *
 * THE HOUSING LOOKUPS BELONG INSIDE THE LOOP. They used to sit above it, called
 * without a state code, so both halves of a split metro showed the same
 * metro-wide figures — rent $1,830 and home $614,200 on the New Jersey row and
 * the New York row alike, when the committed data has $512,300 against
 * $684,700. The calculator had been reading the state slice correctly since
 * 2026.5; only this page had not caught up.
 *
 * That matters more here than almost anywhere, because this page says of itself
 * that it shows every number the calculator uses. A page that says that and
 * then shows a different number is worse than no page.
 */
export const DATASET_ROWS: DatasetRow[] = allMetros().flatMap((m) => {
  const split = m.states.length > 1;

  return m.states.map((state): DatasetRow => {
    // Narrowed to this state's part of the metro, exactly as the engine does.
    const housing = housingDefaults(m.id, undefined, state);
    const transport = transportDefaults(m.id, undefined, state);
    const sales = salesTaxRules(state);
    const locals = localTaxOptions(m.id, undefined, state);

    return {
      id: split ? `${m.id}:${state}` : m.id,
      label: m.shortName,
      detail:
        m.type === 'restOfState'
          ? 'Rural fallback — statewide figures'
          : split
            ? `${m.name} — the ${state} part. Housing and tax are ${state}'s; price levels are metro-wide.`
            : m.name,
      state,
      states: m.states,
      isStatePart: split,
      isRural: m.type === 'restOfState',
      rent: housing.medianRentMonthly,
      rent1br: housing.rentByBedrooms[1],
      rent3br: housing.rentByBedrooms[3],
      homePrice: housing.medianHomePrice,
      ownerIncome: housing.medianOwnerIncome ?? 0,
      renterIncome: housing.medianRenterIncome ?? 0,
      propertyTaxRate: housing.effectivePropertyTaxRate,
      vehiclesPerAdult: transport.vehiclesPerAdult,
      parityAll: m.priceParity.allItems,
      parityHousing: m.priceParity.housing,
      parityGoods: m.priceParity.goods,
      parityUtilities: m.priceParity.utilities,
      parityServices: m.priceParity.otherServices,
      hasStateIncomeTax: stateRules(state).hasWageIncomeTax,
      taxChecked: stateRules(state).ratesCheckedAgainstState?.checked ?? null,
      taxCheckedUrl: stateRules(state).ratesCheckedAgainstState?.url ?? null,
      salesTaxRate: sales.combinedRate,
      groceryTreatment: sales.grocery.treatment,
      localTax: locals.length
        ? locals.map((l) => localJurisdiction(l.jurisdictionId).name).join(' / ')
        : null,
      search: `${m.shortName} ${m.name} ${state} ${m.states.join(' ')}`.toLowerCase(),
    };
  });
});

/**
 * What kind of number a figure actually is.
 *
 * The site said "every figure is a local median" in several places and that was
 * simply false. Housing figures are medians; BLS spending and vehicle counts
 * are population MEANS, which behave quite differently in a skewed
 * distribution; price parities are index numbers, not dollars; several tax
 * lines are statewide averages or modelled shares rather than anything anyone
 * is charged. A reader checking a figure against their own life needs to know
 * which of those they are looking at, so every row now says.
 */
export type FigureKind =
  | 'Local median'
  | 'National median'
  | 'Local average'
  | 'National average'
  | 'Index'
  | 'Statutory rate'
  | 'State average'
  | 'Definition';

export const DATASET_SOURCES: Array<{
  what: string;
  kind: FigureKind;
  source: string;
  licence: string;
}> = [
  {
    what: 'Metro definitions and counties',
    kind: 'Definition',
    source: 'Census Bureau, Core Based Statistical Area delineation files (2023)',
    licence: 'Public domain',
  },
  {
    what: 'Price levels by category',
    kind: 'Index',
    source: 'Bureau of Economic Analysis, Regional Price Parities (2024)',
    licence: 'Public domain',
  },
  {
    what: 'Rent, home values, property tax paid',
    kind: 'Local median',
    source: 'Census ACS 2024 5-year estimates (B25064, B25077, B25103)',
    licence: 'Public domain',
  },
  {
    what: 'Rent by unit size',
    kind: 'Local median',
    source: 'Census ACS 2024 5-year estimates (B25031)',
    licence: 'Public domain',
  },
  {
    what: 'How rent scales with income',
    kind: 'National median',
    source: 'Census ACS 2024 5-year estimates (B25074), national',
    licence: 'Public domain',
  },
  {
    what: 'How home price scales with income',
    kind: 'National median',
    source: 'Census ACS 2024 5-year estimates (B25121), national',
    licence: 'Public domain',
  },
  {
    what: 'Median income of owners and renters',
    kind: 'Local median',
    source: 'Census ACS 2024 5-year estimates (B25119)',
    licence: 'Public domain',
  },
  {
    what: 'Vehicles per household',
    kind: 'Local average',
    source: 'Census ACS 2024 5-year estimates (B25044, B09021)',
    licence: 'Public domain',
  },
  {
    what: 'Household spending by income',
    kind: 'National average',
    source: 'BLS Consumer Expenditure Survey, Table 1203 (2024) — population means',
    licence: 'Public domain',
  },
  {
    what: 'Cost of running a car',
    kind: 'National average',
    source: 'BLS Consumer Expenditure Survey, scaled by the local goods price parity',
    licence: 'Public domain',
  },
  {
    what: 'Federal tax rules',
    kind: 'Statutory rate',
    source: 'IRS Rev. Proc. 2025-32; 26 U.S.C. §164; SSA contribution base',
    licence: 'Public domain',
  },
  {
    what: 'State income tax rules',
    kind: 'Statutory rate',
    // The compilation is where these STARTED. Every one of the 42 taxing
    // jurisdictions has since been read off the state's own rate schedule,
    // withholding guide or statute, and 24 of them were wrong — which is the
    // whole reason that second pass exists. Saying only "Tax Foundation" here
    // undersells the sourcing and, worse, points a reader at the compilation
    // when the state's own document is what the figures now match.
    source:
      "Each state's own rate schedule, withholding guide or statute — every one of the 42 taxing jurisdictions, each with its date and document recorded below. First compiled from Tax Foundation (2026).",
    licence: 'Mixed — state publications public domain; Tax Foundation CC BY-NC 4.0',
  },
  {
    // Shipped and shown, but no longer used in the calculation: the spending
    // basket already includes the sales tax those households paid.
    what: 'Sales tax rates (reference only)',
    kind: 'State average',
    source: 'Tax Foundation (2026) — state rate plus the population-weighted local average',
    licence: 'CC BY-NC 4.0',
  },
  {
    what: 'Local income tax',
    kind: 'Statutory rate',
    source:
      "Thirteen named cities and every Indiana county from their own revenue departments; state averages elsewhere",
    licence: 'Mixed',
  },
  {
    what: 'State disability and paid family leave',
    kind: 'Statutory rate',
    source: 'Each state agency — CA EDD, NJ DOL, NY DFS, RI DLT, HI DLIR, WA ESD and the rest',
    licence: 'Public domain',
  },
  {
    // Every price on this site is restated into one year's money before it is
    // compared to anything else, and the reader deserves to see WHICH series
    // does the restating — they are different for houses, rents and everything
    // else, and using one where another belongs is a real error.
    what: 'Restating older prices in current money',
    kind: 'Index',
    source: 'BLS CPI-U for general prices and rents; S&P CoreLogic Case-Shiller for home prices',
    licence: 'Public domain (BLS); Case-Shiller index values as published',
  },
];
