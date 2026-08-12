import { describe, expect, it } from 'vitest';

import { computeFica } from './fica';
import { FICA_RULES_2026 as RULES } from './rules';

describe('computeFica', () => {
  it('applies 6.2% Social Security below the wage base', () => {
    const { socialSecurity } = computeFica(100_000, 'single', RULES);
    expect(socialSecurity).toBeCloseTo(6_200, 6);
  });

  it('caps Social Security at the 2026 wage base', () => {
    const atBase = computeFica(184_500, 'single', RULES);
    const wellOver = computeFica(1_000_000, 'single', RULES);

    expect(atBase.socialSecurity).toBeCloseTo(184_500 * 0.062, 6);
    expect(wellOver.socialSecurity).toBeCloseTo(atBase.socialSecurity, 6);
  });

  it('applies Medicare to all wages with no cap', () => {
    const { medicare } = computeFica(1_000_000, 'single', RULES);
    expect(medicare).toBeCloseTo(14_500, 6);
  });

  it('adds the 0.9% Additional Medicare Tax above the threshold', () => {
    const { additionalMedicare } = computeFica(300_000, 'single', RULES);
    // $100,000 over the $200,000 single threshold.
    expect(additionalMedicare).toBeCloseTo(900, 6);
  });

  it('uses a higher Additional Medicare threshold for joint filers', () => {
    const single = computeFica(240_000, 'single', RULES);
    const joint = computeFica(240_000, 'marriedJointly', RULES);

    expect(single.additionalMedicare).toBeGreaterThan(0);
    expect(joint.additionalMedicare).toBe(0);
  });

  it('uses a lower Additional Medicare threshold for separate filers', () => {
    const { additionalMedicare } = computeFica(150_000, 'marriedSeparately', RULES);
    expect(additionalMedicare).toBeCloseTo(225, 6); // $25,000 over $125,000
  });

  it('totals its own components', () => {
    const r = computeFica(300_000, 'single', RULES);
    expect(r.total).toBeCloseTo(
      r.socialSecurity + r.medicare + r.additionalMedicare,
      6,
    );
  });

  it('is zero at zero wages and never negative', () => {
    expect(computeFica(0, 'single', RULES).total).toBe(0);
    expect(computeFica(-50_000, 'single', RULES).total).toBe(0);
  });

  it('rises monotonically with wages', () => {
    let previous = -Infinity;
    for (let wages = 0; wages <= 600_000; wages += 10_000) {
      const { total } = computeFica(wages, 'single', RULES);
      expect(total).toBeGreaterThanOrEqual(previous);
      previous = total;
    }
  });

  it('documents the single-earner limitation for dual-income households', () => {
    // A couple earning $250,000 between them, each below the wage base, would
    // really owe 6.2% on the full amount. We cap it once. This test pins the
    // KNOWN behaviour so the limitation is deliberate rather than accidental.
    const modelled = computeFica(250_000, 'marriedJointly', RULES).socialSecurity;
    const twoEarnerReality = 250_000 * 0.062;

    expect(modelled).toBeCloseTo(184_500 * 0.062, 6);
    expect(twoEarnerReality - modelled).toBeGreaterThan(4_000);
  });
});
