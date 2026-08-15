/**
 * Defects found by an outside audit of 60ccf5b, each pinned here.
 *
 * Every one of them was invisible to the existing tests, and four of the five
 * shared a shape: a value that was computed correctly and then not carried to
 * the place that needed it.
 */

import { describe, expect, it } from 'vitest';

import { computeStateTax } from './state';
import { stateRules } from './rules';
import { computeLocalTax } from './local';
import { localJurisdiction } from '../dataset';

const couple = (earners: number, grossSalary = 150_000) => ({
  filingStatus: 'marriedJointly' as const,
  children: 0,
  earners,
  grossSalary,
});

/**
 * THE FORM ASKS HOW MANY OF YOU WORK, AND THE STATE STEP NEVER HEARD THE
 * ANSWER. FICA used it and the payroll contributions used it; computeStateTax
 * was never passed it, so every joint return defaulted to two earners.
 *
 * That handed a single-earner couple the split-return treatment only a
 * two-earner couple qualifies for — six states of it — and a second
 * Massachusetts payroll deduction for a spouse with no payroll.
 */
describe('a couple with one earner', () => {
  it.each([
    ['DC', 1_556],
    ['DE', 1_016.5],
    ['MS', 400],
    ['AR', 367.2],
    ['OH', 180.43],
    ['MO', 180.63],
  ])('%s does not give a sole earner the split-return saving', (code, expected) => {
    const rules = stateRules(code);
    const gap = computeStateTax(couple(1), rules).tax - computeStateTax(couple(2), rules).tax;
    expect(gap).toBeCloseTo(expected, 1);
  });

  it('allows Massachusetts one payroll deduction per working spouse', () => {
    const ma = stateRules('MA');
    const at = (earners: number) =>
      computeStateTax({ ...couple(earners), payrollTaxPaid: 11_475 }, ma).tax;
    // $2,000 each at 5%.
    expect(at(1) - at(2)).toBeCloseTo(2_000 * 0.05, 2);
  });
});

/**
 * Connecticut prints its 2% phase-out add-back and its recapture as two
 * separate lines that both feed the tax. The engine assigned each one straight
 * into the running total instead of adding, so the second silently replaced
 * the first.
 */
describe('Connecticut add-backs stack', () => {
  it('applies both, not just the later one', () => {
    const ct = stateRules('CT');
    const single = { grossSalary: 150_000, filingStatus: 'single' as const, children: 0 };
    expect(computeStateTax(single, ct).tax).toBeCloseTo(8_225, 0);

    // Removing one add-back must move the answer; if the later replaced the
    // earlier, dropping the earlier would change nothing.
    const withoutFirst = computeStateTax(single, { ...ct, taxAddBacks: [ct.taxAddBacks[1]] }).tax;
    expect(computeStateTax(single, ct).tax - withoutFirst).toBeCloseTo(250, 0);
  });
});

/**
 * A separate return gets half the household's mortgage and, until now, the
 * whole state debt limit — which handed the couple an effective $2,000,000
 * California ceiling between them. California's own instructions halve it.
 */
describe('married filing separately', () => {
  it('halves the state mortgage debt limit', () => {
    const ca = stateRules('CA');
    const at = (mortgageDebt: number) =>
      computeStateTax(
        {
          grossSalary: 300_000,
          filingStatus: 'marriedSeparately',
          children: 0,
          propertyTax: 10_000,
          mortgageInterest: 30_000,
          mortgageDebt,
          itemisedFederally: true,
        },
        ca,
      ).deductions;

    // At the $500,000 separate limit the whole interest survives; at double
    // the debt, only half of it does.
    expect(at(500_000)).toBeGreaterThan(at(1_000_000));
    expect(at(1_000_000)).toBeCloseTo(at(500_000) - 15_000, 0);
  });
});

/**
 * The federal earned income credit is claimed once on one federal return, and
 * a state match is a share of that one figure. Spreading the inputs across
 * both halves of a combined-separate return copied it into each, so Missouri
 * applied its 20% match twice.
 */
describe('a combined separate return', () => {
  it('counts the federal earned income credit once', () => {
    const mo = stateRules('MO');
    const at = (federalEarnedIncomeCredit: number) =>
      computeStateTax(
        {
          grossSalary: 59_370,
          filingStatus: 'marriedJointly',
          children: 3,
          earners: 2,
          federalEarnedIncomeCredit,
        },
        mo,
      ).tax;

    // Missouri matches 20%, once.
    expect(at(0) - at(2_290)).toBeCloseTo(2_290 * 0.2, 0);
  });
});

/**
 * New York City's schedule applies to New York TAXABLE income — Form IT-201
 * carries line 47, already net of the state's deduction and exemptions. The
 * bracketed local path rebuilt a base from gross wages instead, and the city's
 * own deduction is zero, so it taxed the whole paycheque.
 */
describe('New York City', () => {
  it('taxes New York taxable income, not gross wages', () => {
    const nyc = localJurisdiction('nyc');
    const single = { grossSalary: 150_000, filingStatus: 'single' as const, children: 0 };
    const stateTaxable = computeStateTax(single, stateRules('NY')).taxableIncome;

    const onGross = computeLocalTax({ ...single, stateTax: 0 }, nyc).tax;
    const onTaxable = computeLocalTax(
      { ...single, stateTax: 0, stateTaxableIncome: stateTaxable },
      nyc,
    ).tax;

    expect(onTaxable).toBeLessThan(onGross);
    expect(onTaxable).toBeCloseTo(5_379.09, 1);
  });

  it('carries the head-of-household schedule the city publishes', () => {
    const nyc = localJurisdiction('nyc');
    expect(nyc.kind === 'bracketed' && nyc.brackets.headOfHousehold?.map((b) => b.from)).toEqual([
      0, 14_400, 30_000, 60_000,
    ]);
  });
});
