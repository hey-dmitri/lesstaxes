/**
 * Flattened dataset rows for the public /data browser.
 *
 * One row per selectable location, carrying every figure the calculator will
 * use for it. This is the product's credibility argument made inspectable:
 * anyone can look up a city they know and check the numbers against their own
 * experience (PROJECT.md D26).
 */

import salesTax from '@/data/2026.1/sales-tax.json';
import states from '@/data/2026.1/states.json';
import { allMetros, housingDefaults, localTaxOptions, localJurisdiction, transportDefaults } from '@/engine';

export interface DatasetRow {
  id: string;
  label: string;
  detail: string;
  state: string;
  isRural: boolean;
  rent: number;
  homePrice: number;
  propertyTaxRate: number;
  vehiclesPerAdult: number;
  parityAll: number;
  parityHousing: number;
  parityGoods: number;
  parityUtilities: number;
  parityServices: number;
  hasStateIncomeTax: boolean;
  salesTaxRate: number;
  groceryTreatment: string;
  localTax: string | null;
  /** Lowercased haystack so filtering does no work per keystroke. */
  search: string;
}

const STATE_RULES = states.states as unknown as Record<string, { hasWageIncomeTax: boolean }>;
const SALES = salesTax.states as unknown as Record<
  string,
  { combinedRate: number; grocery: { treatment: string } }
>;

export const DATASET_ROWS: DatasetRow[] = allMetros().map((m) => {
  const housing = housingDefaults(m.id);
  const transport = transportDefaults(m.id);
  const sales = SALES[m.primaryState];
  const locals = localTaxOptions(m.id);

  return {
    id: m.id,
    label: m.shortName,
    detail: m.type === 'restOfState' ? 'Rural fallback — statewide figures' : m.name,
    state: m.primaryState,
    isRural: m.type === 'restOfState',
    rent: housing.medianRentMonthly,
    homePrice: housing.medianHomePrice,
    propertyTaxRate: housing.effectivePropertyTaxRate,
    vehiclesPerAdult: transport.vehiclesPerAdult,
    parityAll: m.priceParity.allItems,
    parityHousing: m.priceParity.housing,
    parityGoods: m.priceParity.goods,
    parityUtilities: m.priceParity.utilities,
    parityServices: m.priceParity.otherServices,
    hasStateIncomeTax: Boolean(STATE_RULES[m.primaryState]?.hasWageIncomeTax),
    salesTaxRate: sales?.combinedRate ?? 0,
    groceryTreatment: sales?.grocery.treatment ?? 'n/a',
    localTax: locals.length
      ? locals.map((l) => localJurisdiction(l.jurisdictionId).name).join(' / ')
      : null,
    search: `${m.shortName} ${m.name} ${m.primaryState}`.toLowerCase(),
  };
});

export const DATASET_SOURCES = [
  {
    what: 'Metro definitions and counties',
    source: 'Census Bureau, Core Based Statistical Area delineation files (2023)',
    licence: 'Public domain',
  },
  {
    what: 'Price levels by category',
    source: 'Bureau of Economic Analysis, Regional Price Parities (2024)',
    licence: 'Public domain',
  },
  {
    what: 'Rent, home values, property tax paid',
    source: 'Census ACS 2024 5-year estimates (B25064, B25077, B25103)',
    licence: 'Public domain',
  },
  {
    what: 'Vehicles per household',
    source: 'Census ACS 2024 5-year estimates (B25044, B09021)',
    licence: 'Public domain',
  },
  {
    what: 'Household spending by income',
    source: 'BLS Consumer Expenditure Survey, Table 1203 (2024)',
    licence: 'Public domain',
  },
  {
    what: 'Federal tax rules',
    source: 'IRS Rev. Proc. 2025-32; 26 U.S.C. §164; SSA contribution base',
    licence: 'Public domain',
  },
  {
    what: 'State income tax rules',
    source: 'Tax Foundation (2026), compiled from state statutes',
    licence: 'CC BY-NC 4.0',
  },
  {
    what: 'Sales tax rates',
    source: 'Tax Foundation (2026)',
    licence: 'CC BY-NC 4.0',
  },
  {
    what: 'Local income tax',
    source: 'New York City and Yonkers explicitly; state averages elsewhere',
    licence: 'Mixed',
  },
];
