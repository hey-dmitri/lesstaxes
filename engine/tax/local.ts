/**
 * Local (city and county) income tax.
 *
 * Only about ten states permit it, but where it exists it is large enough to
 * change a relocation decision — New York City alone adds roughly 3.9% on top
 * of New York State, which is the single biggest reason this app works at
 * metro rather than state level (PROJECT.md D1).
 *
 * Every real US local income tax fits one of three shapes:
 *
 *   bracketed       own progressive schedule on taxable income   (New York City)
 *   flatRate        flat percentage of wages                     (Philadelphia,
 *                                                                 Ohio cities,
 *                                                                 Maryland counties,
 *                                                                 Detroit)
 *   stateSurcharge  percentage of the STATE tax already computed (Yonkers)
 *
 * The surcharge form is why this runs after state tax and before federal:
 * it needs the state liability as an input, and its own output feeds SALT.
 */

import type { FilingStatus, Rate, USD } from '../types';
import { applyBrackets, type Bracket } from './brackets';
import type { PublishedStatus } from './state';
import { scheduleFor } from './state';

export interface BracketedLocalTax {
  kind: 'bracketed';
  id: string;
  name: string;
  stateCode: string;
  /*
   * Same shape as a state's, and same reason for the Partial: a locality may
   * publish a head-of-household schedule or may not, and requiring one would
   * force every caller to invent a schedule the locality does not have.
   */
  brackets: Partial<Record<PublishedStatus, Bracket[]>> &
    Record<'single' | 'marriedJointly', Bracket[]>;
  /** Deducted from gross before the brackets apply. Often zero. */
  standardDeduction?: Partial<Record<PublishedStatus, USD>> &
    Record<'single' | 'marriedJointly', USD>;
  exemptionPerDependent?: USD;
}

export interface FlatRateLocalTax {
  kind: 'flatRate';
  id: string;
  name: string;
  stateCode: string;
  /** Applied to gross wages. */
  rate: Rate;
}

export interface StateSurchargeLocalTax {
  kind: 'stateSurcharge';
  id: string;
  name: string;
  stateCode: string;
  /** Fraction of the state income tax liability. */
  rate: Rate;
}

export type LocalTaxRules =
  | BracketedLocalTax
  | FlatRateLocalTax
  | StateSurchargeLocalTax;

export interface LocalTaxInputs {
  grossSalary: USD;
  filingStatus: FilingStatus;
  children: number;
  /** State income tax already computed. Required by the surcharge form. */
  stateTax: USD;
}

export interface LocalTaxResult {
  jurisdictionId: string | null;
  name: string | null;
  taxableIncome: USD;
  tax: USD;
}

export const NO_LOCAL_TAX: LocalTaxResult = {
  jurisdictionId: null,
  name: null,
  taxableIncome: 0,
  tax: 0,
};

/**
 * Compute local income tax. Pass `null` for metros with no local income tax,
 * which is the overwhelming majority.
 */
export function computeLocalTax(
  inputs: LocalTaxInputs,
  rules: LocalTaxRules | null,
): LocalTaxResult {
  if (!rules) return NO_LOCAL_TAX;

  const gross = Math.max(0, inputs.grossSalary);
  const children = Math.max(0, inputs.children);

  switch (rules.kind) {
    case 'flatRate': {
      return {
        jurisdictionId: rules.id,
        name: rules.name,
        taxableIncome: gross,
        tax: gross * rules.rate,
      };
    }

    case 'stateSurcharge': {
      // Applies to the state liability, not to income.
      const tax = Math.max(0, inputs.stateTax) * rules.rate;
      return {
        jurisdictionId: rules.id,
        name: rules.name,
        taxableIncome: 0,
        tax,
      };
    }

    case 'bracketed': {
      /*
       * No locality here publishes a head-of-household schedule, so this asks
       * for one and falls back to the schedule the filer would otherwise be on.
       * New York City does publish one; when it is added, this picks it up
       * without further change.
       */
      const schedule = scheduleFor(inputs.filingStatus, {
        headOfHouseholdBasis: rules.brackets.headOfHousehold ? 'own' : 'single',
        brackets: rules.brackets,
      });
      const otherwise = schedule === 'marriedJointly' ? 'marriedJointly' : 'single';
      const deduction =
        rules.standardDeduction?.[schedule] ?? rules.standardDeduction?.[otherwise] ?? 0;
      const exemptions = (rules.exemptionPerDependent ?? 0) * children;

      const taxableIncome = Math.max(0, gross - deduction - exemptions);
      return {
        jurisdictionId: rules.id,
        name: rules.name,
        taxableIncome,
        tax: applyBrackets(
          taxableIncome,
          rules.brackets[schedule] ?? rules.brackets[otherwise],
        ),
      };
    }
  }
}
