/**
 * Builds data/<version>/states.json from a committed snapshot of the
 * Tax Foundation state income tax table.
 *
 *   node scripts/build-state-tax-rules.mjs
 *
 * The snapshot lives in data/<version>/sources/ so this is fully reproducible
 * offline and the dataset can never change underneath a shared link.
 *
 * Tax Foundation content is CC BY-NC 4.0. This project is permanently
 * non-commercial (PROJECT.md section 1), so that licence is satisfied.
 * Attribution appears on the methodology page.
 *
 * KNOWN MODELLING DECISIONS — all deliberate, all disclosed:
 *
 *  1. Washington's 7%/9% applies to CAPITAL GAINS ONLY (source footnote tt).
 *     It is NOT a wage tax. Washington is therefore treated as having no wage
 *     income tax, alongside AK, FL, NV, NH, SD, TN, TX and WY.
 *
 *  2. Seven states levy their first positive rate above $0, leaving a
 *     zero-rate band below it. A {from: 0, rate: 0} bracket is prepended so
 *     every schedule starts at zero, as the engine requires.
 *
 *  3. The source publishes single and married-filing-jointly schedules only.
 *     Married-filing-separately and head-of-household are mapped to the single
 *     schedule. This is correct for MFS in most states and a documented
 *     approximation for head of household.
 *
 *  4. Some states express personal/dependent allowances as tax CREDITS rather
 *     than income exemptions. These are captured separately, because a credit
 *     reduces tax while an exemption reduces taxable income.
 *
 *  5. Income-based phase-outs of deductions, exemptions and credits (roughly a
 *     dozen states) are NOT modelled. They bite mainly at high incomes. Each
 *     affected state carries the source footnote so the limitation is visible
 *     on the methodology page.
 */

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CURRENT_DATASET_VERSION } from './lib/version.mjs';
import { writeDataset } from './lib/write-dataset.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
/** Overridable so a new dated release can be built without editing every script. */
const VERSION = process.env.DATASET_VERSION || CURRENT_DATASET_VERSION;
const DATA_DIR = resolve(HERE, '..', 'data', VERSION);
const SNAPSHOT = resolve(DATA_DIR, 'sources', 'taxfoundation-state-income-tax-2026.html');
const OUT = resolve(DATA_DIR, 'states.json');

const SOURCE_URL = 'https://taxfoundation.org/data/all/state/state-income-tax-rates-2026/';

/**
 * The date the bracket table was PUBLISHED, not the date it was downloaded.
 *
 * A state that legislates in May does not change this file, so nothing in the
 * build could ever notice the table going out of date. Seven states did exactly
 * that in 2026 and were only caught by hand. This is the tripwire.
 */
const SNAPSHOT_PUBLISHED = '2026-02-17';
/** How stale the table is allowed to get before the build starts complaining. */
const SNAPSHOT_STALE_AFTER_MONTHS = 4;

/**
 * FIGURES THAT ARE LAST YEAR'S, BECAUSE THE STATE HAS NOT PUBLISHED THIS
 * YEAR'S.
 *
 * States index their brackets and allowances on their own timetable, and many
 * do not publish until the return forms appear — which for tax year 2026 means
 * late 2026 or early 2027. Waiting is not an option: the calculator has to
 * answer today.
 *
 * So where 2026 does not exist we ship the state's last published figures and
 * say so here, per state, in plain words. That is better than a blank and far
 * better than a number nobody can source. Inflation means last year's brackets
 * are slightly narrow and last year's allowances slightly small, so the error
 * is small and runs AGAINST the reader — we show marginally more tax than they
 * will owe, not less.
 *
 * This is separate from `modellingGaps`, which is about rules we do not
 * calculate at all. This is about figures that are real and published, just a
 * year old.
 */
const PRIOR_YEAR_FIGURES = {
  California: 'California indexes its brackets, standard deduction and exemption credits every autumn and has not published 2026 yet, so every California figure here is the published 2025 one.',
  Vermont: 'Vermont has published no 2026 rate schedule, so its brackets, standard deduction and personal exemption here are the published 2025 figures.',
  Oregon: "Oregon has published no 2026 return forms. Its brackets, standard deduction and exemption credit here come from Oregon's own 2026 withholding formulas, but no 2026 head-of-household standard deduction exists anywhere, so that one figure is the published 2025 amount of $4,560.",
  'South Carolina': "South Carolina's dependent exemption here is the published 2025 figure of $4,930; the state indexes it each December and the 2026 amount appears only in return instructions that are not out yet.",
  Utah: "Utah's taxpayer tax credit phase-out thresholds and dependent exemption here are the published 2025 figures; the state has not released 2026 amounts.",
  Idaho: "Idaho's untaxed band of $4,811 for a single filer and $9,622 for a couple is the published 2025 figure; Idaho publishes the 2026 amount around December.",
  Mississippi: "Only Mississippi's rate is published for 2026. Its standard deduction and exemptions here are the 2025 figures, which are fixed in statute and were not changed by any 2026 law.",
  Alabama: 'Alabama has published nothing for 2026. Its rates, exemptions and deduction charts here are the 2025 figures, all of which are fixed in statute rather than indexed.',
  Oklahoma: "Oklahoma's rates for 2026 come from the enacted law, but its standard deduction and exemptions here are the 2025 figures. They are not indexed, so they should carry unchanged.",
  'Rhode Island': "Rhode Island's 2026 figures here come from a form the state published carrying a draft watermark. They are internally consistent and are the state's own, but they should be re-checked against the final booklet.",
};

/**
 * STATES WHOSE RATES AND ALLOWANCES HAVE BEEN READ OFF THE STATE'S OWN 2026
 * PUBLICATION, rather than taken on trust from the aggregated table.
 *
 * This is a different and stronger claim than the head-of-household table
 * below, which mostly settled one question — which schedule and allowance a
 * single parent gets. This one means somebody opened the state's rate
 * schedule, withholding guide or statute for tax year 2026 and compared every
 * bracket and every allowance against what we ship.
 *
 * It exists because the aggregated table is published once a year, in
 * February, and states legislate through the spring. Four moved underneath it
 * in 2026. "Our source is reputable" is not an answer to that; only looking is.
 *
 * `matched: true` means the state's own publication agreed with the table and
 * nothing needed changing. That is the most common and least interesting
 * result, and it is recorded precisely because "checked and agreed" is
 * indistinguishable from "never looked" unless somebody writes it down.
 */
/**
 * STATES THAT TAX A MARRIED COUPLE AS TWO SINGLE FILERS on half the income
 * each, rather than as one joint return.
 *
 * MISSOURI IS THE REASON THIS IS A CORRECTNESS FIX RATHER THAN AN
 * OPTIMISATION: "Missouri law requires a combined return for married couples
 * filing together." It never performs a joint computation at all, so a
 * one-pass engine overcharged every two-earner couple in the state.
 *
 * Elsewhere it is an election, and one nearly every two-earner couple makes.
 * Delaware, Washington DC and Arkansas each run ONE rate ladder for every
 * filing status, so a couple climbs it twice as fast unless they split.
 * Kentucky's reason is different: its standard deduction is not doubled on a
 * joint return, so splitting is the only way to get two of them. Mississippi's
 * is different again — each spouse gets their own $10,000 band at 0%.
 *
 * Saving at $150,000 split evenly, per the states' own forms:
 *   DC $1,600 · DE $1,017 · AR $749 · MS $400 · MO $176 · KY $118
 *
 * DELIBERATELY ABSENT, each checked: Iowa, Montana, Georgia, Ohio and Alabama
 * all require the state status to match the federal one and double every
 * bracket and allowance, so splitting gains nothing. Virginia's version is not
 * a filing status at all — its Form 760 dropped status 4, and the same benefit
 * arrives as a "spouse tax adjustment" credit capped at $259, which is not
 * modelled.
 */
/**
 * PROPERTY TAX RELIEF THAT IS NOT ITEMISING.
 *
 * New Jersey is the only one, and it is the only relief in this dataset that
 * reaches a RENTER. New Jersey has no standard deduction, no itemised
 * deductions and no mortgage interest deduction at all — but it takes up to
 * $15,000 of property tax off taxable income, and counts 18% of a year's rent
 * as property tax for the purpose.
 *
 * New Jersey has the highest property taxes in the country, so this touches
 * nearly every household there. We modelled none of it.
 *
 * The $50 credit is an ALTERNATIVE, not an addition — the return works both
 * out and takes whichever is worth more, so the deduction wins only where it
 * saves more than $50.
 */
/**
 * FLAT AMOUNTS ADDED TO TAX ONCE INCOME PASSES A THRESHOLD.
 *
 * Connecticut has two and we had neither, which is most of why it was the
 * worst undercharge in the dataset. Both run off Connecticut adjusted gross
 * income rather than taxable income, and both are added after the brackets.
 *
 * TABLE C, the "2% tax rate phase-out add-back", claws back the benefit of
 * Connecticut's lowest bracket. Its maximum is exactly that benefit: $10,000
 * of income at 2% instead of 4.5% is $250 for a single filer, $500 for a
 * couple on $20,000, $400 for a head of household on $16,000. That the caps
 * reconstruct from the brackets is the check that they are right.
 *
 * TABLE D, the recapture, claws back the rest for higher earners in three
 * phases. Each phase's cap is CUMULATIVE — reading them as separate
 * contributions would understate the top of the table by thousands.
 */
const TAX_ADD_BACKS = {
  Connecticut: [
    {
      phases: {
        single: [{ from: 56_500, stepSize: 5_000, perStep: 25, capAt: 250 }],
        marriedJointly: [{ from: 100_500, stepSize: 5_000, perStep: 50, capAt: 500 }],
        headOfHousehold: [{ from: 78_500, stepSize: 4_000, perStep: 40, capAt: 400 }],
      },
    },
    {
      phases: {
        single: [
          { from: 105_000, stepSize: 5_000, perStep: 25, capAt: 250 },
          { from: 200_000, stepSize: 5_000, perStep: 90, capAt: 2_950 },
          { from: 500_000, stepSize: 5_000, perStep: 50, capAt: 3_400 },
        ],
        marriedJointly: [
          { from: 210_000, stepSize: 10_000, perStep: 50, capAt: 500 },
          { from: 400_000, stepSize: 10_000, perStep: 180, capAt: 5_900 },
          { from: 1_000_000, stepSize: 10_000, perStep: 100, capAt: 6_800 },
        ],
        headOfHousehold: [
          { from: 168_000, stepSize: 8_000, perStep: 40, capAt: 400 },
          { from: 320_000, stepSize: 8_000, perStep: 140, capAt: 4_600 },
          { from: 800_000, stepSize: 8_000, perStep: 80, capAt: 5_320 },
        ],
      },
    },
  ],
};

/**
 * CONNECTICUT'S PERSONAL CREDIT, which is a share of the whole bill rather
 * than a fixed amount — up to 75% of it wiped out, tapering to nothing in 28
 * steps.
 *
 * This runs the OPPOSITE way from the two add-backs above and lands on a
 * different set of people: omitting it overcharged everyone it reaches, while
 * omitting the add-backs undercharged everyone above them. Connecticut was
 * wrong in both directions at once, on different households.
 *
 * The wide plateaus at .35, .15 and .10 are in the printed table, not a
 * transcription slip.
 */
const TAX_CREDIT_FRACTION = {
  /*
   * OHIO'S JOINT FILING CREDIT reaches only couples where both work — each
   * spouse needs $500 of qualifying income — so it is the one credit here with
   * an earners condition. A percentage of the tax, capped at $650.
   */
  /*
   * Ohio's bands are measured on income AFTER exemptions and this uses gross,
   * which is slightly higher and so can land a couple in a lower percentage
   * band than they deserve. That understates the credit and overstates the
   * tax — the safe direction — and the gap is at most one band near a
   * boundary.
   */
  Ohio: {
    max: 650,
    requiresTwoEarners: true,
    bands: {
      single: [[0, 0]],
      marriedJointly: [
        [25_000, 0.2],
        [50_000, 0.15],
        [75_000, 0.1],
        [749_999, 0.05],
      ],
      headOfHousehold: [[0, 0]],
    },
  },
  Connecticut: {
    bands: {
      single: [
        [18_800, 0.75],
        [19_300, 0.7],
        [19_800, 0.65],
        [20_300, 0.6],
        [20_800, 0.55],
        [21_300, 0.5],
        [21_800, 0.45],
        [22_300, 0.4],
        [25_000, 0.35],
        [25_500, 0.3],
        [26_000, 0.25],
        [26_500, 0.2],
        [31_300, 0.15],
        [31_800, 0.14],
        [32_300, 0.13],
        [32_800, 0.12],
        [33_300, 0.11],
        [60_000, 0.1],
        [60_500, 0.09],
        [61_000, 0.08],
        [61_500, 0.07],
        [62_000, 0.06],
        [62_500, 0.05],
        [63_000, 0.04],
        [63_500, 0.03],
        [64_000, 0.02],
        [64_500, 0.01],
      ],
      marriedJointly: [
        [30_000, 0.75],
        [30_500, 0.7],
        [31_000, 0.65],
        [31_500, 0.6],
        [32_000, 0.55],
        [32_500, 0.5],
        [33_000, 0.45],
        [33_500, 0.4],
        [40_000, 0.35],
        [40_500, 0.3],
        [41_000, 0.25],
        [41_500, 0.2],
        [50_000, 0.15],
        [50_500, 0.14],
        [51_000, 0.13],
        [51_500, 0.12],
        [52_000, 0.11],
        [96_000, 0.1],
        [96_500, 0.09],
        [97_000, 0.08],
        [97_500, 0.07],
        [98_000, 0.06],
        [98_500, 0.05],
        [99_000, 0.04],
        [99_500, 0.03],
        [100_000, 0.02],
        [100_500, 0.01],
      ],
      headOfHousehold: [
        [24_000, 0.75],
        [24_500, 0.7],
        [25_000, 0.65],
        [25_500, 0.6],
        [26_000, 0.55],
        [26_500, 0.5],
        [27_000, 0.45],
        [27_500, 0.4],
        [34_000, 0.35],
        [34_500, 0.3],
        [35_000, 0.25],
        [35_500, 0.2],
        [44_000, 0.15],
        [44_500, 0.14],
        [45_000, 0.13],
        [45_500, 0.12],
        [46_000, 0.11],
        [74_000, 0.1],
        [74_500, 0.09],
        [75_000, 0.08],
        [75_500, 0.07],
        [76_000, 0.06],
        [76_500, 0.05],
        [77_000, 0.04],
        [77_500, 0.03],
        [78_000, 0.02],
        [78_500, 0.01],
      ],
    },
  },
};

/**
 * STATES THAT LET YOU SUBTRACT THE FEDERAL INCOME TAX YOU PAID.
 *
 * `federalTaxDeductible` has flagged Alabama, Missouri and Oregon as allowing
 * this since the dataset was built, and has never been anything but a label —
 * nothing read it. Oregon's is the largest single overcharge left at the
 * incomes this site serves: about $743 a year to a single filer on $80,000.
 *
 * A STAIRCASE, NOT A TAPER. Oregon's cap holds at $8,500 to $125,000 of
 * income, then drops in five $1,700 steps across a $20,000 span and is gone.
 * The joint and head-of-household band runs from $250,000 to $290,000 — note
 * that head of household uses the JOINT thresholds, not the single ones.
 *
 * It is federal tax AFTER credits, and it is liability rather than what was
 * withheld.
 *
 * Alabama and Missouri also allow it and are NOT modelled here: Alabama's runs
 * through its Schedule A and Missouri's is a percentage of federal tax that
 * reaches zero above $125,000 of Missouri income, so neither fits this shape.
 * Both are recorded as gaps on their own states.
 */
const FEDERAL_TAX_DEDUCTION = {
  Oregon: {
    caps: {
      single: [
        [125_000, 8_500],
        [130_000, 6_800],
        [135_000, 5_100],
        [140_000, 3_400],
        [145_000, 1_700],
      ],
      marriedJointly: [
        [250_000, 8_500],
        [260_000, 6_800],
        [270_000, 5_100],
        [280_000, 3_400],
        [290_000, 1_700],
      ],
      headOfHousehold: [
        [250_000, 8_500],
        [260_000, 6_800],
        [270_000, 5_100],
        [280_000, 3_400],
        [290_000, 1_700],
      ],
    },
  },
};

/**
 * STATES WHOSE PERSONAL CREDITS PAY OUT BELOW ZERO TAX.
 *
 * IDAHO'S GROCERY CREDIT — renamed the food tax credit — is $155 for the
 * filer, the spouse and every dependent, with NO INCOME TEST AT ALL, and the
 * statute is explicit: "if taxes due are less than the total credit allowed,
 * the taxpayer shall be paid a refund equal to the balance". A family of four
 * gets $620 whether they owe anything or not.
 *
 * Treating it as an ordinary credit would silently cap it at the tax owed,
 * which takes most of its value from exactly the households it exists for.
 */
const REFUNDABLE_PERSONAL_CREDIT = new Set(['Idaho']);

/**
 * CREDITS FOR PROPERTY TAX PAID.
 *
 * Illinois gives 5% of the property tax on your principal residence,
 * nonrefundable, and takes the whole thing away above $250,000 of federal
 * income ($500,000 for a couple). A cliff, not a taper.
 *
 * Connecticut's is deliberately absent: it is capped at $300 and tapers in
 * seven steps, and it also covers motor vehicle tax, which this engine does
 * not ask about. Modelling half of it would misstate the other half, so it
 * stays a recorded gap.
 */
const PROPERTY_TAX_CREDIT = {
  Illinois: {
    rate: 0.05,
    cliff: { single: 250_000, marriedJointly: 500_000, headOfHousehold: 250_000 },
  },
};

/**
 * STATES THAT LET YOU DEDUCT THE SOCIAL SECURITY AND MEDICARE TAX WITHHELD.
 *
 * Massachusetts gives $2,000 EACH, on two separate lines of the form — one per
 * spouse — so a two-earner couple gets $4,000. Per person rather than per
 * return is the whole point of the two lines, and reading it as per return
 * would halve it for every couple in the state.
 *
 * Alabama also allows it and is handled through its itemised schedule instead,
 * because there it competes with the standard deduction rather than coming off
 * on top.
 */
const PAYROLL_TAX_DEDUCTION = {
  Massachusetts: { capPerPerson: 2_000 },
};

const PROPERTY_TAX_RELIEF = {
  'New Jersey': {
    cap: 15_000,
    renterShareOfRent: 0.18,
    alternativeCredit: 50,
    // Below the filing threshold there is no relief at all, except for people
    // who are 65 or over, blind or disabled — which this engine never asks.
    minimumGrossIncome: { single: 10_000, marriedJointly: 20_000, headOfHousehold: 20_000 },
  },
};

const COMBINED_SEPARATE_RETURN = new Set([
  'Missouri',
  'Washington DC',
  'Delaware',
  'Arkansas',
  'Mississippi',
  'Kentucky',
]);

const RATES_CHECKED = {
  // --- read and found WRONG -------------------------------------------------
  'South Carolina': {
    // Act No. 110 of 2026. Rates, allowance, starting point and earned income
    // credit all changed, and two shipped footnotes had become false.
    matched: false,
    source: 'https://www.scstatehouse.gov/sess126_2025-2026/prever/4216_20260224.htm',
    checked: '2026-08-15',
  },
  'West Virginia': {
    // SB 392 of 2026 cut every rate 5%, retroactive to 1 January.
    matched: false,
    source: 'https://tax.wv.gov/Individuals/Pages/PersonalIncomeTaxReductionBill.aspx',
    checked: '2026-08-15',
  },
  Utah: {
    // SB 60 of 2026 cut the rate 4.50% -> 4.45%, retroactive to 1 January.
    matched: false,
    source: 'https://le.utah.gov/~2026/bills/sbillenr/SB0060.pdf',
    checked: '2026-08-15',
  },
  Hawaii: {
    // 2026 is a step year in the 2024 law: the standard deduction nearly
    // doubles and we were shipping the 2024-2025 figure. Re-verified from the
    // statute after a first research report proved unreliable.
    matched: false,
    source: 'https://www.capitol.hawaii.gov/hrscurrent/Vol04_Ch0201-0257/HRS0235/HRS_0235-0002_0004.htm',
    checked: '2026-08-15',
  },
  Wisconsin: {
    // The standard deduction phases out to nothing and we gave it in full.
    matched: false,
    source: 'https://www.revenue.wi.gov/TaxForms2026/2026-Form1-ES-Inst.pdf',
    checked: '2026-08-15',
  },
  Connecticut: {
    // The personal exemption vanishes by $44,000 and we gave it at every income.
    matched: false,
    source: 'https://portal.ct.gov/-/media/drs/forms/2025/income/ct-1040-tcs_1225.pdf',
    checked: '2026-08-15',
  },
  'Rhode Island': {
    // Head-of-household standard deduction was the 2025 figure.
    matched: false,
    source: 'https://tax.ri.gov/sites/g/files/xkgbur541/files/2025-10/2026%20RI-1040ES_bd.pdf',
    checked: '2026-08-15',
  },
  Vermont: {
    // Brackets confirmed to be 2025 figures, which is what unblocked the
    // head-of-household schedule rather than anything Vermont published.
    matched: false,
    source: 'https://tax.vermont.gov/sites/tax/files/documents/TaxRateSched-2025.pdf',
    checked: '2026-08-15',
  },
  Missouri: {
    // Rates and allowances matched; the working family credit is 20%, not 10%.
    matched: false,
    source: 'https://dor.mo.gov/forms/4282_2026.pdf',
    checked: '2026-08-15',
  },

  'North Dakota': {
    // Brackets were the 2025 figures; head-of-household deduction was missing.
    matched: false,
    source: 'https://www.tax.nd.gov/sites/www/files/documents/forms/software-developer/individual-income-forms/28709-form-nd-1es-2026%20final.pdf',
    checked: '2026-08-15',
  },
  'New Mexico': {
    // Head-of-household deduction was missing, and it fell back to the JOINT
    // figure rather than the single one — an undercharge.
    matched: false,
    source: 'https://www.tax.newmexico.gov/all-nm-taxes/current-historic-tax-rates-overview/personal-income-tax-rates/',
    checked: '2026-08-15',
  },
  'New Jersey': {
    matched: false,
    source: 'https://www.nj.gov/treasury/taxation/pdf/current/1040esi.pdf',
    checked: '2026-08-15',
  },
  Massachusetts: {
    // Surtax threshold was the 2025 figure.
    matched: false,
    source: 'https://www.mass.gov/info-details/massachusetts-tax-rates',
    checked: '2026-08-15',
  },
  Maryland: {
    // Standard deduction was a 2025 figure and the exemption phase-out was
    // missing entirely.
    matched: false,
    source: 'https://www.marylandcomptroller.gov/content/dam/mdcomp/tax/instructions/withholding/2026/withholding-guide.pdf',
    checked: '2026-08-15',
  },
  Maine: {
    // Rates confirmed against the 20 May 2026 revision; the deduction
    // phase-out was missing and a shipped note about it was wrong.
    matched: false,
    source: 'https://www.maine.gov/revenue/sites/maine.gov.revenue/files/2026-05/ind_tax_rate_sched_2026_rev.pdf',
    checked: '2026-08-15',
  },
  Ohio: {
    // 2026 is in the statute even though the Department's rates page stops at
    // 2025: HB 96 sets "$332.00 plus 2.75%" for 2026 and drops the top band.
    matched: false,
    source: 'https://codes.ohio.gov/ohio-revised-code/section-5747.02',
    checked: '2026-08-15',
  },
  Oregon: {
    // 2026 brackets and deductions confirmed from the 2026 withholding
    // formulas; the exemption credit was the 2025 figure.
    matched: false,
    source: 'https://www.oregon.gov/dor/forms/FormsPubs/withholding-tax-formulas_206-436_2026.pdf',
    checked: '2026-08-15',
  },
  Arkansas: {
    // Act 1 of the 2026 First Extraordinary Session cut the top rate to 3.7%
    // retroactive to 1 January.
    matched: false,
    source: 'https://www.dfa.arkansas.gov/wp-content/uploads/Withholding-Tax-Formula.pdf',
    checked: '2026-08-15',
  },
  Alabama: {
    // The standard deduction shrinks to a floor and we shipped the maximum.
    matched: false,
    source: 'https://www.revenue.alabama.gov/wp-content/uploads/2026/01/25f40bk.pdf',
    checked: '2026-08-15',
  },
  Arizona: {
    // Figures confirmed against HB 4168 — the recorded source had been a
    // VETOED bill.
    matched: false,
    source: 'https://www.azleg.gov/legtext/57leg/2R/laws/0140.htm',
    checked: '2026-08-15',
  },
  Colorado: {
    // Rate and deduction correct; the earned income credit halves for 2026.
    matched: false,
    source: 'https://tax.colorado.gov/income-tax-topics-earned-income-tax-credit',
    checked: '2026-08-15',
  },
  California: {
    // Everything shipped is TAX YEAR 2025 and California has not published
    // 2026. Recorded as checked because that is a finding, not a gap.
    matched: true,
    source: 'https://www.ftb.ca.gov/about-ftb/newsroom/tax-news/2025/10.html',
    checked: '2026-08-15',
  },
  'New York': {
    // Rates, brackets and standard deductions all matched against New York's
    // own 2026 estimated-tax instructions; the head-of-household schedule was
    // missing entirely.
    matched: false,
    source: 'https://www.tax.ny.gov/pdf/current_forms/it/it2105i.pdf',
    checked: '2026-08-15',
  },
  Oklahoma: {
    // Verified against the enrolled text of HB 2764, which sets the 2026
    // rates outright.
    matched: true,
    source: 'https://www.oklegislature.gov/cf_pdf/2025-26%20ENR/hB/HB2764%20ENR.PDF',
    checked: '2026-08-15',
  },
  Pennsylvania: {
    // 3.07% since 2004, no deduction, no exemption, nothing to get wrong.
    matched: true,
    source: 'https://www.pa.gov/agencies/revenue/resources/tax-types-and-information/personal-income-tax.html',
    checked: '2026-08-15',
  },
  Nebraska: {
    matched: true,
    source: 'https://revenue.nebraska.gov/sites/default/files/doc/tax-forms/2025/f_1040N-ES.pdf',
    checked: '2026-08-15',
  },
  'North Carolina': {
    // 3.99% holds for 2026; the July 2026 budget did not raise the deduction.
    matched: true,
    source: 'https://www.ncdor.gov/taxes-forms/individual-income-tax/tax-rate-schedules',
    checked: '2026-08-15',
  },
  // --- read and found RIGHT -------------------------------------------------
  /*
   * These are the most common result and the least interesting to read, and
   * they are recorded for exactly that reason. "Checked and agreed" and "never
   * looked" produce identical numbers; only a written record tells them apart,
   * and the flat-rate states already taught this project that lesson once.
   */
  Michigan: {
    // The 4.25% rollback trigger did not fire for 2026.
    matched: true,
    source: 'https://www.michigan.gov/treasury/news/2026/04/15/state-individual-income-tax-rate-for-2026-tax-year-determined',
    checked: '2026-08-15',
  },
  Minnesota: {
    // Brackets and deductions all matched; the standard deduction phase-out
    // was missing.
    matched: false,
    source: 'https://www.revenue.state.mn.us/sites/default/files/2025-12/inflation-adjusted-amounts-2026.pdf',
    checked: '2026-08-15',
  },
  Mississippi: {
    // 4.0% for 2026 confirmed; the cuts to 3.75% start in 2027.
    matched: true,
    source: 'https://www.dor.ms.gov/general-information',
    checked: '2026-08-15',
  },
  Montana: {
    // Montana's legislature meets in odd years, so there is no post-February
    // session to have moved anything.
    matched: true,
    source: 'https://revenue.mt.gov/news/recent-news/HB-337',
    checked: '2026-08-15',
  },
  'Washington DC': {
    matched: true,
    source: 'https://otr.cfo.dc.gov/page/district-columbia-tax-rates-individual-income-and-business-franchise-taxes',
    checked: '2026-08-15',
  },
  Delaware: {
    matched: true,
    source: 'https://revenuefiles.delaware.gov/2025/PITForms_Instructions/Instructions/PIT-RES_Instructions_2025-01.pdf',
    checked: '2026-08-15',
  },
  Georgia: {
    // Verifies the correction already applied for the law signed 11 May 2026.
    matched: true,
    source: 'https://dor.georgia.gov/document/document/2026-employers-tax-guide/download',
    checked: '2026-08-15',
  },
  Iowa: {
    // 3.8%, not the 3.9% one stale Iowa government page still shows. The
    // head-of-household personal credit was $40 and should be $80.
    matched: false,
    source: 'https://revenue.iowa.gov/taxes/tax-guidance/individual-income-tax',
    checked: '2026-08-15',
  },
  Idaho: {
    matched: true,
    source: 'https://tax.idaho.gov/wp-content/uploads/forms/EFO00089/EFO00089_03-02-2026.pdf',
    checked: '2026-08-15',
  },
  Illinois: {
    matched: true,
    source: 'https://tax.illinois.gov/content/dam/soi/en/web/tax/forms/incometax/documents/currentyear/individual/il-1040-exemption-allowance-chart.pdf',
    checked: '2026-08-15',
  },
  Indiana: {
    // State rate and exemptions matched. Indiana's COUNTY tax is a separate
    // dataset and is a separate, larger problem.
    matched: true,
    source: 'https://www.in.gov/dor/files/dn01.pdf',
    checked: '2026-08-15',
  },
  Kansas: {
    // The 2025 automatic-rate-cut trigger did not fire for 2026.
    matched: true,
    source: 'https://www.ksrevenue.gov/incomebook25.html',
    checked: '2026-08-15',
  },
  Kentucky: {
    // 3.5% holds: the trigger for a cut to 3.0% failed by $7.5 million.
    matched: true,
    source: 'https://revenue.ky.gov/News/Pages/Kentucky-DOR-Announces-2026-Standard-Deduction.aspx',
    checked: '2026-08-15',
  },
  Louisiana: {
    matched: true,
    source: 'https://dam.ldr.la.gov/taxforms/1306-1-26.pdf',
    checked: '2026-08-15',
  },
  Virginia: {
    // $8,750 / $17,500 holds for 2026; the rise to $9,200 is 2027.
    matched: true,
    source: 'https://www.tax.virginia.gov/news/new-virginia-tax-laws',
    checked: '2026-08-15',
  },
};

/** Washington's schedule is capital-gains only — never a wage tax. */
const CAPITAL_GAINS_ONLY = new Set(['Washington']);

const STATE_CODES = {
  Alabama: 'AL', Alaska: 'AK', Arizona: 'AZ', Arkansas: 'AR', California: 'CA',
  Colorado: 'CO', Connecticut: 'CT', Delaware: 'DE', Florida: 'FL', Georgia: 'GA',
  Hawaii: 'HI', Idaho: 'ID', Illinois: 'IL', Indiana: 'IN', Iowa: 'IA',
  Kansas: 'KS', Kentucky: 'KY', Louisiana: 'LA', Maine: 'ME', Maryland: 'MD',
  Massachusetts: 'MA', Michigan: 'MI', Minnesota: 'MN', Mississippi: 'MS',
  Missouri: 'MO', Montana: 'MT', Nebraska: 'NE', Nevada: 'NV',
  'New Hampshire': 'NH', 'New Jersey': 'NJ', 'New Mexico': 'NM', 'New York': 'NY',
  'North Carolina': 'NC', 'North Dakota': 'ND', Ohio: 'OH', Oklahoma: 'OK',
  Oregon: 'OR', Pennsylvania: 'PA', 'Rhode Island': 'RI', 'South Carolina': 'SC',
  'South Dakota': 'SD', Tennessee: 'TN', Texas: 'TX', Utah: 'UT', Vermont: 'VT',
  Virginia: 'VA', Washington: 'WA', 'West Virginia': 'WV', Wisconsin: 'WI',
  Wyoming: 'WY', 'Washington DC': 'DC',
};

// --- tiny HTML helpers -----------------------------------------------------

const stripTags = (s) => s.replace(/<[^>]+>/g, ' ');

function unescapeHtml(s) {
  return s
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#8217;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)));
}

const clean = (s) => unescapeHtml(stripTags(s)).replace(/\s+/g, ' ').trim();

function parseMoney(raw) {
  const s = String(raw ?? '').replace(/[$,]/g, '').trim();
  if (!s || /^(n\.?a\.?|none|-)$/i.test(s)) return null;
  return /^-?[\d.]+$/.test(s) ? Number(s) : s; // non-numeric kept for credit strings
}

function parseRate(raw) {
  const s = String(raw ?? '').trim();
  const m = /^([\d.]+)%$/.exec(s);
  if (!m) return null;
  // Rates are stored as FRACTIONS. Round to kill float noise (2.2% -> 0.022).
  return Number((Number(m[1]) / 100).toFixed(6));
}

/** "153 credit" -> 153 */
function creditAmount(v) {
  if (typeof v !== 'string') return null;
  const m = /([\d,.]+)\s*credit/i.exec(v);
  return m ? Number(m[1].replace(/,/g, '')) : null;
}

// --- parse -----------------------------------------------------------------

const html = readFileSync(SNAPSHOT, 'utf8');

const tables = html.match(/<table[\s\S]*?<\/table>/g) ?? [];
if (tables.length < 2) throw new Error(`expected >=2 tables in snapshot, found ${tables.length}`);
const table = tables[1];

const rows = (table.match(/<tr[\s\S]*?<\/tr>/g) ?? [])
  .map((r) => (r.match(/<t[dh][^>]*>[\s\S]*?<\/t[dh]>/g) ?? []).map(clean))
  .filter((cells) => cells.length > 0);

// Footnote text, keyed by letter.
const footnoteText = {};
{
  const tail = html.split('</table>').pop() ?? '';
  const flat = unescapeHtml(stripTags(tail)).replace(/\s+/g, ' ');
  for (const m of flat.matchAll(/\(([a-z]{1,2})\)\s+([^(]{25,}?)(?=\s*\([a-z]{1,2}\)\s|$)/g)) {
    footnoteText[m[1]] = m[2].trim();
  }
}

const states = {};
let current = null;

for (const cells of rows.slice(1)) {
  const first = cells[0] ?? '';
  if (!first || /^State$/i.test(first)) continue;

  let key = current;

  if (!first.startsWith('-')) {
    const m = /^(.*?)\s*\(([^)]*)\)\s*$/.exec(first);
    const name = (m ? m[1] : first).trim();
    if (!STATE_CODES[name]) continue; // skip stray rows

    const footnotes = m ? m[2].split(',').map((x) => x.trim()).filter(Boolean) : [];
    key = name;
    current = name;

    const sdSingle = parseMoney(cells[7]);
    const sdCouple = parseMoney(cells[8]);
    const peSingle = parseMoney(cells[9]);
    const peCouple = parseMoney(cells[10]);
    const peDep = parseMoney(cells[11]);

    states[name] = {
      code: STATE_CODES[name],
      name,
      hasWageIncomeTax: true,
      brackets: { single: [], marriedJointly: [] },
      standardDeduction: {
        single: typeof sdSingle === 'number' ? sdSingle : 0,
        marriedJointly: typeof sdCouple === 'number' ? sdCouple : 0,
      },
      personalExemption: {
        single: typeof peSingle === 'number' ? peSingle : 0,
        marriedJointly: typeof peCouple === 'number' ? peCouple : 0,
        dependent: typeof peDep === 'number' ? peDep : 0,
      },
      personalCredit: {
        single: creditAmount(peSingle) ?? 0,
        marriedJointly: creditAmount(peCouple) ?? 0,
        dependent: creditAmount(peDep) ?? 0,
      },
      federalTaxDeductible: footnotes.includes('b'),
      hasLocalIncomeTax: footnotes.includes('a'),
      footnotes,
      notes: [],
    };
  }

  if (!key || !states[key]) continue;

  const sRate = parseRate(cells[1]);
  const sFrom = parseMoney(cells[3]);
  if (sRate !== null && typeof sFrom === 'number') {
    states[key].brackets.single.push({ from: sFrom, rate: sRate });
  }

  const jRate = parseRate(cells[4]);
  const jFrom = parseMoney(cells[6]);
  if (jRate !== null && typeof jFrom === 'number') {
    states[key].brackets.marriedJointly.push({ from: jFrom, rate: jRate });
  }
}


/**
 * HOW EACH STATE TREATS A HEAD OF HOUSEHOLD.
 *
 * Tax Foundation publishes single and married-filing-jointly columns only, so
 * this cannot come from the source above. It has to be read off each state's
 * own publication, and until it is, the honest label is "assumed-single" —
 * NOT "single", which would claim a check nobody performed.
 *
 * That distinction is the whole point. Every graduated state was silently
 * treated as though a head of household files on the single schedule, and in
 * California that overcharged a single parent $2,028 a year on $120,000 of
 * taxable income. The state publishes its own Schedule Z. Maryland sends them
 * to the JOINT schedule outright. Nobody had looked.
 *
 * Each entry below was read from the state's own revenue department, and the
 * URL and date are recorded so the next person can re-check rather than
 * re-trust. Anything absent from this table stays "assumed-single" and shows
 * up in the coverage report the build prints.
 */
const HEAD_OF_HOUSEHOLD = {
  California: {
    basis: 'own',
    // FTB 2025 Schedule Z. Plus the 1% Mental Health Services surcharge above
    // $1M, which the schedules omit and which is applied to every status.
    brackets: [
      { from: 0, rate: 0.01 },
      { from: 22_173, rate: 0.02 },
      { from: 52_530, rate: 0.04 },
      { from: 67_716, rate: 0.06 },
      { from: 83_805, rate: 0.08 },
      { from: 98_990, rate: 0.093 },
      { from: 505_208, rate: 0.103 },
      { from: 606_251, rate: 0.113 },
      { from: 1_000_000, rate: 0.123 },
      { from: 1_010_417, rate: 0.133 },
    ],
    source: 'https://www.ftb.ca.gov/forms/2025/2025-540-tax-rate-schedules.pdf',
    checked: '2026-08-15',
  },
  Maryland: {
    // "Taxpayers Filing Joint Returns, Head of Household, or Qualifying
    // Widows/Widowers" — one table, stated in those words.
    basis: 'marriedJointly',
    source: 'https://www.marylandtaxes.gov/individual/income/tax-info/tax-rates.php',
    checked: '2026-08-15',
  },
  Minnesota: {
    basis: 'own',
    // Minnesota publishes tax year 2026 already, unlike most states.
    brackets: [
      { from: 0, rate: 0.0535 },
      { from: 41_010, rate: 0.068 },
      { from: 164_800, rate: 0.0785 },
      { from: 270_060, rate: 0.0985 },
    ],
    /*
     * THE BRACKETS WERE READ AND THE DEDUCTION WAS NOT, which left Minnesota
     * half-fixed and looking finished. The same Department of Revenue
     * announcement that carries the 2026 brackets above also gives the 2026
     * standard deduction: single $15,300, HEAD OF HOUSEHOLD $23,000, joint
     * $30,600. Falling back to the single figure was $7,700 of deduction
     * thrown away, about $450 a year.
     *
     * A state having its own rate schedule is not a reason to stop looking for
     * its own allowance. Six states so far differ in the allowance alone.
     */
    standardDeduction: 23_000,
    source: 'https://www.revenue.state.mn.us/mndor-pp/21641',
    checked: '2026-08-15',
  },
  Maine: {
    /*
     * These were the 2025 figures — $40,200 and $95,150 — against 2026 single
     * brackets, the exact mistake that kept Nebraska and Vermont out of this
     * table. Maine's own 2026 schedule, revised 5 May 2026, has $41,100 and
     * $97,300, plus a new 9.15% band over $1.5M that arrived for 2026.
     */
    basis: 'own',
    brackets: [
      { from: 0, rate: 0.058 },
      { from: 41_100, rate: 0.0675 },
      { from: 97_300, rate: 0.0715 },
      { from: 1_500_000, rate: 0.0915 },
    ],
    standardDeduction: 23_550,
    source: 'https://www.maine.gov/revenue/sites/maine.gov.revenue/files/inline-files/ind_tax_rate_sched_2026.pdf',
    checked: '2026-08-15',
  },
  /*
   * FLAT-RATE STATES WERE A BLIND SPOT IN THIS WHOLE EXERCISE.
   *
   * The coverage report below counts only states with more than one bracket,
   * because the question started as "which rate schedule does a head of
   * household use". With one rate there is no schedule to get wrong, so twelve
   * states were quietly never asked the question at all.
   *
   * That was the wrong question. The ALLOWANCE differs by filing status in flat
   * states just as much, and five of the twelve turned out to differ — one of
   * them, Louisiana, by the full joint amount. Being flat says nothing about
   * the deduction.
   */
  Arizona: {
    // Sets its standard deduction to the federal one, so a head of household
    // gets $24,150 against $16,100. See STATE_OVERRIDES for why those are the
    // right federal figures for Arizona and the shipped table's are not.
    basis: 'own',
    standardDeduction: 24_150,
    source: 'https://www.azleg.gov/legtext/57leg/2R/laws/0140.htm',
    checked: '2026-08-15',
  },
  Louisiana: {
    /*
     * The biggest of the flat-state findings. La. R.S. 47:294(A) sets the
     * standard deduction at $12,500 for "Single Individual and
     * Married-Separate" and "200% of the [amount] provided for Single
     * Individuals" for "Married-Joint Return, a Qualified Surviving Spouse, and
     * HEAD OF HOUSEHOLD" — a head of household gets the full joint figure.
     *
     * The withholding tables say the same in plainer words: those claiming "2"
     * "must use the Married-Joint, Qualifying Surviving Spouse, or Head of
     * Household withholding formulas". Worth $386 a year at Louisiana's 3%.
     */
    basis: 'marriedJointly',
    source: 'https://www.legis.la.gov/Legis/Law.aspx?d=101761',
    checked: '2026-08-15',
  },
  'North Carolina': {
    // NCDOR's own chart: single $12,750, head of household $19,125, joint
    // $25,500. Exactly 1.5x, and worth about $271 a year.
    basis: 'own',
    standardDeduction: 19_125,
    source: 'https://www.ncdor.gov/taxes-forms/individual-income-tax/filing-topics/north-carolina-standard-deduction-or-north-carolina-itemized-deductions',
    checked: '2026-08-15',
  },
  Colorado: {
    // Colorado starts from FEDERAL TAXABLE INCOME, so the federal standard
    // deduction is already inside the number it taxes — including the
    // head-of-household one, $24,150 against $16,100.
    basis: 'own',
    standardDeduction: 24_150,
    source: 'https://tax.colorado.gov/sites/tax/files/documents/DR0104_book_2024.pdf',
    checked: '2026-08-15',
  },
  Iowa: {
    // Same shape as Colorado: Iowa conforms to the federal standard deduction,
    // so a head of household carries the federal $24,150.
    basis: 'own',
    standardDeduction: 24_150,
    source: 'https://revenue.iowa.gov/taxes/tax-guidance/individual-income-tax',
    checked: '2026-08-15',
  },
  Georgia: {
    // "Georgia standard deductions have increased to $30,000 for taxpayers
    // filing Married Filing Jointly and $15,000 for Single, HEAD OF HOUSEHOLD,
    // and Married Filing Separate" — the 2026 Employer's Tax Guide, naming
    // heads of household in the single group outright.
    basis: 'single',
    source: 'https://dor.georgia.gov/document/document/2026-employers-tax-guide/download',
    checked: '2026-08-15',
  },
  /*
   * The remaining four give every filer the same allowance per PERSON, so a
   * head of household genuinely lands where a single filer does. Recorded
   * rather than assumed, because "checked and identical" and "never looked"
   * produce the same numbers and only a record tells them apart.
   */
  Illinois: {
    // The exemption chart's own footnote: "Single filing status includes
    // Single, HEAD OF HOUSEHOLD, Widowed, and Married filing separately."
    basis: 'single',
    source: 'https://tax.illinois.gov/content/dam/soi/en/web/tax/forms/incometax/documents/currentyear/individual/il-1040-exemption-allowance-chart.pdf',
    checked: '2026-08-15',
  },
  Kentucky: {
    // One standard deduction for everybody, set by KRS 141.081 and announced
    // annually: $3,360 for 2026, against a flat 3.5%.
    basis: 'single',
    source: 'https://revenue.ky.gov/News/Pages/Kentucky-DOR-Announces-2026-Standard-Deduction.aspx',
    checked: '2026-08-15',
  },
  Indiana: {
    // "$1,000 for you, $1,000 for your spouse if filing jointly, $1,000 per
    // dependent" — per person, with no filing-status variant.
    basis: 'single',
    source: 'https://www.in.gov/dor/files/ib117.pdf',
    checked: '2026-08-15',
  },
  Pennsylvania: {
    // "The Pennsylvania personal income tax does not provide for a standard
    // deduction or personal exemption." Nothing to differ.
    basis: 'single',
    source: 'https://www.pa.gov/agencies/revenue/resources/tax-types-and-information/personal-income-tax',
    checked: '2026-08-15',
  },
  Michigan: {
    // The strongest "same as single" of the lot: Michigan has no head-of-
    // household status to be different. Form MI-1040 line 7 offers exactly
    // three — "a. Single  b. Married filing jointly  c. Married filing
    // separately" — and the allowance is a flat per-exemption amount anyway.
    basis: 'single',
    source: 'https://www.michigan.gov/taxes/iit/file-your-income-taxes/filingdetermination',
    checked: '2026-08-15',
  },
  Utah: {
    /*
     * Utah differs in BOTH halves of a credit that has two halves. The credit
     * itself is 6% of the federal deduction, so $1,449 for a head of household
     * against $966 single; and the income at which it starts shrinking is
     * $27,320 against $18,213. See STATE_OVERRIDES for the mechanism.
     */
    basis: 'own',
    source: 'https://incometax.utah.gov/credits/taxpayer-tax-credit',
    checked: '2026-08-15',
  },
  'New York': {
    // New York publishes no separate head-of-household RATE schedule — the
    // brackets are shared with single filers — but it does publish its own
    // standard deduction, and $11,200 against $8,000 is real money that this
    // engine was throwing away.
    basis: 'own',
    standardDeduction: 11_200,
    source: 'https://www.tax.ny.gov/forms/html-instructions/2025/it/it201i-2025.htm',
    checked: '2026-08-15',
  },
  Connecticut: {
    basis: 'own',
    // Every threshold sits between the single and joint ones rather than
    // matching either, so neither fallback would have been right.
    brackets: [
      { from: 0, rate: 0.02 },
      { from: 16_000, rate: 0.045 },
      { from: 80_000, rate: 0.055 },
      { from: 160_000, rate: 0.06 },
      { from: 320_000, rate: 0.065 },
      { from: 400_000, rate: 0.069 },
      { from: 800_000, rate: 0.0699 },
    ],
    source: 'https://portal.ct.gov/drs/drs-forms/current-year-forms/calculators-and-tables',
    checked: '2026-08-15',
  },
  'New Jersey': {
    /*
     * NJ-1040 Rate Schedules: Table A is "Single / Married filing separate",
     * Table B is "Married/CU couple filing joint return / HEAD OF HOUSEHOLD /
     * Qualifying widow(er)". The tax table columns say the same thing more
     * bluntly: "1 or 3" against "2, 4, or 5", where 4 is head of household.
     */
    basis: 'marriedJointly',
    source: 'https://www.nj.gov/treasury/taxation/pdf/current/njtaxratesch.pdf',
    checked: '2026-08-15',
  },
  /*
   * These five publish ONE rate schedule and one set of allowances for
   * everybody. Verified rather than assumed, which is the whole point of
   * recording it: Ohio's own return groups "Single, head of household or
   * qualifying surviving spouse" as a single filing status, and Virginia goes
   * further — a head of household IS filing status 1, Single, with a tick-box.
   */
  Ohio: {
    basis: 'single',
    source: 'https://tax.ohio.gov/individual/file-now/annual-tax-rates',
    checked: '2026-08-15',
  },
  Virginia: {
    basis: 'single',
    source: 'https://www.tax.virginia.gov/sites/default/files/vatax-pdf/2025-760-instructions.pdf',
    checked: '2026-08-15',
  },
  Wisconsin: {
    // "For single taxpayers, taxpayers qualified to file as head of household,
    // estates, and trusts" — the state's own rate page, in those words.
    basis: 'single',
    source: 'https://www.revenue.wi.gov/Pages/FAQS/pcs-taxrates.aspx',
    checked: '2026-08-15',
  },
  'South Carolina': {
    /*
     * WAS 'single', AND ACT 110 BROKE THAT. Under the old law treating a head
     * of household as single was defensible: South Carolina's brackets ignore
     * filing status and the state used the federal standard deduction. From
     * 2026 a head of household gets an income adjusted deduction 50% larger
     * than a single filer's — $22,500 against $15,000 — and a phase-out that
     * starts $20,000 higher and runs $47,500 longer.
     *
     * The brackets are still status-blind. It is the allowance that moved,
     * which is the sixth distinct shape this table has had to hold.
     */
    basis: 'own',
    standardDeduction: 22_500,
    source: 'https://www.scstatehouse.gov/sess126_2025-2026/prever/4216_20260224.htm',
    checked: '2026-08-15',
  },
  Missouri: {
    /*
     * One rate chart for everybody, but a much larger standard deduction: MO
     * conforms to the FEDERAL figure, which is $24,150 for a head of household
     * against $16,100 for a single filer. Taking the single figure was costing
     * them roughly $380 a year. There is also a $1,400 additional exemption
     * that only a head of household or qualifying widow(er) may claim.
     */
    basis: 'own',
    standardDeduction: 24_150,
    personalExemption: 1_400,
    source: 'https://dor.mo.gov/forms/4711_2025.pdf',
    checked: '2026-08-15',
  },
  Hawaii: {
    basis: 'own',
    // Schedule III, "Unmarried Heads of Households", tax years after 2024.
    brackets: [
      { from: 0, rate: 0.014 },
      { from: 14_400, rate: 0.032 },
      { from: 21_600, rate: 0.055 },
      { from: 28_800, rate: 0.064 },
      { from: 36_000, rate: 0.068 },
      { from: 54_000, rate: 0.072 },
      { from: 72_000, rate: 0.076 },
      { from: 187_500, rate: 0.079 },
      { from: 262_500, rate: 0.0825 },
      { from: 337_500, rate: 0.09 },
      { from: 412_500, rate: 0.1 },
      { from: 487_500, rate: 0.11 },
    ],
    source: 'https://tax.hawaii.gov/forms/d_25table-on/d_25table-on_p13/',
    checked: '2026-08-15',
  },
  Oklahoma: {
    /*
     * The rate table is headed "Head of Household, Married Filing Jointly OR
     * Widow(er)" — one schedule for all three. But the standard deduction is
     * $9,350, its own figure between the single $6,350 and the joint $12,700,
     * which is why allowances are looked up separately from brackets.
     */
    basis: 'marriedJointly',
    standardDeduction: 9_350,
    source: 'https://oklahoma.gov/tax/individuals/pay-taxes.html',
    checked: '2026-08-15',
  },
  Nebraska: {
    /*
     * This was blocked once and is not any more. The first attempt used
     * Nebraska's 2025 schedule — four brackets topping at 5.20% — against the
     * 2026 single brackets this project ships, where the statute collapses the
     * top two into one 4.55% band. That made a head of household pay MORE than
     * a single filer at $120,000 and the build guard threw it out.
     *
     * Form 1040N-ES now carries a "2026 Nebraska Estimated Income Tax Rate
     * Schedule" with all four filing statuses, and its single and joint columns
     * reproduce the brackets already shipped here to the dollar — $4,130 and
     * $24,760 single, $8,250 and $49,530 joint — so the head-of-household
     * column beside them is the same vintage rather than a year out.
     *
     * The same form gives the 2026 standard deduction: $12,950 for a head of
     * household against $8,850 single, which matches the figures already
     * shipped for the other two statuses.
     */
    basis: 'own',
    brackets: [
      { from: 0, rate: 0.0246 },
      { from: 7_700, rate: 0.0351 },
      { from: 39_620, rate: 0.0455 },
    ],
    standardDeduction: 12_950,
    source: 'https://revenue.nebraska.gov/sites/default/files/doc/tax-forms/2025/f_1040N-ES.pdf',
    checked: '2026-08-15',
  },
  Vermont: {
    /*
     * UNBLOCKED, AND BY NOTICING WHAT WAS ALREADY TRUE OF OUR OWN DATA.
     *
     * This sat out of the table for months on a vintage argument: Vermont's
     * statutory head-of-household table is a base it indexes annually, the
     * base runs about 28% below the brackets shipped here, and setting one
     * against the other made a head of household pay more than a single filer.
     *
     * The premise was wrong. The brackets shipped here for single and joint
     * filers are TAX YEAR 2025 figures — Vermont has published nothing for
     * 2026 and the source said so in a footnote nobody followed up. So the
     * 2025 Schedule Z is not a year out of step with them. It is exactly in
     * step, because they are 2025 too.
     *
     * Vermont has published a head-of-household schedule every year and always
     * had one. What was missing was never the column; it was the realisation
     * that our other columns were the same age.
     *
     * The trap that cost the months: Vermont publishes a document titled
     * "2026 VT Rate Schedules" which contains wage-bracket WITHHOLDING charts,
     * single and married only, and reuses the filename the real income tax
     * schedules used through 2024.
     */
    basis: 'own',
    brackets: [
      { from: 0, rate: 0.0335 },
      { from: 66_200, rate: 0.066 },
      { from: 171_000, rate: 0.076 },
      { from: 276_850, rate: 0.0875 },
    ],
    standardDeduction: 11_450,
    source: 'https://tax.vermont.gov/sites/tax/files/documents/TaxRateSched-2025.pdf',
    checked: '2026-08-15',
  },
  Alabama: {
    /*
     * "For single persons, HEADS OF FAMILIES, and married persons filing
     * separate returns" — one rate schedule. But the personal exemption follows
     * the JOINT figure: "Taxpayers using the Married Filing Jointly and Head of
     * Family filing statuses are entitled to a $3,000 personal exemption",
     * against $1,500 for a single filer. Brackets one way, allowance the other.
     */
    basis: 'own',
    personalExemption: 3_000,
    source: 'https://www.revenue.alabama.gov/faqs/what-is-alabamas-individual-income-tax-rate/',
    checked: '2026-08-15',
  },
  'Rhode Island': {
    /*
     * The rate schedule is headed "FOR ALL FILING STATUS TYPES" — genuinely one
     * schedule — but the standard deduction is $16,350 for a head of household
     * against $10,900 single and $21,800 joint.
     *
     * That is the published 2025 figure and this project ships 2026 brackets,
     * so it is a little low, the same trade Oregon makes: a real figure used a
     * year late, erring against the reader, rather than the single $11,200 that
     * would be wrong by five thousand.
     */
    basis: 'own',
    standardDeduction: 16_350,
    source: 'https://tax.ri.gov/sites/g/files/xkgbur541/files/2026-01/2025%20Tax%20Rate%20and%20Worksheets.pdf',
    checked: '2026-08-15',
  },
  'West Virginia': {
    // Rate Schedule I: "Use this schedule if you checked 1 (Single), 2 (Head of
    // household), 3 (Married filing joint), or 5 (Widow[er])". One schedule for
    // everyone except married-filing-separately.
    basis: 'single',
    source: 'https://tax.wv.gov/Documents/PIT/2025/it140.TaxRateSchedules.2025.pdf',
    checked: '2026-08-15',
  },
  'New Mexico': {
    // Statute 7-2-7, effective 1 January 2025: one table for "married
    // individuals filing joint returns, heads of household and surviving
    // spouses".
    basis: 'marriedJointly',
    source: 'https://www.nmlegis.gov/sessions/24%20Regular/bills/house/HB0252.HTML',
    checked: '2026-08-15',
  },
  Oregon: {
    /*
     * Joint brackets, own deduction — the Oklahoma shape again. Form OR-40
     * itself prints "Head of household $4,560" against a single filer's $2,835
     * and a joint $5,670, so sending the deduction with the brackets would have
     * been $1,110 too generous.
     */
    basis: 'marriedJointly',
    /*
     * The published 2025 figure. Oregon indexes annually and its 2026 head-of-
     * household deduction is not out, so this is very slightly low — against
     * the reader, which is the safe direction. The alternative was letting it
     * fall back to the joint $5,820, which would be $1,260 too generous. No
     * figure is invented here; a real published one is used a year late and
     * said so.
     */
    standardDeduction: 4_560,
    source: 'https://www.oregon.gov/dor/forms/FormsPubs/form-or-40_101-040_2025.pdf',
    checked: '2026-08-15',
  },
  'North Dakota': {
    basis: 'own',
    brackets: [
      { from: 0, rate: 0 },
      { from: 64_950, rate: 0.0195 },
      { from: 271_450, rate: 0.025 },
    ],
    source: 'https://www.tax.nd.gov/individual-income-tax',
    checked: '2026-08-15',
  },
  Montana: {
    /*
     * Its own schedule, and the widest gap of any state checked: HB 337 sets
     * the 4.7% band at $47,500 single, $71,250 head of household and $95,000
     * joint for 2026. Exactly 1.5x the single figure — Montana has published
     * a head-of-household column for years and nobody was reading it.
     *
     * The standard deduction is the federal one (Montana starts from federal
     * taxable income), so that moves too: $24,150 against $16,100.
     */
    basis: 'own',
    brackets: [
      { from: 0, rate: 0.047 },
      { from: 71_250, rate: 0.0565 },
    ],
    standardDeduction: 24_150,
    source: 'https://revenue.mt.gov/news/recent-news/HB-337',
    checked: '2026-08-15',
  },
  Idaho: {
    /*
     * Idaho's flat 5.3% sits above an exempt band, and Form 40's tax worksheet
     * sends a head of household to the JOINT one: "Single or married filing
     * separately, enter $4,811; Married filing jointly, HEAD OF HOUSEHOLD, or
     * qualifying surviving spouse, enter $9,622."
     *
     * The standard deduction is the federal figure and moves as well. Both
     * together were costing a single parent about $680 a year.
     */
    basis: 'marriedJointly',
    standardDeduction: 24_150,
    source: 'https://tax.idaho.gov/wp-content/uploads/forms/EFO00089/EFO00089_03-02-2026.pdf',
    checked: '2026-08-15',
  },
  Kansas: {
    /*
     * Brackets are split "married filing joint" against everybody else, so a
     * head of household is on the single schedule. Both allowances differ
     * though, and the second one is easy to miss: the standard deduction is
     * $6,180 against a single filer's $3,605, AND the booklet adds "If your
     * filing status is Head of Household, you are allowed an ADDITIONAL
     * exemption of $2,320" on top of the $9,160 everyone gets.
     */
    basis: 'own',
    standardDeduction: 6_180,
    personalExemption: 11_480,
    source: 'https://www.ksrevenue.gov/incomebook25.html',
    checked: '2026-08-15',
  },
  Mississippi: {
    /*
     * One flat rate and one exempt band for everybody, but both allowances are
     * larger: the standard deduction is $3,400 against $2,300, and the filing
     * status exemption is $8,000 against a single filer's $6,000.
     *
     * The dependent exemptions are untouched. The state spells this out — the
     * child who makes you a head of family still counts: "you are allowed
     * $8,000 on line 11 and $1,500 for the required dependent listed on line 6
     * which totals $9,500". So $8,000 here plus the usual $1,500 per child.
     */
    basis: 'own',
    standardDeduction: 3_400,
    personalExemption: 8_000,
    source: 'https://www.dor.ms.gov/individual/tax-rates',
    checked: '2026-08-15',
  },
  Massachusetts: {
    // Flat rate, so the schedule cannot differ. The personal exemption does:
    // Form 1 line 2a prints "Single/Married filing separately ($4,400), Head of
    // household ($6,800), Married filing jointly ($8,800)".
    basis: 'own',
    personalExemption: 6_800,
    source: 'https://www.mass.gov/info-details/massachusetts-personal-income-tax-exemptions',
    checked: '2026-08-15',
  },
  'Washington DC': {
    /*
     * DC publishes ONE rate schedule for every filing status, but its own
     * standard deduction by status — and since 2025 those are DC's figures
     * rather than the federal ones (D.C. Act 26-214). The head-of-household
     * amount is exactly 1.5x the single amount at every vintage: $22,500
     * against $15,000 for 2025, and the same ratio applied to the $16,100 this
     * project ships gives $24,150.
     */
    basis: 'own',
    standardDeduction: 24_150,
    source: 'https://otr.cfo.dc.gov/page/district-columbia-tax-rates-individual-income-and-business-franchise-taxes',
    checked: '2026-08-15',
  },
  /*
   * These two were checked and genuinely have nothing of their own, which is
   * worth recording precisely because it looks like nothing happened.
   */
  Delaware: {
    // One rate schedule for all five Delaware filing statuses, and the
    // deduction table gives status 5 (head of household) $3,250 — the same as
    // status 1 (single). The $110 personal credit is per person either way.
    basis: 'single',
    source: 'https://revenuefiles.delaware.gov/2025/PITForms_Instructions/Instructions/PIT-RES_Instructions_2025-01.pdf',
    checked: '2026-08-15',
  },
  Arkansas: {
    /*
     * One rate schedule, and the standard deduction is per TAXPAYER — $2,470
     * each, which is why the joint figure is exactly double. A head of
     * household is one taxpayer, so they get $2,470 and the $29 credit, the
     * same as a single filer.
     *
     * ONE THING ARKANSAS DOES DIFFERENTLY IS NOT MODELLED HERE. It publishes
     * separate low-income tax tables by filing status, and the head-of-
     * household threshold ($25,300) is higher than the single one ($17,500).
     * Below those incomes Arkansas charges less than this engine will show.
     * That is a missing rule rather than a wrong basis, it affects only
     * salaries far below anything this calculator is used for, and it errs
     * against the reader. Recorded so it is not mistaken for verified.
     */
    basis: 'single',
    source: 'https://www.dfa.arkansas.gov/income-tax/individual-income-tax/forms/',
    checked: '2026-08-15',
  },
};


/**
 * MANDATORY EMPLOYEE PAYROLL CONTRIBUTIONS.
 *
 * Eleven states deduct disability or paid-leave contributions from every
 * paycheque by law. They are not income tax, they are not FICA, and this engine
 * modelled none of them. California's is the largest by a distance: 1.3% of
 * ALL wages with no ceiling at all, which is $1,300 a year at $100,000 and
 * $3,900 at $300,000. Every Californian on this site was shown that money as
 * theirs to spend.
 *
 * Rates are the 2026 EMPLOYEE share. Several programmes split the cost with the
 * employer and the split varies with headcount; where it does, the figure here
 * is the employee share at a normal-sized employer, which is what a person
 * reading a payslip will see.
 *
 * DEDUCTIBLE ONES ARE MARKED. The IRS treats mandatory contributions to the
 * California, New Jersey and New York disability funds, the Rhode Island
 * temporary disability fund and the Washington supplemental workers'
 * compensation fund as state income tax for Schedule A. The newer paid-leave
 * programmes have no such ruling, so they are not claimed as deductible —
 * understating a deduction is the safe direction.
 *
 * Maine and Delaware are deliberately absent: their employee share exists only
 * if the employer elects to split the cost, so there is no figure that is true
 * for everyone. DC's programme is employer-funded entirely.
 *
 * Source: EY, "2026 state disability, paid family and medical leave and
 * long-term care insurance wage base and rates", 5 January 2026, cross-checked
 * against each state's own labour department where it publishes one.
 */
const SS_WAGE_BASE_2026 = 184_500;

const PAYROLL_CONTRIBUTIONS = {
  California: [
    { id: 'ca-sdi', name: 'State Disability Insurance', rate: 0.013, wageCap: null, deductible: true },
  ],
  'New Jersey': [
    { id: 'nj-tdi', name: 'Temporary Disability Insurance', rate: 0.0019, wageCap: 171_100, deductible: true },
    { id: 'nj-fli', name: 'Family Leave Insurance', rate: 0.0023, wageCap: 171_100, deductible: true },
  ],
  'New York': [
    // Half a per cent of weekly wages, but capped at 60 cents a week, which
    // binds for anyone earning over $6,240 — so in practice a flat $31.20.
    { id: 'ny-dbl', name: 'Disability Benefits Law', rate: 0.005, wageCap: 6_240, deductible: true },
    { id: 'ny-pfl', name: 'Paid Family Leave', rate: 0.00432, wageCap: 95_348.76, deductible: true },
  ],
  'Rhode Island': [
    { id: 'ri-tdi', name: 'Temporary Disability Insurance', rate: 0.011, wageCap: 100_000, deductible: true },
  ],
  Washington: [
    // 71.43% of a 1.13% total premium.
    { id: 'wa-pfml', name: 'Paid Family and Medical Leave', rate: 0.0113 * 0.7143, wageCap: SS_WAGE_BASE_2026, deductible: true },
  ],
  Hawaii: [
    // Half a per cent, capped at $7.50 a week.
    { id: 'hi-tdi', name: 'Temporary Disability Insurance', rate: 0.005, wageCap: 78_000, deductible: false },
  ],
  Connecticut: [
    { id: 'ct-pfl', name: 'Paid Leave', rate: 0.005, wageCap: SS_WAGE_BASE_2026, deductible: false },
  ],
  Colorado: [
    { id: 'co-famli', name: 'Family and Medical Leave Insurance', rate: 0.0044, wageCap: SS_WAGE_BASE_2026, deductible: false },
  ],
  Massachusetts: [
    { id: 'ma-pfml', name: 'Paid Family and Medical Leave', rate: 0.0046, wageCap: SS_WAGE_BASE_2026, deductible: false },
  ],
  Oregon: [
    { id: 'or-pfml', name: 'Paid Leave Oregon', rate: 0.006, wageCap: SS_WAGE_BASE_2026, deductible: false },
  ],
  Minnesota: [
    { id: 'mn-paid-leave', name: 'Paid Leave', rate: 0.0044, wageCap: SS_WAGE_BASE_2026, deductible: false },
  ],
};

const PAYROLL_SOURCE = {
  citation: 'EY, "2026 state disability, paid family and medical leave and long-term care insurance wage base and rates" (5 January 2026), cross-checked against state labour departments',
  url: 'https://taxnews.ey.com/news/2026-0131-2026-state-disability-paid-family-and-medical-leave-and-long-term-care-insurance-wage-base-and-rates',
  checked: '2026-08-15',
};


/**
 * COMMUNITY PROPERTY STATES.
 *
 * In these nine, a married couple filing separately does not each report what
 * they earned. IRS Publication 555: "A spouse's wages, earnings, and net
 * profits from a sole proprietorship are community income and must be evenly
 * split." Each return carries half the combined wages, whichever spouse
 * actually earned them.
 *
 * The engine already split a couple's income when BOTH of them earned. It
 * treated one earner filing separately as a single return carrying the whole
 * salary, which is right in the other 41 states and wrong here: in Texas at
 * $150,000 that overstated federal tax by $9,394.
 *
 * PAYROLL TAX DOES NOT SPLIT. Publication 555 is explicit that self-employment
 * tax follows the spouse carrying on the business, and the same logic holds for
 * Social Security and Medicare: they are levied on the person who earned the
 * wage, not on whoever reports it. So the income tax halves and the payroll tax
 * does not, which is why this cannot be faked by pretending there are two
 * earners.
 *
 * Alaska, Tennessee, South Dakota and Florida allow couples to ELECT community
 * property treatment. Publication 555 explicitly does not address the election
 * and it is not the default, so they are not included.
 *
 * Source: IRS Publication 555 (rev. December 2024).
 * https://www.irs.gov/pub/irs-pdf/p555.pdf
 */
const COMMUNITY_PROPERTY = new Set([
  'Arizona',
  'California',
  'Idaho',
  'Louisiana',
  'Nevada',
  'New Mexico',
  'Texas',
  'Washington',
  'Wisconsin',
]);


/**
 * FIGURES READ OFF THE STATE'S OWN PUBLICATION, overriding the aggregator.
 *
 * Tax Foundation is a good secondary source for brackets and it is where every
 * bracket here comes from. It is not the state, and where the two disagree the
 * state wins.
 *
 * California is the first one checked in detail and it found three things: a
 * dependent credit that was carrying the PERSONAL credit's value, a standard
 * deduction a year out of date, and no head-of-household deduction at all when
 * California gives one the same as a joint filer's.
 */
/**
 * Source footnotes that a later law has made untrue, keyed by state and matched
 * on a distinctive fragment. See where this is applied for why it exists.
 */
const SUPERSEDED_NOTES = {
  'South Carolina': [
    'top marginal rate is scheduled to revert',
    'include the federal standard deduction in their income starting point',
  ],

  /*
   * ALABAMA'S DEPENDENT EXEMPTION DOES NOT REACH ZERO, and the aggregated
   * table said it did.
   *
   * The table's footnote read "phased out completely for taxpayers with AGI
   * greater than $100,000". Alabama's own Form 40 booklet, in the chart at the
   * instructions for line 14, gives three bands and a floor:
   *
   *     0 – 50,000        $1,000
   *     50,001 – 100,000    $500
   *     over 100,000        $300
   *
   * Checked 2026-08-15 against the booklet already cited for Alabama's
   * itemised deductions:
   * https://www.revenue.alabama.gov/wp-content/uploads/2026/01/25f40bk.pdf
   *
   * Two things made this worth chasing rather than shrugging at. First, the
   * state shipped BOTH claims at once — the table's footnote and our own
   * reading of the booklet sat four lines apart in the same list, saying
   * opposite things about the same rule, which tells a reader the page does
   * not know its own answer. Second, the direction is not neutral: this
   * project ships the flat $1,000 for everyone, so the size of the gap it owes
   * a warning about depends on which figure is true. Against $300 the
   * overstatement of the allowance is $700 a dependent; against $0 it would
   * have been $1,000.
   *
   * The band is measured against ALABAMA adjusted gross income — line 10 of
   * Form 40, after Alabama's own subtractions — not federal AGI. The note that
   * survives says so.
   */
  Alabama: ['is phased out completely for taxpayers with AGI greater than $100,000'],
};

const STATE_OVERRIDES = {
  California: {
    // FTB Tax News, October 2025: "2025 Indexing".
    standardDeduction: { single: 5_706, marriedJointly: 11_412, headOfHousehold: 11_412 },
    personalCredit: {
      single: 153,
      marriedJointly: 306,
      headOfHousehold: 153,
      // $475, not $153. The dependent credit was carrying the personal credit's
      // figure, understating a family with two children by $644 a year.
      dependent: 475,
    },
    source: 'https://www.ftb.ca.gov/about-ftb/newsroom/tax-news/2025/10.html',
    checked: '2026-08-15',
    note: "California's exemption credits shrink above $252,203 of income ($504,411 for a couple, $378,310 for a head of household) and that is not modelled, so California tax shown here is lower than the true figure above those incomes.",
  },

  /*
   * THE NEXT TWO ARE THE SAME STORY, and it is worth telling once.
   *
   * The bracket table this project ships was published in February 2026, and
   * it says so about five states: they had not yet updated their conformity to
   * the federal code after OBBBA, so their standard deduction had fallen back
   * to the PRE-TCJA amount — $8,350 single, $16,700 joint — rather than the
   * $16,100 and $32,200 the federal figure actually reached. The table's own
   * footnote flags this as pending: "states in this situation may pass
   * legislation this year to update their conformity dates".
   *
   * Two of them have since done exactly that, or never applied in the first
   * place. A snapshot is reproducible, which is the point of committing it,
   * but reproducible is not the same as current, and a $7,750 hole in a
   * standard deduction is real money in the wrong direction — it OVERCHARGES
   * every filer in the state.
   */
  Arizona: {
    /*
     * Arizona DID update. HB 4168, signed June 2026, aligns Title 43 with
     * OBBBA and sets the standard deduction base to $15,750 single / $23,625
     * head of household / $31,500 joint, RETROACTIVE to tax years after
     * 31 December 2024 — which indexed for 2026 is $16,100 / $24,150 /
     * $32,200. HB 2785 moves the conformity date to 1 January 2026 and
     * redefines the standard deduction as the federal basic amount outright.
     *
     * At Arizona's flat 2.5% the $8,350 shipped was overcharging a single
     * filer about $194 a year and a couple about $388.
     */
    standardDeduction: { single: 16_100, marriedJointly: 32_200, headOfHousehold: 24_150 },
    /*
     * THE SOURCE RECORDED HERE USED TO BE HB 2785, WHICH WAS VETOED on
     * 12 February 2026. The figures were right and the citation was not, which
     * is its own kind of wrong: the whole point of recording a source is that
     * the next person can re-check rather than re-trust.
     *
     * The law that passed is HB 4168, chapter 140 of 2026, signed 13 June
     * 2026, raising the base to $15,750 / $23,625 / $31,500 and indexing it
     * the way the federal figure is indexed, retroactive to tax years
     * beginning after 31 December 2024.
     */
    source: 'https://www.azleg.gov/legtext/57leg/2R/laws/0140.htm',
    checked: '2026-08-15',
    note: "Arizona's dependent credit rose to $125 for a child under 17 for 2026 and we still apply $100, so Arizona tax shown here is $25 a year per young child too much. The same credit shrinks above $200,000 of income ($400,000 for a couple), which is not modelled, so above those incomes the figure shown is slightly low.",
  },
  Georgia: {
    /*
     * Not a conformity story — Georgia simply legislated after the snapshot.
     * The law was signed 11 May 2026 and applies to tax years beginning in
     * 2026, and it moved three things at once, all of them the reader's way:
     *
     *   rate                5.19%   ->  4.99%
     *   standard deduction  $12,000 ->  $15,000  (single, HoH and separate)
     *                       $24,000 ->  $30,000  (joint)
     *   per dependent       $4,000  ->  $5,000
     *
     * Missing all three together was costing a Georgia single filer about $285
     * a year and a couple with two children about $635.
     *
     * Georgia's own Employer's Tax Guide names heads of household explicitly in
     * the $15,000 group, so the head-of-household entry is a genuine "same as
     * single" rather than an assumption.
     */
    brackets: {
      single: [{ from: 0, rate: 0.0499 }],
      marriedJointly: [{ from: 0, rate: 0.0499 }],
    },
    standardDeduction: { single: 15_000, marriedJointly: 30_000, headOfHousehold: 15_000 },
    personalExemption: { dependent: 5_000 },
    source: 'https://dor.georgia.gov/document/document/2026-employers-tax-guide/download',
    checked: '2026-08-15',
  },
  Colorado: {
    /*
     * COLORADO CLAWS BACK ALMOST THE WHOLE DEDUCTION ABOVE $300,000, and the
     * cap collapses this year.
     *
     * Colorado starts from federal taxable income, so the federal standard
     * deduction is already inside the number it taxes. Above $300,000 of
     * federal income you must ADD BACK everything your federal deduction
     * exceeds a cap — and HB25-1274 cut that cap from $12,000/$16,000 to
     * $1,000 single / $2,000 joint for 2026 and later.
     *
     * So a single Colorado filer over $300,000 adds back $15,100 of the
     * $16,100 they were getting. We were giving them the lot: about $664 a
     * year of tax not charged, and $1,329 for a couple.
     *
     * HEAD OF HOUSEHOLD AND MARRIED-SEPARATE USE THE SINGLE CAP. Colorado's
     * booklet groups them explicitly — "single, married filing separately or
     * head of household … $12,000" in the old regime — with joint handled in
     * its own paragraph. Only a joint return gets the doubled figure.
     *
     * Modelled as a cliff: the deduction drops to the cap the moment income
     * passes $300,000, which is what the statute does.
     */
    allowancePhaseOut: {
      kind: 'linear',
      appliesTo: ['standardDeduction'],
      floor: { single: 1_000, marriedJointly: 2_000, headOfHousehold: 1_000 },
      segments: {
        // A rate large enough to remove the whole deduction on the first
        // dollar over the threshold, which is what a cliff is.
        single: [{ base: 16_100, start: 300_000, perDollar: 16_100 }],
        headOfHousehold: [{ base: 24_150, start: 300_000, perDollar: 24_150 }],
        marriedJointly: [{ base: 32_200, start: 300_000, perDollar: 32_200 }],
      },
    },
    source: 'https://tax.colorado.gov/individual-income-tax-guide',
    checked: '2026-08-15',
    note: "Colorado's add-back is reduced by any state income tax you deducted on your federal return, which this engine does not model — so for someone who itemises federally, Colorado tax shown here above $300,000 is higher than the true figure. Colorado also adds back the federal overtime deduction from 2026, which is not modelled.",
  },
  Idaho: {
    /*
     * THE GROCERY CREDIT, WHICH EVERYONE GETS AND WE GAVE NOBODY. Idaho Code
     * 63-3024A: "For tax year 2025 and each year thereafter, the credit is one
     * hundred fifty-five dollars ($155)" — for the filer, the spouse and every
     * dependent, with no income test of any kind, and refundable.
     *
     * A single filer was overcharged $155 a year and a family of four $620,
     * at every income. Idaho has renamed it the food tax credit and dropped
     * the old bump for over-65s, so it is a flat $155 for everybody.
     */
    personalCredit: { single: 155, marriedJointly: 310, headOfHousehold: 155, dependent: 155 },
    source: 'https://legislature.idaho.gov/statutesrules/idstat/title63/t63ch30/sect63-3024a/',
    checked: '2026-08-15',
    note: "Idaho's grocery credit can instead be claimed on receipts for up to $250 a person rather than the flat $155 used here, so Idaho tax shown is higher than the true figure for anyone who keeps their receipts. It is also reduced for months spent on food stamps, incarcerated or outside Idaho, which is not modelled and runs the other way.",
  },
  Hawaii: {
    /*
     * A ONE-NUMBER ERROR THAT NEARLY DOUBLED THE ALLOWANCE. Hawaii's 2024 law
     * raises the standard deduction in steps and 2026 is a step year: $8,000
     * single, $16,000 joint, $12,000 head of household, against the $4,400 and
     * $8,800 shipped, which are the 2024-2025 figures.
     *
     * Confirmed three times over — HRS 235-2.4, Announcement 2024-03 and
     * Announcement 2025-07 — so this is not a reading of pending legislation.
     * It was overcharging a Hawaii couple about $490 a year.
     */
    standardDeduction: { single: 8_000, marriedJointly: 16_000, headOfHousehold: 12_000 },
    source: 'https://www.capitol.hawaii.gov/hrscurrent/Vol04_Ch0201-0257/HRS0235/HRS_0235-0002_0004.htm',
    checked: '2026-08-15',
  },
  'West Virginia': {
    /*
     * The fifth state to legislate after the February table, and the third to
     * cut. SB 392 of the 2026 session, signed 31 March 2026, reduces every
     * rate by exactly 5%, RETROACTIVE to 1 January 2026. Thresholds unchanged.
     *
     * Each new rate is 95% of the old to the fourth decimal, which is the check
     * that all five were transcribed rather than guessed. West Virginia runs
     * one schedule for single, head of household and joint alike.
     */
    brackets: {
      single: [
        { from: 0, rate: 0.0211 },
        { from: 10_000, rate: 0.0281 },
        { from: 25_000, rate: 0.0316 },
        { from: 40_000, rate: 0.0422 },
        { from: 60_000, rate: 0.0458 },
      ],
      marriedJointly: [
        { from: 0, rate: 0.0211 },
        { from: 10_000, rate: 0.0281 },
        { from: 25_000, rate: 0.0316 },
        { from: 40_000, rate: 0.0422 },
        { from: 60_000, rate: 0.0458 },
      ],
    },
    source: 'https://tax.wv.gov/Individuals/Pages/PersonalIncomeTaxReductionBill.aspx',
    checked: '2026-08-15',
  },
  Utah: {
    /*
     * The sixth state to move after February. SB 60 of the 2026 session cuts
     * the rate from 4.50% to 4.45%, signed 23 March 2026 with retrospective
     * operation for tax years beginning on or after 1 January 2026.
     *
     * The taxpayer tax credit below is unaffected — SB 60 touches only the
     * rate sections.
     */
    brackets: {
      single: [{ from: 0, rate: 0.0445 }],
      marriedJointly: [{ from: 0, rate: 0.0445 }],
    },
    personalExemption: { dependent: 0 },
    personalCredit: {
      single: 966,
      marriedJointly: 1_932,
      headOfHousehold: 1_449,
      dependent: 127,
    },
    creditPhaseOut: {
      perDollar: 0.013,
      threshold: { single: 18_213, marriedJointly: 36_426, headOfHousehold: 27_320 },
    },
    source: 'https://le.utah.gov/~2026/bills/sbillenr/SB0060.pdf',
    checked: '2026-08-15',
    note: "Utah's taxpayer tax credit phase-out thresholds and dependent exemption are the 2025 figures — the state has not published 2026 amounts. Utah indexes them upward, so the reduction starts slightly early here and the credit comes out slightly small.",
  },
  'Rhode Island': {
    /*
     * The head-of-household standard deduction was the 2025 figure, $16,350,
     * used deliberately at the time because 2026 was not out. It is now:
     * $16,800, from Rhode Island's own 2026 estimated-tax form.
     *
     * THE PHASE-OUT IS A STAIRCASE, NOT A SLOPE, which is why it needed its
     * own shape. Above $261,000 the deduction AND every exemption drop in four
     * twenty-point steps and vanish entirely above $290,800 — so a household
     * can lose a fifth of both by earning one dollar more. Ignoring it was
     * undercharging, which is the direction that flatters.
     */
    // Only the head-of-household figure. The single and joint amounts the
    // source already carries are correct, and the build warns when a
    // hand-typed override starts merely repeating what the source says.
    standardDeduction: { headOfHousehold: 16_800 },
    allowancePhaseOut: {
      kind: 'stepped',
      appliesTo: ['standardDeduction', 'personalExemption'],
      start: { single: 261_000, marriedJointly: 261_000, headOfHousehold: 261_000 },
      stepSize: 7_450,
      factors: [0.8, 0.6, 0.4, 0.2],
    },
    source: 'https://tax.ri.gov/sites/g/files/xkgbur541/files/2025-10/2026%20RI-1040ES_bd.pdf',
    checked: '2026-08-15',
  },
  Wisconsin: {
    note: "Wisconsin's itemised deduction credit is 5% of qualifying deductions above the standard deduction, and it deliberately excludes every state and local tax — so a Wisconsin homeowner's property tax counts for nothing here, which is Wisconsin's rule rather than a gap. Charitable giving, medical costs and casualty losses also qualify and are not asked about, so Wisconsin tax shown here is higher than the true figure for anyone who has them.",
    /*
     * THE LARGEST UNDERCHARGE FOUND ANYWHERE — a Wisconsin couple on $150,000
     * was being shown a bill $1,268 too low, which makes Wisconsin look better
     * than it is against every other state on the site.
     *
     * The standard deduction does not just shrink, it disappears: $13,960 for
     * a single filer less 12% of everything over $20,120, reaching exactly zero
     * at $136,453. For a couple, $25,840 less 19.778% over $29,040, zero at
     * $159,690.
     *
     * A HEAD OF HOUSEHOLD FOLLOWS TWO LINES, NOT ONE. It falls steeply from
     * $18,030 at 22.515%, and past $58,827 it joins the line a single filer is
     * already on. Those two lines cross exactly where the statute switches, so
     * taking whichever gives more reproduces the rule without special-casing —
     * which is why the phase-out shape allows more than one segment.
     */
    // Only the head-of-household figure — the source already has the other two
    // right, and the build warns when an override merely repeats the source.
    standardDeduction: { headOfHousehold: 18_030 },
    allowancePhaseOut: {
      kind: 'linear',
      appliesTo: ['standardDeduction'],
      combine: 'max',
      segments: {
        single: [{ base: 13_960, start: 20_120, perDollar: 0.12 }],
        marriedJointly: [{ base: 25_840, start: 29_040, perDollar: 0.19778 }],
        headOfHousehold: [
          { base: 18_030, start: 20_120, perDollar: 0.22515 },
          { base: 13_960, start: 20_120, perDollar: 0.12 },
        ],
      },
    },
    source: 'https://www.revenue.wi.gov/TaxForms2026/2026-Form1-ES-Inst.pdf',
    checked: '2026-08-15',
  },
  Connecticut: {
    /*
     * CONNECTICUT'S PERSONAL EXEMPTION VANISHES and we were handing it out at
     * every income. It falls by $1,000 for every $1,000 earned above $30,000
     * single, $48,000 joint, $38,000 head of household — a dollar for a dollar,
     * so it is gone entirely by $44,000 / $71,000 / $57,000.
     *
     * At the incomes this site is used at, Connecticut gives NOTHING, and we
     * were still deducting $15,000 or $24,000. That is an undercharge of
     * roughly $950 to $1,820 a year, in the direction that flatters.
     *
     * Two further Connecticut charges remain unmodelled and are recorded in
     * the note: a "2% add-back" and a recapture that claws back the lower
     * rates from high earners. Both would add tax, so what ships here is still
     * short of the truth rather than past it.
     */
    personalExemption: { single: 15_000, marriedJointly: 24_000, headOfHousehold: 19_000 },
    allowancePhaseOut: {
      kind: 'linear',
      appliesTo: ['personalExemption'],
      segments: {
        single: [{ base: 15_000, start: 30_000, perDollar: 1 }],
        marriedJointly: [{ base: 24_000, start: 48_000, perDollar: 1 }],
        headOfHousehold: [{ base: 19_000, start: 38_000, perDollar: 1 }],
      },
    },
    source: 'https://portal.ct.gov/-/media/drs/forms/2025/income/ct-1040-tcs_1225.pdf',
    checked: '2026-08-15',
    note: "Connecticut allows no itemised deductions and no standard deduction at all — the personal exemption is the only across-the-board subtraction — so a homeowner gets no relief for a mortgage here, and that is Connecticut's rule rather than a gap. Its property tax credit of up to $300 is not modelled, so Connecticut tax shown here is higher than the true figure for anyone who owns a home or a car.",
  },
  Ohio: {
    /*
     * OHIO CHARGES A LUMP AND WE CHARGED NONE, so every Ohio bill was about
     * $332 too low — an undercharge on every single filer in the state.
     *
     * The schedule is 0% up to $26,050 and then "$332.00 plus 2.75% of the
     * amount in excess of $26,050". That $332 is a step, not a rate, and it
     * cannot be written as a bracket without charging it to people below the
     * threshold who owe nothing at all.
     *
     * OHIO HAS PUBLISHED 2026, just not in a form. ORC 5747.02(A)(3)(c), as
     * amended by House Bill 96 and effective 30 September 2025, sets "$332.00
     * plus 2.75%" for "2026 and thereafter" — down from $342 for 2025 — and
     * drops the old 3.125% top band entirely. The Department's own rates page
     * still stops at 2025, which is why this looked unpublished.
     */
    lumpSumTax: { above: 26_050, amount: 332 },
    source: 'https://codes.ohio.gov/ohio-revised-code/section-5747.02',
    checked: '2026-08-15',
    note: "Ohio's personal exemption steps down with income — $2,400 up to $40,000, $2,150 to $80,000, $1,900 to $749,999 and nothing at all from $750,000 — and only the $2,400 is used here, so Ohio tax shown is slightly lower than the true figure above $40,000. Ohio's joint filing credit is measured on income after exemptions and this uses gross, which can land a couple one band low and so overstate their tax slightly.",
  },
  Oregon: {
    /*
     * The exemption credit is $263 for 2026, from Oregon's own 2026
     * withholding formulas. Those formulas reproduce every published 2025
     * figure exactly when checked against the 2025 return — the brackets, the
     * $256 credit, the $8,500 federal cap and the rate-chart constants — which
     * is what makes them trustworthy for 2026.
     *
     * One caution recorded rather than hidden: the 2026 document still shows
     * $256 in an un-updated worked example while its formulas say $263.
     */
    personalCredit: { single: 263, marriedJointly: 526, headOfHousehold: 263, dependent: 263 },
    /*
     * And it is a CLIFF, not a taper: "If your federal AGI is more than
     * $200,000 ($100,000 if your filing status is single or married filing
     * separately), enter 0." We handed the credit out at every income. A head
     * of household falls under "all others", so $200,000.
     */
    creditPhaseOut: {
      hardCliff: true,
      perDollar: 1,
      threshold: { single: 100_000, marriedJointly: 200_000, headOfHousehold: 200_000 },
    },
    source: 'https://www.oregon.gov/dor/forms/FormsPubs/withholding-tax-formulas_206-436_2026.pdf',
    checked: '2026-08-15',
    note: "Oregon's subtraction for federal income tax is measured against a federal bill computed without deducting any state tax, which is exact for anyone taking the federal standard deduction and slightly high for anyone who itemises. Oregon caps the subtraction at $8,500 and a single filer clears that cap by about $70,000 of income, so for almost everyone the approximation never reaches the answer.",
  },
  Arkansas: {
    /*
     * THE SEVENTH STATE TO LEGISLATE AFTER THE FEBRUARY TABLE. Act 1 of the
     * First Extraordinary Session of 2026, signed 6 May 2026, cut the top rate
     * from 3.9% to 3.7% RETROACTIVE to 1 January 2026, and reshaped the low
     * brackets with it.
     *
     * Arkansas runs two schedules by income level. Below $94,700 of net income
     * the graduated ladder applies; above it, a flatter one. Between $94,701
     * and $97,600 the state claws the low brackets back through a "bracket
     * adjustment" that is not modelled here — it is worth at most $290 and
     * covers a $2,900 band of income.
     *
     * We were overcharging roughly $288 to $435 a year.
     */
    brackets: {
      single: [
        { from: 0, rate: 0 },
        { from: 5_600, rate: 0.02 },
        { from: 11_200, rate: 0.03 },
        { from: 16_000, rate: 0.034 },
        { from: 26_400, rate: 0.037 },
      ],
      marriedJointly: [
        { from: 0, rate: 0 },
        { from: 5_600, rate: 0.02 },
        { from: 11_200, rate: 0.03 },
        { from: 16_000, rate: 0.034 },
        { from: 26_400, rate: 0.037 },
      ],
    },
    source: 'https://www.dfa.arkansas.gov/wp-content/uploads/Withholding-Tax-Formula.pdf',
    checked: '2026-08-15',
    note: 'Arkansas reduces the benefit of its lower brackets across a narrow band of income between about $94,700 and $97,600. That adjustment is not modelled, so tax shown for incomes inside that band is slightly lower than the true figure.',
  },
  Alabama: {
    /*
     * ALABAMA'S STANDARD DEDUCTION SHRINKS TO A FLOOR, and we shipped only the
     * maximum. Every filer this site serves is already at the bottom of the
     * chart: $2,500 for a single filer against the $3,000 we gave, and $5,000
     * for a couple against $8,500.
     *
     * It stops at a fixed number rather than at a share of itself, and the
     * three floors are different fractions of three different starting
     * amounts, which is why the phase-out needed a dollar floor rather than a
     * percentage one.
     *
     * The dependent exemption steps down too — $1,000 up to $50,000 of income,
     * $500 to $100,000, $300 above — and never reaches zero. A shipped note
     * said it "phased out completely above $100,000", which was wrong in both
     * directions at once. The steps are not modelled; the note is corrected.
     */
    // Only the head-of-household figure — the source already carries the other
    // two, and the build warns when an override merely repeats it.
    standardDeduction: { headOfHousehold: 5_200 },
    allowancePhaseOut: {
      kind: 'linear',
      appliesTo: ['standardDeduction'],
      floor: { single: 2_500, marriedJointly: 5_000, headOfHousehold: 2_500 },
      segments: {
        single: [{ base: 3_000, start: 26_000, perDollar: 25 / 500 }],
        marriedJointly: [{ base: 8_500, start: 26_000, perDollar: 175 / 500 }],
        headOfHousehold: [{ base: 5_200, start: 26_000, perDollar: 135 / 500 }],
      },
    },
    source: 'https://www.revenue.alabama.gov/wp-content/uploads/2026/01/25f40bk.pdf',
    checked: '2026-08-15',
    note: "Alabama's dependent exemption steps down with Alabama adjusted gross income — $1,000 up to $50,000, $500 to $100,000, $300 above — and never reaches zero. Only the $1,000 figure is used here, so Alabama tax shown is lower than the true figure above $50,000, by the tax on $500 or $700 a dependent. Alabama also allows a deduction for the federal income tax you paid, which is not included, so the figure shown is higher than the truth in the other direction.",
  },
  'New York': {
    /*
     * New York publishes its OWN head-of-household schedule and we carried
     * none, so the engine silently fell back to the single one. The data said
     * basis 'own' — it just had nothing of its own to use, which is the
     * quietest way for a rule to go missing.
     *
     * The 5.4% band runs to $107,650 for a head of household against $80,650
     * single, so a New York single parent on $150,000 was overcharged about
     * $220 a year.
     */
    brackets: {
      headOfHousehold: [
        { from: 0, rate: 0.039 },
        { from: 12_800, rate: 0.044 },
        { from: 17_650, rate: 0.0515 },
        { from: 20_900, rate: 0.054 },
        { from: 107_650, rate: 0.059 },
        { from: 269_300, rate: 0.0685 },
        { from: 1_616_450, rate: 0.0965 },
        { from: 5_000_000, rate: 0.103 },
        { from: 25_000_000, rate: 0.109 },
      ],
    },
    source: 'https://www.tax.ny.gov/pdf/current_forms/it/it2105i.pdf',
    checked: '2026-08-15',
    note: "New York recaptures the benefit of its lower brackets from higher earners, so that above about $107,650 they pay their top rate on all their income rather than only the part above each threshold. That is not modelled, so New York tax shown here is lower than the true figure above that income — by roughly $481 a year at $150,000. New York City's school tax credit is not modelled either, which pulls the other way for city residents by $221 to $380 a year.",
  },
  'North Dakota': {
    /*
     * A YEAR STALE. North Dakota indexes its brackets every year and the 2026
     * figures are published on the 2026 Form ND-1ES — we were shipping 2025.
     *
     * The state's own "Individual Income Tax" web page still displays the 2025
     * schedule and says so in its text, which is exactly how this stays
     * invisible: the page a checker would naturally open agrees with the wrong
     * answer.
     *
     * Also fixed here: North Dakota starts from FEDERAL taxable income, so the
     * federal standard deduction is already inside the number it taxes — and
     * the federal head-of-household figure is $24,150, not the $16,100 a head
     * of household was falling back to.
     */
    brackets: {
      single: [
        { from: 0, rate: 0 },
        { from: 49_575, rate: 0.0195 },
        { from: 250_400, rate: 0.025 },
      ],
      marriedJointly: [
        { from: 0, rate: 0 },
        { from: 82_800, rate: 0.0195 },
        { from: 304_850, rate: 0.025 },
      ],
    },
    standardDeduction: { headOfHousehold: 24_150 },
    source: 'https://www.tax.nd.gov/sites/www/files/documents/forms/software-developer/individual-income-forms/28709-form-nd-1es-2026%20final.pdf',
    checked: '2026-08-15',
  },
  'New Mexico': {
    /*
     * THE MIRROR IMAGE OF NORTH DAKOTA'S BUG, running the other way.
     *
     * New Mexico puts a head of household on the JOINT bracket table, which is
     * right — and because no head-of-household allowance was recorded, the
     * engine handed them the joint deduction to match. New Mexico's deduction
     * is the FEDERAL one, and the federal head-of-household figure is $24,150,
     * not the couple's $32,200. We were undercharging by about $380 a year.
     *
     * Two states, the same missing line, opposite directions. Neither would
     * have shown up as an obviously wrong number.
     */
    standardDeduction: { headOfHousehold: 24_150 },
    source: 'https://www.tax.newmexico.gov/all-nm-taxes/current-historic-tax-rates-overview/personal-income-tax-rates/',
    checked: '2026-08-15',
  },
  'New Jersey': {
    // 5.525%, not 5.53%. Worth about $2 a year, and wrong is wrong.
    brackets: {
      single: [
        { from: 0, rate: 0.014 },
        { from: 20_000, rate: 0.0175 },
        { from: 35_000, rate: 0.035 },
        { from: 40_000, rate: 0.05525 },
        { from: 75_000, rate: 0.0637 },
        { from: 500_000, rate: 0.0897 },
        { from: 1_000_000, rate: 0.1075 },
      ],
      marriedJointly: [
        { from: 0, rate: 0.014 },
        { from: 20_000, rate: 0.0175 },
        { from: 50_000, rate: 0.0245 },
        { from: 70_000, rate: 0.035 },
        { from: 80_000, rate: 0.05525 },
        { from: 150_000, rate: 0.0637 },
        { from: 500_000, rate: 0.0897 },
        { from: 1_000_000, rate: 0.1075 },
      ],
    },
    source: 'https://www.nj.gov/treasury/taxation/pdf/current/1040esi.pdf',
    checked: '2026-08-15',
    note: 'New Jersey allows no mortgage interest deduction and no charitable deduction at all, so a homeowner gets relief for property tax only. The extra exemptions for veterans, for filers over 65 or blind, and for a dependent in full-time education are not modelled, so New Jersey tax shown here is higher than the true figure for anyone entitled to them.',
  },
  Massachusetts: {
    // The surtax threshold is indexed and we shipped the 2025 figure. It only
    // bites above a million, but it is a plain factual error.
    brackets: {
      single: [
        { from: 0, rate: 0.05 },
        { from: 1_107_750, rate: 0.09 },
      ],
      marriedJointly: [
        { from: 0, rate: 0.05 },
        { from: 1_107_750, rate: 0.09 },
      ],
    },
    source: 'https://www.mass.gov/info-details/massachusetts-tax-rates',
    checked: '2026-08-15',
        note: "Massachusetts has no itemised deductions and no standard deduction — a personal exemption and a short list of named deductions are all there is. Its rent deduction of half a year's rent up to $4,000, its commuter deduction and its $440-per-child credit are not calculated, so Massachusetts tax shown here is higher than the true figure for renters, commuters and families.",
  },
  Maryland: {
    /*
     * THE EXEMPTION DOES NOT TAPER, IT FALLS DOWNSTAIRS. $3,200 each up to
     * $100,000 of federal income, then $1,600, then $800, then nothing above
     * $150,000 — and the reduced amount applies to EVERY exemption, children
     * included. Thresholds are $150,000 to $200,000 for a couple or a head of
     * household.
     *
     * We gave the full $3,200 at every income, which undercharged a single
     * filer on $150,000 by about $199 a year and more above that.
     *
     * The standard deduction also moved: $3,400 for 2026, from Maryland's own
     * withholding guide. The joint figure is indexed off $6,700 and has not
     * been announced — the legislature's own fiscal note says so — and it is
     * left alone rather than computed.
     */
    standardDeduction: { single: 3_400 },
    allowancePhaseOut: {
      kind: 'stepped',
      appliesTo: ['personalExemption'],
      start: { single: 100_000, marriedJointly: 150_000, headOfHousehold: 150_000 },
      stepSize: 25_000,
      factors: [0.5, 0.25],
    },
    source: 'https://www.marylandcomptroller.gov/content/dam/mdcomp/tax/instructions/withholding/2026/withholding-guide.pdf',
    checked: '2026-08-15',
    note: "Maryland's itemised deductions here cover property tax and mortgage interest only. Charitable giving and medical costs are not asked about and are not included, so Maryland tax shown here is higher than the true figure for anyone who has them. Maryland's 2026 standard deduction for couples has not been announced — the legislature's own fiscal note says so — so the 2025 figure is used.",
  },
  Maine: {
    /*
     * MAINE'S DEDUCTION DISAPPEARS TOO, and this was the largest undercharge
     * the audit found after Wisconsin: about $715 a year for a single filer on
     * $150,000, growing across the band and then flattening.
     *
     * 36 M.R.S. 5124-C(2): subtract the threshold from Maine adjusted gross
     * income, divide by the range, cap the fraction at 1, and multiply the
     * deduction by it. So the deduction is gone entirely at $177,250 single,
     * $265,900 head of household, $354,550 joint.
     *
     * All three run at the same rate — 15,700/75,000, 23,550/112,500 and
     * 31,400/150,000 all equal 0.2093 — which is the check that the six
     * figures belong together.
     *
     * A NOTE HERE WAS WRONG and is replaced: it said the phase-out ran from
     * $100,000 single and $150,000 joint "reaching zero $75,000 later". The
     * thresholds are $102,250 and $204,550, and the range is $75,000 only for
     * a single filer.
     */
    standardDeduction: { single: 15_700, marriedJointly: 31_400, headOfHousehold: 23_550 },
    allowancePhaseOut: {
      kind: 'linear',
      appliesTo: ['standardDeduction'],
      segments: {
        single: [{ base: 15_700, start: 102_250, perDollar: 15_700 / 75_000 }],
        headOfHousehold: [{ base: 23_550, start: 153_400, perDollar: 23_550 / 112_500 }],
        marriedJointly: [{ base: 31_400, start: 204_550, perDollar: 31_400 / 150_000 }],
      },
    },
    brackets: {
      single: [
        { from: 0, rate: 0.058 },
        { from: 27_400, rate: 0.0675 },
        { from: 64_850, rate: 0.0715 },
        { from: 1_000_000, rate: 0.0915 },
      ],
      marriedJointly: [
        { from: 0, rate: 0.058 },
        { from: 54_850, rate: 0.0675 },
        { from: 129_750, rate: 0.0715 },
        { from: 1_500_000, rate: 0.0915 },
      ],
    },
    source: 'https://www.maine.gov/revenue/sites/maine.gov.revenue/files/2026-05/ind_tax_rate_sched_2026_rev.pdf',
    checked: '2026-08-15',
    note: "Maine's personal exemption also phases out, from $341,000 of income for a single filer and $409,150 for a couple. That is not modelled, so Maine tax shown above those incomes is slightly lower than the true figure.",
  },
  Minnesota: {
    /*
     * Two reductions stacked, not one. Minn. Stat. 290.0123 subd. 5 takes 3%
     * of income above $244,400 and then 10% of income above $337,800, and caps
     * the whole reduction at 80% of the deduction — so a fifth of it always
     * survives, however high income goes.
     *
     * Expressed as two lines and taking the SMALLER, which is the opposite of
     * Wisconsin: there the two lines are alternative formulas that cross, here
     * they stack. The second line only exists above its own threshold.
     *
     * It bites nothing below $244,400, and up to $1,206 a year for a single
     * filer and $2,411 for a couple above it.
     */
    allowancePhaseOut: {
      kind: 'linear',
      appliesTo: ['standardDeduction'],
      combine: 'min',
      floorFraction: 0.2,
      segments: {
        single: [
          { base: 15_300, start: 244_400, perDollar: 0.03 },
          { base: 15_300 - 0.03 * 93_400, start: 337_800, perDollar: 0.1 },
        ],
        headOfHousehold: [
          { base: 23_000, start: 244_400, perDollar: 0.03 },
          { base: 23_000 - 0.03 * 93_400, start: 337_800, perDollar: 0.1 },
        ],
        marriedJointly: [
          { base: 30_600, start: 244_400, perDollar: 0.03 },
          { base: 30_600 - 0.03 * 93_400, start: 337_800, perDollar: 0.1 },
        ],
      },
    },
    source: 'https://www.revisor.mn.gov/statutes/cite/290.0123',
    checked: '2026-08-15',
    note: "Minnesota's dependent exemption also phases out, by 2 percentage points for each $2,500 of income above $244,500 single and $366,700 joint. That is not modelled, so Minnesota tax shown above those incomes is slightly lower than the true figure.",
  },
  Missouri: {
    /*
     * MISSOURI WAS PROMISED A NOTE IT DID NOT HAVE. The dataset's own
     * limitations said Alabama and Missouri both carry one for the federal
     * income tax deduction; Alabama did and Missouri did not, so the one state
     * where a reader is shown a rule that costs them money had no warning
     * attached to it.
     */
    source: 'https://revisor.mo.gov/main/OneSection.aspx?section=143.171',
    checked: '2026-08-15',
    note: "Missouri lets you deduct a percentage of the federal income tax you paid — 35% at low incomes, falling to nothing above $125,000 of Missouri income, and capped at $5,000. That is not calculated here, so Missouri tax shown is higher than the true figure below that income, by around $62 a year for a single filer on $80,000.",
  },
  Iowa: {
    // The personal credit is $80 for a head of household, the same as a couple,
    // not the single filer's $40.
    personalCredit: { headOfHousehold: 80 },
    source: 'https://revenue.iowa.gov/taxes/tax-guidance/individual-income-tax',
    checked: '2026-08-15',
  },
  'South Carolina': {
    /*
     * SOUTH CAROLINA REWROTE ITS INCOME TAX AND WE WERE STILL MODELLING THE OLD
     * ONE. H. 4216 became Act No. 110 of 2026, signed 30 March 2026, first
     * applying to tax years beginning after 2025 — which is the year this
     * dataset is for.
     *
     * Almost nothing survived. The three-bracket 0%/3%/6% schedule is gone.
     * The federal standard deduction is gone, and so is the federal taxable
     * income starting point that carried it. What replaced them:
     *
     *   rates          1.99% to $30,000, then 5.21%, for EVERY filing status.
     *                  The statute expresses the second band as "5.21% minus
     *                  $966", which is the same thing: (5.21% - 1.99%) x
     *                  $30,000 = $966 exactly, so the schedule is continuous
     *                  at the break. There is no doubling for a couple — a
     *                  joint return gets the same $30,000 as a single one.
     *
     *   allowance      the South Carolina Income Adjusted Deduction, $15,000
     *                  single, $22,500 head of household, $30,000 joint,
     *                  tapering straight to zero as income rises.
     *
     * The taper is the interesting part. All three run at exactly 3/11 of a
     * dollar per dollar — 15,000/55,000 = 22,500/82,500 = 30,000/110,000 —
     * so the phase-out band carries about 1.4 extra points of effective rate
     * on top of the 5.21%. That the three fractions reduce to the same ratio
     * is itself the check that all six numbers were transcribed correctly.
     *
     * We were charging a single filer on $150,000 about $994 a year too much.
     */
    brackets: {
      single: [
        { from: 0, rate: 0.0199 },
        { from: 30_000, rate: 0.0521 },
      ],
      marriedJointly: [
        { from: 0, rate: 0.0199 },
        { from: 30_000, rate: 0.0521 },
      ],
    },
    standardDeduction: { single: 15_000, marriedJointly: 30_000, headOfHousehold: 22_500 },
    allowancePhaseOut: {
      kind: 'linear',
      appliesTo: ['standardDeduction'],
      // All three run at exactly 3/11 of a dollar per dollar — 15,000/55,000,
      // 22,500/82,500, 30,000/110,000. That the three reduce to one ratio is
      // the check that all six numbers were transcribed correctly.
      segments: {
        single: [{ base: 15_000, start: 40_000, perDollar: 15_000 / 55_000 }],
        headOfHousehold: [{ base: 22_500, start: 60_000, perDollar: 22_500 / 82_500 }],
        marriedJointly: [{ base: 30_000, start: 80_000, perDollar: 30_000 / 110_000 }],
      },
      // "Any reduction amount which is not a multiplier of ten dollars must be
      // rounded to the next lowest ten dollars" — 12-6-1140(15)(c). Rounding
      // the REDUCTION down leaves a slightly larger deduction, so this favours
      // the taxpayer by a few dollars.
      roundReductionDownTo: 10,
    },
    source: 'https://www.scstatehouse.gov/sess126_2025-2026/prever/4216_20260224.htm',
    checked: '2026-08-15',
    note: "South Carolina's dependent exemption is shown at the 2025 figure of $4,930. The state indexes it every December and the 2026 amount appears only in the 2026 return instructions, which are not published yet. The real figure will be slightly higher, so this errs against the reader.",
  },

};


/**
 * STATE ITEMISED DEDUCTIONS.
 *
 * The engine always applied the state STANDARD deduction, even though it
 * already knew the reader's property tax and mortgage interest. California and
 * New York both let you itemise on the state return whether or not you itemised
 * federally, and California's rules are far more generous than the federal ones:
 *
 *   - No SALT cap. California explicitly does not conform to OBBBA's
 *     "increased limitation on individual deductions for certain state and
 *     local taxes" — Schedule CA (540) instructions, "What's New".
 *   - Mortgage interest on acquisition debt up to $1,000,000, not $750,000.
 *     FTB's own deductions page states both figures side by side.
 *
 * On a San Jose buyer at $300,000 the two together are worth roughly $6,600 of
 * California tax.
 *
 * WHAT IS DEDUCTED HERE is only what this engine actually knows: property tax
 * and mortgage interest. A real Schedule CA also carries charitable giving,
 * medical costs above 7.5% of income and miscellaneous deductions above 2% —
 * none of which this site asks about. So the figure is a floor, and a reader
 * with those will do better than it says.
 *
 * STATE INCOME TAX IS NOT DEDUCTED. California requires it subtracted on
 * Schedule CA; you cannot deduct California tax from California income.
 *
 * California's high-income reduction — the lesser of 6% of income above about
 * $252,000 or 80% of the deductions — IS applied. What is still missing there
 * is the separate cut to its exemption CREDITS, which shares the same income
 * thresholds and is a different rule; California's own note says so.
 *
 * Fourteen states are populated. Every other state keeps the standard deduction
 * until its own rules have been read, which is the same honesty rule the
 * head-of-household table uses.
 */
const ITEMIZED_DEDUCTIONS = {
  /*
   * THIRTEEN MORE STATES LET A HOMEOWNER DEDUCT THEIR MORTGAGE than the one
   * this file started with, and we gave every one of them the plain standard
   * deduction. That overcharges, by $200 to
   * $1,750 a year each.
   *
   * A USEFUL INVARIANT RUNS THROUGH MOST OF THEM: nearly every state that
   * allows itemising makes you subtract its own income tax back out, so the
   * deduction collapses to property tax plus mortgage interest. That is why
   * `deductStateIncomeTax` could sit unread in the engine for months without
   * anything looking wrong. Iowa is the exception that exposed it.
   */
  Iowa: {
    /*
     * IOWA IS THE ONE THAT KEEPS ITS OWN INCOME TAX INSIDE THE DEDUCTION, and
     * that is what exposed `deductStateIncomeTax` as a flag nothing ever read.
     *
     * Every other state that allows itemising makes you add the state tax back
     * out, so the deduction collapses to property tax plus mortgage interest.
     * Iowa gutted its add-back — Iowa Code 422.9 now contains only a loss
     * carryover — and its Schedule 1, the complete list of Iowa modifications,
     * has no state income tax line at all. So the federal deduction flows
     * through with the state tax still in it.
     */
    deductPropertyTax: true,
    deductStateIncomeTax: true,
    mortgageDebtLimit: 750_000,
    saltCap: null,
    requiresFederalItemising: true,
    source: 'https://www.legis.iowa.gov/docs/code/422.9.pdf',
    checked: '2026-08-15',
  },
  Nebraska: {
    /*
     * Nebraska has no schedule of its own: Form 1040N takes the federal
     * itemised total, subtracts the state and local INCOME taxes from it, and
     * uses whichever is larger — that or the Nebraska standard deduction.
     *
     * Because the federal total arrives already capped, the federal SALT limit
     * is baked in. Nebraska then subtracts the FULL, PRE-CAP income tax
     * anyway: "you must enter the amount of state and local income taxes
     * reported on Federal Schedule A, line 5a EVEN IF the total was limited".
     * A capped filer loses the same dollars twice. That double hit is not
     * modelled here, so Nebraska tax shown is slightly lower than the truth
     * for anyone the federal cap reaches — see the note.
     */
    deductPropertyTax: true,
    deductStateIncomeTax: false,
    mortgageDebtLimit: 750_000,
    saltCap: null,
    requiresFederalItemising: true,
    source: 'https://revenue.nebraska.gov/sites/default/files/doc/tax-forms/2025/f_Individual_Income_Tax_Booklet.pdf',
    checked: '2026-08-15',
    note: 'Nebraska subtracts the full pre-cap state and local income tax from the federal itemised total even when the federal cap already reduced it, so a capped filer loses those dollars twice. That double subtraction is not modelled, so Nebraska tax shown here is lower than the true figure for anyone the federal cap reaches.',
  },
  Kansas: {
    /*
     * The cleanest of them, and one of the most valuable, because Kansas pairs
     * generous itemising with a $3,605 standard deduction that almost any
     * homeowner beats.
     *
     * Its own words: "The $40,000 federal cap on the itemized deduction for
     * state and local taxes does not apply for Kansas purposes. Taxpayers may
     * deduct all state and local real estate and property taxes paid,
     * independent of the federal dollar limitation." And you need not have
     * itemised federally: "If you did not itemize your deductions on your
     * federal return, you may choose to itemize your deductions or claim the
     * standard deduction on your Kansas return whichever is to your
     * advantage."
     */
    deductPropertyTax: true,
    deductStateIncomeTax: false,
    mortgageDebtLimit: 750_000,
    saltCap: null,
    source: 'https://www.ksrevenue.gov/incomebook25.html',
    checked: '2026-08-15',
  },
  Alabama: {
    /*
     * THE LARGEST LINE ON ALABAMA'S SCHEDULE A IS NOT HOUSING AT ALL. Line 6
     * is "FICA Tax (Social Security and Medicare) and Federal Self-Employment
     * Tax" — $11,475 at $150,000, more than the mortgage interest and property
     * tax together.
     *
     * Against an Alabama standard deduction that bottoms out at $2,500, that
     * means almost every wage earner in the state should itemise, and we had
     * none of them doing it. Worth about $1,750 a year at $150,000, the
     * biggest single itemising gap found.
     *
     * Alabama's income tax is not deductible, so the federal cap it points at
     * can only ever touch property tax and will not bind for anyone here.
     */
    deductPropertyTax: true,
    deductStateIncomeTax: false,
    deductPayrollTax: true,
    mortgageDebtLimit: 750_000,
    saltCap: null,
    source: 'https://www.revenue.alabama.gov/wp-content/uploads/2026/01/25f40bk.pdf',
    checked: '2026-08-15',
    note: "Alabama's itemised deductions here cover property tax, mortgage interest and the Social Security and Medicare tax withheld from your pay. Charitable giving and medical costs are not asked about and are not included, so Alabama tax shown here is higher than the true figure for anyone who has them.",
  },
  Minnesota: {
    /*
     * Minnesota runs its own schedule, independent of the federal choice, and
     * its own $10,000 cap on property tax — a plain figure in Minn. Stat.
     * 290.0122 subd. 3, not federal conformity, so it does not move when the
     * federal cap moves. State income tax is not on the list at all.
     *
     * Worth noting for the reader: this filer has very likely taken the
     * FEDERAL standard deduction, because federal counts state income tax
     * toward SALT and Minnesota does not. Minnesota's "itemise anyway" rule
     * exists for exactly them.
     */
    deductPropertyTax: true,
    deductStateIncomeTax: false,
    mortgageDebtLimit: 750_000,
    saltCap: 10_000,
    source: 'https://www.revisor.mn.gov/statutes/cite/290.0122',
    checked: '2026-08-15',
  },
  'North Carolina': {
    /*
     * TWO CAPS, ONE INSIDE THE OTHER. Real estate tax is capped at $10,000 on
     * its own, and then mortgage interest plus that capped property figure are
     * capped at $20,000 combined. So $25,000 of property tax and $2,000 of
     * interest gives $12,000, not $20,000.
     *
     * No federal itemising required, which is what makes it reachable.
     */
    deductPropertyTax: true,
    deductStateIncomeTax: false,
    mortgageDebtLimit: 750_000,
    saltCap: null,
    propertyTaxCap: 10_000,
    totalCap: 20_000,
    source: 'https://www.ncdor.gov/taxes-forms/individual-income-tax/filing-topics/north-carolina-standard-deduction-or-north-carolina-itemized-deductions',
    checked: '2026-08-15',
  },
  Virginia: {
    /*
     * Virginia's high-income cut looked dead and is not. Searching the statute
     * finds nothing, because the limitation lives in Virginia's DECONFORMITY
     * from the federal suspension rather than in its own code: "Virginia
     * deconforms from the suspension of the overall limitation on itemized
     * deductions, commonly known as the Pease limitation." So the pre-2018
     * federal formula keeps running — 3% of income above the threshold, capped
     * at 80% of the reducible deductions.
     */
    deductPropertyTax: true,
    deductStateIncomeTax: false,
    mortgageDebtLimit: 750_000,
    saltCap: null,
    requiresFederalItemising: true,
    highIncomeReduction: {
      perDollarAbove: 0.03,
      threshold: { single: 332_700, marriedJointly: 399_200, headOfHousehold: 365_950 },
      maxFractionOfDeductions: 0.8,
    },
    source: 'https://www.tax.virginia.gov/sites/default/files/vatax-pdf/2025-sch-a-instructions.pdf',
    checked: '2026-08-15',
  },
  Maryland: {
    deductPropertyTax: true,
    deductStateIncomeTax: false,
    mortgageDebtLimit: 750_000,
    saltCap: null,
    requiresFederalItemising: true,
    // 7.5% of federal income above $200,000, from tax year 2025.
    highIncomeReduction: {
      perDollarAbove: 0.075,
      threshold: { single: 200_000, marriedJointly: 200_000, headOfHousehold: 200_000 },
      maxFractionOfDeductions: 1,
    },
    source: 'https://mgaleg.maryland.gov/mgawebsite/Laws/StatuteText?article=gtg&section=10-218',
    checked: '2026-08-15',
  },
  Montana: {
    // Starts from federal taxable income, so the federal deduction flows
    // straight through; the state income tax add-back is floored so it can
    // never push the deduction below the federal standard deduction.
    deductPropertyTax: true,
    deductStateIncomeTax: false,
    mortgageDebtLimit: 750_000,
    saltCap: null,
    requiresFederalItemising: true,
    source: 'https://mca.legmt.gov/bills/mca/title_0150/chapter_0300/part_0210/section_0200/0150-0300-0210-0200.html',
    checked: '2026-08-15',
  },
  'New Mexico': {
    deductPropertyTax: true,
    deductStateIncomeTax: false,
    mortgageDebtLimit: 750_000,
    saltCap: null,
    requiresFederalItemising: true,
    source: 'https://www.tax.newmexico.gov/all-nm-taxes/current-historic-tax-rates-overview/personal-income-tax-rates/',
    checked: '2026-08-15',
  },
  Idaho: {
    // See REFUNDABLE_PERSONAL_CREDIT for the grocery credit that rides on top.
    deductPropertyTax: true,
    deductStateIncomeTax: false,
    mortgageDebtLimit: 750_000,
    saltCap: null,
    requiresFederalItemising: true,
    source: 'https://legislature.idaho.gov/statutesrules/idstat/title63/t63ch30/sect63-3022/',
    checked: '2026-08-15',
  },
  Oklahoma: {
    /*
     * Everything capped at $17,000, with charity and medical sitting outside
     * the cap — neither of which this engine asks about, so the cap here binds
     * on housing alone. The federal-itemising lock is two-way: taking the
     * federal standard deduction forces the Oklahoma standard deduction even
     * when that costs you money.
     */
    deductPropertyTax: true,
    deductStateIncomeTax: false,
    mortgageDebtLimit: 750_000,
    saltCap: null,
    totalCap: 17_000,
    requiresFederalItemising: true,
    source: 'https://oklahoma.gov/tax/individuals/pay-taxes.html',
    checked: '2026-08-15',
  },
  'New York': {
    /*
     * NEW YORK IS THE MOST GENEROUS OF THE LOT AND WE MODELLED NONE OF IT.
     * You may itemise for New York whether or not you did federally, on
     * PRE-2018 rules: property tax with no cap at all — "your New York State
     * itemized deduction for state and local taxes you paid is not subject to
     * this federal limit" — and mortgage interest on $1,000,000 of acquisition
     * debt rather than $750,000.
     *
     * Against a New York standard deduction of $8,000, a homeowner with a
     * mortgage was being overcharged $650 to $770 a year in state tax, and
     * more again in city tax on top.
     *
     * TWO REDUCTIONS, AND THEY ARE DIFFERENT SHAPES. Line 40 is the old
     * federal Pease rule — 3% of income above the threshold, capped at 80% —
     * and fits the ordinary field. Line 46 does not: it keeps a FRACTION of
     * the deduction, scaled by how far through a $50,000 band your income
     * sits. At $150,000 a single filer is at the very top of that band and
     * loses a flat quarter.
     *
     * Above $1,000,000 New York discards the deduction entirely and allows
     * only a share of charitable giving, which this engine never asks about —
     * so the curve ends at zero, which is the honest answer for what we know.
     */
    deductPropertyTax: true,
    deductStateIncomeTax: false,
    mortgageDebtLimit: 1_000_000,
    saltCap: null,
    highIncomeReduction: {
      perDollarAbove: 0.03,
      threshold: { single: 340_700, marriedJointly: 408_850, headOfHousehold: 374_800 },
      maxFractionOfDeductions: 0.8,
    },
    shareKeptCurve: {
      points: {
        // Full deduction to the threshold, then a quarter of it goes over the
        // next $50,000; a second quarter between $475,000 and $525,000; half
        // held to $1,000,000; nothing above.
        single: [
          [100_000, 1],
          [150_000, 0.75],
          [475_000, 0.75],
          [525_000, 0.5],
          [1_000_000, 0.5],
          [1_000_001, 0],
        ],
        headOfHousehold: [
          [150_000, 1],
          [200_000, 0.75],
          [475_000, 0.75],
          [525_000, 0.5],
          [1_000_000, 0.5],
          [1_000_001, 0],
        ],
        marriedJointly: [
          [200_000, 1],
          [250_000, 0.75],
          [475_000, 0.75],
          [525_000, 0.5],
          [1_000_000, 0.5],
          [1_000_001, 0],
        ],
      },
    },
    source: 'https://www.tax.ny.gov/forms/html-instructions/2025/it/it196i-2025.htm',
    checked: '2026-08-15',
    note: 'New York itemised deductions here cover property tax and mortgage interest only. Charitable giving, medical costs above 10% of income and the job expenses New York still allows are not asked about and are not included, so New York tax shown here is higher than the true figure for anyone who has them.',
  },
  California: {
    deductPropertyTax: true,
    deductStateIncomeTax: false,
    mortgageDebtLimit: 1_000_000,
    /*
     * Uncapped on purpose. California explicitly does not conform to OBBBA's
     * "increased limitation on individual deductions for certain state and
     * local taxes" — Schedule CA (540) instructions, "What's New" — so a
     * Californian deducts every dollar of property tax. Copying the federal
     * cap in here would have overcharged them.
     */
    saltCap: null,
    /*
     * THIS WAS DOCUMENTED AS NOT MODELLED AND LEFT THAT WAY, and it ran in the
     * reader's favour, which is the direction that matters most: a high-earning
     * Californian homeowner was shown a larger deduction than they get, and so
     * more money left over than they will have.
     *
     * California reduces itemised deductions by the LESSER of 6% of adjusted
     * gross income above the threshold or 80% of the deductions themselves.
     * The percentage bites first; the 80% stops the reduction ever taking more
     * than four fifths, however high income goes.
     *
     * Thresholds are the 2025 indexed figures, the same vintage as the
     * exemption-credit phase-out already recorded in the note below.
     */
    highIncomeReduction: {
      perDollarAbove: 0.06,
      threshold: { single: 252_203, marriedJointly: 504_411, headOfHousehold: 378_310 },
      maxFractionOfDeductions: 0.8,
    },
    source: 'https://www.ftb.ca.gov/file/personal/deductions/index.html',
    checked: '2026-08-15',
    note: 'California itemised deductions here cover property tax and mortgage interest only — the two figures this site knows. Charitable giving, medical costs and miscellaneous deductions are not asked about and are not included, so California tax shown here is higher than the true figure for anyone who has them.',
  },
};


/**
 * STATE EARNED INCOME CREDITS.
 *
 * The federal EITC is modelled; the states that add their own on top were not,
 * so the households least able to absorb a wrong answer were the ones getting
 * one. Most states set theirs as a flat percentage of the federal credit, which
 * makes it straightforward once the federal figure exists.
 *
 * ONLY WHERE SOURCES AGREE. NCSL (May 2026), the IRS's own list and ITEP's 2025
 * appendix disagree on several states — Massachusetts reads 30% or 40%
 * depending which you open, Vermont and Virginia and DC are all mid-change.
 * Anything where two independent sources do not match is left out rather than
 * guessed, which is the same rule the head-of-household table follows.
 *
 * DELIBERATELY ABSENT and why:
 *   CA, MN, WA   own formulas, not a percentage of the federal credit at all
 *   DE           taxpayer chooses between a refundable and a larger
 *                nonrefundable credit, and this engine cannot make that choice
 *   MA, VT, VA   sources disagree or the credit is mid-change
 *   DC           85% in 2025 rising to 100%, and the sources differ on when
 *   OR           9%, or 12% with a child under three; this site never asks a
 *                child's age, so the lower figure would be a guess either way
 *
 * REFUNDABILITY MATTERS MORE THAN THE PERCENTAGE for this audience. A
 * refundable credit pays out below zero tax; a nonrefundable one stops at zero
 * and is worth nothing to a household that already owes nothing, which is
 * exactly the household it is aimed at.
 *
 * Sources: NCSL "Earned Income Tax Credit Overview" table 2 (May 2026); IRS
 * "States and local governments with Earned Income Tax Credit"; ITEP "State
 * Earned Income Tax Credits in 2025".
 */
const STATE_EITC = {
  // HALVED FOR 2026. Colorado's own page carries a banner saying so: 50% for
  // 2023 through 2025, 25% for 2026 and later.
  Colorado: { percent: 0.25, refundable: true },
  Connecticut: { percent: 0.4, refundable: true },
  Hawaii: { percent: 0.4, refundable: true },
  Illinois: { percent: 0.2, refundable: true },
  Indiana: { percent: 0.1, refundable: true },
  Iowa: { percent: 0.15, refundable: true },
  Kansas: { percent: 0.17, refundable: true },
  Louisiana: { percent: 0.05, refundable: true },
  Michigan: { percent: 0.3, refundable: true },
  /*
   * TWENTY percent, not ten. The statute sets 10% "which may be increased to
   * twenty percent" on a revenue trigger, and once increased "shall continue
   * in effect until the next percentage increase occurs" — it ratchets and
   * cannot fall back. Missouri's own 2025 instructions say 20% in plain words.
   */
  Missouri: { percent: 0.2, refundable: false },
  Montana: { percent: 0.2, refundable: true },
  Nebraska: { percent: 0.1, refundable: true },
  'New Jersey': { percent: 0.4, refundable: true },
  'New Mexico': { percent: 0.25, refundable: true },
  'New York': { percent: 0.3, refundable: true },
  Ohio: { percent: 0.3, refundable: false },
  Oklahoma: { percent: 0.05, refundable: true },
  'Rhode Island': { percent: 0.16, refundable: true },
  /*
   * Act 110 of 2026 left the 125% alone and capped the result at $200, which
   * changes what it is: 125% of even a modest federal credit clears $200
   * immediately, so for almost every claimant with children this is now a flat
   * $200 rather than a percentage. Modelling the percentage without the cap
   * would have overstated South Carolina's benefit several times over.
   */
  'South Carolina': { percent: 1.25, refundable: false, maxCredit: 200 },
  Utah: { percent: 0.2, refundable: false },

  // These vary with the number of children, which the engine knows.
  Maine: { byChildren: { 0: 0.5, 1: 0.25, 2: 0.25, 3: 0.25 }, refundable: true },
  Maryland: { byChildren: { 0: 1.0, 1: 0.5, 2: 0.5, 3: 0.5 }, refundable: true },
  Wisconsin: { byChildren: { 0: 0, 1: 0.04, 2: 0.11, 3: 0.34 }, refundable: true },
};

const STATE_EITC_SOURCE = {
  citation: 'NCSL "Earned Income Tax Credit Overview" (May 2026), cross-checked against the IRS list of states with an EITC and ITEP "State Earned Income Tax Credits in 2025"',
  url: 'https://www.ncsl.org/human-services/earned-income-tax-credit-overview',
  checked: '2026-08-15',
};

// --- post-process ----------------------------------------------------------

const warnings = [];

/** Every state must carry an explicit decision, even if it is "not checked". */
function validateHeadOfHousehold(name, s) {
  const basis = s.headOfHouseholdBasis;
  if (!['own', 'marriedJointly', 'single', 'assumed-single'].includes(basis)) {
    throw new Error(`${name}: unknown headOfHouseholdBasis ${basis}`);
  }
  // A basis of "own" must bring SOMETHING of its own, but it need not be
  // brackets — New York publishes its own deduction on the shared schedule.
  if (
    basis === 'own' &&
    !(s.brackets.headOfHousehold || []).length &&
    s.standardDeduction.headOfHousehold === undefined &&
    s.personalExemption.headOfHousehold === undefined &&
    // Utah's entire allowance is a credit, so that is the only thing it can
    // bring of its own — $1,449 against a single filer's $966.
    s.personalCredit.headOfHousehold === undefined
  ) {
    throw new Error(`${name}: headOfHouseholdBasis is "own" but nothing of its own was supplied`);
  }
  if (basis !== 'own' && s.brackets.headOfHousehold) {
    throw new Error(`${name}: carries a head-of-household schedule its basis does not use`);
  }
  // A head of household is never taxed harder than a single filer on the same
  // income. If a transcription put a threshold in wrong, this catches it.
  if (basis === 'own' && (s.brackets.headOfHousehold || []).length) {
    for (const income of [30_000, 60_000, 120_000, 250_000]) {
      const asHoh = applyBracketsLocal(income, s.brackets.headOfHousehold);
      const asSingle = applyBracketsLocal(income, s.brackets.single);
      if (asHoh > asSingle + 0.01) {
        throw new Error(
          `${name}: head of household pays more than single at $${income} ` +
            `(${asHoh.toFixed(2)} vs ${asSingle.toFixed(2)}) — check the transcription`,
        );
      }
    }
  }
}

/** Local copy so this script stays free of engine imports. */
function applyBracketsLocal(income, brackets) {
  let tax = 0;
  for (let i = 0; i < brackets.length; i++) {
    const from = brackets[i].from;
    if (income <= from) break;
    const to = i + 1 < brackets.length ? Math.min(income, brackets[i + 1].from) : income;
    tax += (to - from) * brackets[i].rate;
  }
  return tax;
}

/*
 * DUPLICATE KEYS IN THESE TABLES ARE SILENT AND EXPENSIVE. A second `Oregon:`
 * in STATE_OVERRIDES quietly discarded the first — including a correction and
 * the note that explained it — and nothing failed, because in JavaScript the
 * later key simply wins. The tables are long enough now that a state can be
 * added twice without anyone seeing it.
 *
 * JavaScript has already collapsed the duplicates by the time this runs, so
 * this cannot catch them by inspecting the object. It reads the source text
 * instead, which is the only place the evidence survives.
 */
for (const [label, table] of [
  ['STATE_OVERRIDES', 'const STATE_OVERRIDES = {'],
  ['HEAD_OF_HOUSEHOLD', 'const HEAD_OF_HOUSEHOLD = {'],
  ['RATES_CHECKED', 'const RATES_CHECKED = {'],

  ['ITEMIZED_DEDUCTIONS', 'const ITEMIZED_DEDUCTIONS = {'],
  ['STATE_EITC', 'const STATE_EITC = {'],
]) {
  const source = readFileSync(new URL(import.meta.url), 'utf8');
  const start = source.indexOf(table);
  if (start < 0) continue;
  const body = source.slice(start, source.indexOf('\n};', start));
  const seen = new Set();
  for (const m of body.matchAll(/^  '?([A-Z][A-Za-z ]+)'?: \{/gm)) {
    if (seen.has(m[1])) throw new Error(`${label}: ${m[1]} appears twice — the later one silently wins`);
    seen.add(m[1]);
  }
}

for (const [name, s] of Object.entries(states)) {
  s.notes = s.footnotes.map((f) => footnoteText[f]).filter(Boolean);

  const eitc = STATE_EITC[name];
  s.earnedIncomeCredit = eitc
    ? {
        percentOfFederal: eitc.percent ?? null,
        byChildren: eitc.byChildren ?? null,
        refundable: eitc.refundable,
        maxCredit: eitc.maxCredit ?? null,
      }
    : null;
  if (eitc) {
    const rates = eitc.byChildren ? Object.values(eitc.byChildren) : [eitc.percent];
    for (const r of rates) {
      if (!(r >= 0 && r <= 1.5)) throw new Error(`${name}: implausible EITC match ${r}`);
    }
  }

  s.creditPhaseOut = null;
  s.allowancePhaseOut = null;
  s.lumpSumTax = null;
  /*
   * States that tax a married couple as two single filers on half the income.
   * Missouri REQUIRES it; the rest make it an election that nearly every
   * two-earner couple takes, because their joint brackets are not doubled.
   */
  s.combinedSeparateReturn = COMBINED_SEPARATE_RETURN.has(name);
  s.propertyTaxRelief = PROPERTY_TAX_RELIEF[name] ?? null;
  s.taxAddBacks = TAX_ADD_BACKS[name] ?? [];
  s.taxCreditFraction = TAX_CREDIT_FRACTION[name] ?? null;
  s.federalTaxDeduction = FEDERAL_TAX_DEDUCTION[name] ?? null;
  s.itemisedDeductionCredit = name === 'Wisconsin' ? { rate: 0.05 } : null;
  s.personalCreditRefundable = REFUNDABLE_PERSONAL_CREDIT.has(name);
  s.propertyTaxCredit = PROPERTY_TAX_CREDIT[name] ?? null;
  s.payrollTaxDeduction = PAYROLL_TAX_DEDUCTION[name] ?? null;
  /*
   * Rules we know this state has and do not model, in plain words, each saying
   * which way it runs. Kept apart from `notes` — which carries the source
   * table's own footnotes — so the site can render OUR admissions without
   * mixing them into somebody else's annotations.
   */
  s.modellingGaps = [];
  /*
   * Figures that are last year's because the state has not published this
   * year's. Real, published numbers — just a year old. See PRIOR_YEAR_FIGURES.
   */
  s.priorYearFigures = PRIOR_YEAR_FIGURES[name] ?? null;

  /*
   * Whether anyone has opened this state's own 2026 publication and compared
   * it to what we ship. Null means nobody has, and that is worth saying out
   * loud rather than leaving blank.
   */
  const ratesCheck = RATES_CHECKED[name];
  s.ratesCheckedAgainstState = ratesCheck
    ? { url: ratesCheck.source, checked: ratesCheck.checked, matched: ratesCheck.matched === true }
    : null;

  const itemized = ITEMIZED_DEDUCTIONS[name];
  s.itemizedDeductions = itemized
    ? {
        deductPropertyTax: itemized.deductPropertyTax,
        deductStateIncomeTax: itemized.deductStateIncomeTax,
        mortgageDebtLimit: itemized.mortgageDebtLimit,
        // Null means uncapped, which is a real answer and not a missing one.
        saltCap: itemized.saltCap ?? null,
        propertyTaxCap: itemized.propertyTaxCap ?? null,
        totalCap: itemized.totalCap ?? null,
        deductPayrollTax: itemized.deductPayrollTax === true,
        requiresFederalItemising: itemized.requiresFederalItemising === true,
        highIncomeReduction: itemized.highIncomeReduction ?? null,
        shareKeptCurve: itemized.shareKeptCurve ?? null,
        source: { url: itemized.source, checked: itemized.checked },
      }
    : null;
  if (itemized?.highIncomeReduction) {
    const r = itemized.highIncomeReduction;
    if (!(r.perDollarAbove > 0 && r.perDollarAbove <= 1)) {
      throw new Error(`${name}: implausible itemised reduction rate ${r.perDollarAbove}`);
    }
    if (!(r.maxFractionOfDeductions > 0 && r.maxFractionOfDeductions <= 1)) {
      throw new Error(`${name}: itemised reduction cap must be a fraction, got ${r.maxFractionOfDeductions}`);
    }
    if (!(r.threshold.single > 0)) {
      throw new Error(`${name}: itemised reduction needs a single threshold`);
    }
  }
  if (itemized?.note) {
    s.notes.push(itemized.note);
    s.modellingGaps.push(itemized.note);
  }

  const override = STATE_OVERRIDES[name];
  if (override) {
    /*
     * AN OVERRIDE THAT MATCHES THE SOURCE IS DEAD WEIGHT, and worse than that:
     * it looks like a verified correction while doing nothing, so the next
     * person trusts a hand-typed figure that the source now supplies anyway.
     *
     * Most of these exist because the committed snapshot predates a state's
     * legislation. When the snapshot is refreshed the state's own numbers
     * arrive and the override should go. This says so out loud rather than
     * letting it sit there.
     */
    for (const [status, value] of Object.entries(override.standardDeduction ?? {})) {
      if (s.standardDeduction[status] === value) {
        warnings.push(
          `${name}: standard deduction override for ${status} ($${value.toLocaleString()}) now matches the source — delete it`,
        );
      }
    }
    if (override.standardDeduction) Object.assign(s.standardDeduction, override.standardDeduction);
    if (override.personalCredit) Object.assign(s.personalCredit, override.personalCredit);
    if (override.personalExemption) Object.assign(s.personalExemption, override.personalExemption);
    /*
     * Brackets may be replaced too, which the override mechanism could not do
     * before. Maine needed it: a 2% surcharge arrived for 2026 that the shipped
     * table stops short of.
     *
     * REPLACED WHOLE, never merged. A bracket schedule is a sequence where each
     * entry only means anything next to the one after it, so patching an entry
     * into the middle of one is how you get a schedule that looks fine and
     * charges the wrong rate over a range nobody checked.
     */
    if (override.brackets) {
      for (const [status, replacement] of Object.entries(override.brackets)) {
        if (!Array.isArray(replacement) || replacement.length === 0) {
          throw new Error(`${name}: bracket override for ${status} is empty`);
        }
        if (replacement[0].from !== 0) {
          throw new Error(`${name}: bracket override for ${status} does not start at $0`);
        }
        for (let i = 1; i < replacement.length; i++) {
          if (replacement[i].from <= replacement[i - 1].from) {
            throw new Error(`${name}: bracket override for ${status} is not in ascending order`);
          }
        }
        s.brackets[status] = replacement;
      }
    }
    if (override.allowancePhaseOut) {
      const rule = override.allowancePhaseOut;
      if (!Array.isArray(rule.appliesTo) || rule.appliesTo.length === 0) {
        throw new Error(`${name}: allowance phase-out must say what it applies to`);
      }
      if (rule.kind === 'stepped') {
        if (!(rule.start.single >= 0) || !(rule.stepSize > 0) || !rule.factors?.length) {
          throw new Error(`${name}: stepped phase-out needs a start, a step size and factors`);
        }
        for (let i = 1; i < rule.factors.length; i++) {
          if (rule.factors[i] >= rule.factors[i - 1]) {
            throw new Error(`${name}: stepped phase-out factors must decrease`);
          }
        }
      } else if (rule.kind === 'linear') {
        /*
         * A linear segment's base is a FIXED amount, so pointing it at the
         * personal exemption in a state that also gives a per-dependent
         * exemption would silently throw the children's share away.
         */
        if (rule.appliesTo.includes('personalExemption') && s.personalExemption.dependent > 0) {
          throw new Error(
            `${name}: a linear allowance phase-out cannot cover the personal exemption ` +
              `while a dependent exemption of $${s.personalExemption.dependent} also applies`,
          );
        }
        for (const [status, segments] of Object.entries(rule.segments ?? {})) {
          if (!Array.isArray(segments) || segments.length === 0) {
            throw new Error(`${name}: linear phase-out for ${status} has no segments`);
          }
          for (const seg of segments) {
            if (!(seg.base > 0) || !(seg.perDollar > 0) || !(seg.start >= 0)) {
              throw new Error(`${name}: implausible phase-out segment for ${status}`);
            }
          }
          /*
           * The largest segment base must equal the allowance the state
           * actually gives, or the two would drift apart on the next refresh
           * and nothing would notice.
           */
          const declared =
            rule.appliesTo.includes('standardDeduction')
              ? s.standardDeduction[status]
              : s.personalExemption[status];
          const biggest = Math.max(...segments.map((x) => x.base));
          if (declared !== undefined && Math.abs(declared - biggest) > 0.5) {
            throw new Error(
              `${name}: ${status} phase-out starts from $${biggest} but the allowance is $${declared}`,
            );
          }
        }
      } else {
        throw new Error(`${name}: unknown allowance phase-out kind ${rule.kind}`);
      }
      s.allowancePhaseOut = rule;
    }
    if (override.lumpSumTax) {
      const { above, amount } = override.lumpSumTax;
      if (!(above > 0) || !(amount > 0)) {
        throw new Error(`${name}: implausible lump-sum tax ${amount} above ${above}`);
      }
      s.lumpSumTax = override.lumpSumTax;
    }
    if (override.creditPhaseOut) {
      const { perDollar, threshold, hardCliff } = override.creditPhaseOut;
      // A cliff has no rate to be implausible — the credit simply stops.
      if (!hardCliff && !(perDollar > 0 && perDollar < 0.5)) {
        throw new Error(`${name}: implausible credit phase-out rate ${perDollar}`);
      }
      if (!(threshold.single > 0)) {
        throw new Error(`${name}: credit phase-out needs a single threshold`);
      }
      s.creditPhaseOut = override.creditPhaseOut;
    }
    s.verifiedAgainstState = { url: override.source, checked: override.checked };
    if (override.note) {
      s.notes.push(override.note);
      s.modellingGaps.push(override.note);
    }
  }

  s.communityProperty = COMMUNITY_PROPERTY.has(name);
  s.payrollContributions = PAYROLL_CONTRIBUTIONS[name] ?? [];
  for (const c of s.payrollContributions) {
    if (!(c.rate > 0 && c.rate < 0.05)) {
      throw new Error(`${name}: implausible payroll contribution rate ${c.rate} for ${c.id}`);
    }
    if (c.wageCap !== null && !(c.wageCap > 1_000)) {
      throw new Error(`${name}: implausible wage cap ${c.wageCap} for ${c.id}`);
    }
  }

  const hoh = HEAD_OF_HOUSEHOLD[name];
  s.headOfHouseholdBasis = hoh ? hoh.basis : 'assumed-single';
  if (hoh?.brackets) s.brackets.headOfHousehold = hoh.brackets;
  if (hoh?.standardDeduction !== undefined) {
    s.standardDeduction.headOfHousehold = hoh.standardDeduction;
  }
  if (hoh?.personalExemption !== undefined) {
    s.personalExemption.headOfHousehold = hoh.personalExemption;
  }
  if (hoh) s.headOfHouseholdSource = { url: hoh.source, checked: hoh.checked };
  validateHeadOfHousehold(name, s);

  /*
   * Drop source footnotes a later law has made false. South Carolina's two
   * were "top marginal rate is scheduled to revert to 6.2% on July 1, 2026"
   * and the note grouping it with states that start from federal taxable
   * income — both superseded by Act 110 of 2026, which set the rate at 5.21%
   * and moved the starting point to federal AGI. A stale note on a page that
   * exists to explain the numbers is worse than no note.
   */
  const drop = SUPERSEDED_NOTES[name];
  if (drop) s.notes = s.notes.filter((n) => !drop.some((d) => n.includes(d)));

  /*
   * SAY WHETHER WE ACTUALLY DO IT.
   *
   * The aggregated table's footnote reads "These states allow some or all of
   * federal income tax paid to be deducted from state taxable income." It is
   * true, and it is about the STATE'S law. But it lands in a list a visitor
   * reads as a description of this calculator, so on Alabama it sat a few
   * lines above our own note saying the deduction is NOT applied here — two
   * sentences that look like they contradict each other and do not.
   *
   * Three states carry the footnote and they do not get the same treatment:
   * Oregon's deduction is calculated, Alabama's and Missouri's are not. So the
   * footnote is annotated per state with which of the two it is. Deriving the
   * answer from `federalTaxDeduction` rather than a hand-kept list is the
   * point — if one of those two is ever implemented, the sentence follows on
   * its own.
   */
  s.notes = s.notes.map((n) =>
    n.startsWith('These states allow some or all of federal income tax paid to be deducted')
      ? `${n} ${
          s.federalTaxDeduction
            ? 'That deduction is calculated here.'
            : 'That deduction is NOT calculated here, so the tax shown for this state is higher than the true figure — see the note below for how much.'
        }`
      : n,
  );

  if (CAPITAL_GAINS_ONLY.has(name)) {
    s.hasWageIncomeTax = false;
    s.brackets = { single: [], marriedJointly: [] };
    s.notes.unshift(
      'Levies a tax on capital gains income only. There is no tax on wage income, so this calculator treats the state income tax on salary as zero.',
    );
    continue;
  }

  if (s.brackets.single.length === 0) {
    s.hasWageIncomeTax = false;
    continue;
  }

  // Prepend an explicit zero-rate band where the first positive rate starts
  // above $0, so every schedule begins at zero as the engine requires.
  for (const status of ['single', 'marriedJointly']) {
    const b = s.brackets[status];
    if (b.length > 0 && b[0].from !== 0) {
      b.unshift({ from: 0, rate: 0 });
      s.notes.push(
        `Income below $${b[1].from.toLocaleString()} (${status === 'single' ? 'single' : 'married filing jointly'}) is not taxed.`,
      );
    }
  }

  // Fall back to the single schedule if a joint schedule is missing.
  if (s.brackets.marriedJointly.length === 0) {
    s.brackets.marriedJointly = s.brackets.single.map((x) => ({ ...x }));
    warnings.push(`${name}: no joint schedule published; reused single schedule`);
  }

  // Validate.
  for (const status of ['single', 'marriedJointly']) {
    const b = s.brackets[status];
    if (b[0].from !== 0) warnings.push(`${name}/${status}: does not start at 0`);
    for (let i = 0; i < b.length; i++) {
      if (b[i].rate < 0 || b[i].rate > 1) warnings.push(`${name}/${status}: rate ${b[i].rate} out of range`);
      if (i > 0 && b[i].from <= b[i - 1].from) warnings.push(`${name}/${status}: bracket ${i} out of order`);
    }
  }
}

// --- sanity checks: fail loudly rather than emit a corrupt dataset ----------

const count = Object.keys(states).length;
if (count !== 51) throw new Error(`expected 51 jurisdictions (50 states + DC), got ${count}`);

const noTax = Object.values(states).filter((s) => !s.hasWageIncomeTax).map((s) => s.code).sort();
const EXPECTED_NO_TAX = ['AK', 'FL', 'NH', 'NV', 'SD', 'TN', 'TX', 'WA', 'WY'];
if (JSON.stringify(noTax) !== JSON.stringify(EXPECTED_NO_TAX)) {
  throw new Error(`no-wage-tax states changed.\n  expected: ${EXPECTED_NO_TAX}\n  got:      ${noTax}`);
}

const topRate = Math.max(
  ...Object.values(states).flatMap((s) => s.brackets.single.map((b) => b.rate)),
);
if (topRate > 0.15) throw new Error(`implausible top state rate ${topRate}`);

// --- emit ------------------------------------------------------------------

const byCode = {};
for (const s of Object.values(states).sort((a, b) => a.code.localeCompare(b.code))) {
  byCode[s.code] = s;
}

/*
 * HOW OLD THE BRACKET TABLE IS, measured against the newest hand-check in this
 * file rather than against today's clock.
 *
 * Using the clock would make the build non-deterministic: the same inputs would
 * produce a different states.json tomorrow, and a dataset that changes on its
 * own is not reproducible. The newest `checked` date is the right yardstick
 * anyway, because it is the last moment anyone actually looked.
 */
const latestCheck = [
  ...Object.values(HEAD_OF_HOUSEHOLD),
  ...Object.values(STATE_OVERRIDES),
  ...Object.values(ITEMIZED_DEDUCTIONS),
]
  .map((e) => e.checked)
  .filter(Boolean)
  .sort()
  .pop();

const snapshotAgeMonths = Math.max(
  0,
  Math.round(
    (Date.parse(latestCheck ?? SNAPSHOT_PUBLISHED) - Date.parse(SNAPSHOT_PUBLISHED)) /
      (1000 * 60 * 60 * 24 * 30.44),
  ),
);

/*
 * The tripwire. An old table is only a problem for states nobody has checked
 * directly — once a state has been read off its own publication, the table's
 * age stops mattering for that state. So the warning names the gap rather than
 * the calendar.
 */
const unverifiedRates = Object.values(byCode)
  .filter((s) => s.hasWageIncomeTax && !s.ratesCheckedAgainstState)
  .map((s) => s.code);

if (snapshotAgeMonths >= SNAPSHOT_STALE_AFTER_MONTHS && unverifiedRates.length > 0) {
  warnings.push(
    `the bracket table was published ${SNAPSHOT_PUBLISHED} and the newest check here is ${latestCheck} — ` +
      `${snapshotAgeMonths} months of state legislating it cannot know about, and ` +
      `${unverifiedRates.length} states have never been read off their own publication: ` +
      `${unverifiedRates.join(' ')}. Seven states moved underneath this table in 2026.`,
  );
}

const output = {
  taxYear: 2026,
  datasetVersion: VERSION,
  source: {
    citation: 'Tax Foundation, "State Individual Income Tax Rates and Brackets, 2026"',
    url: SOURCE_URL,
    licence: 'CC BY-NC 4.0 — satisfied because this project is permanently non-commercial',
    snapshot: `data/${VERSION}/sources/taxfoundation-state-income-tax-2026.html`,
    /*
     * WHEN THE SNAPSHOT WAS PUBLISHED, which turns out to matter more than
     * anything else about it.
     *
     * Committing the snapshot is what makes this dataset reproducible, and for
     * a long time that was treated as the end of the argument. It is not.
     * Reproducible only means everyone gets the same answer; it says nothing
     * about whether the answer is still true. This table was published in
     * February, states legislate through the spring, and by August four of them
     * had moved underneath it — Georgia, Arizona, South Carolina and Maine —
     * every one of them in the direction that overcharges the reader.
     *
     * Recording the date lets the build say how old it is instead of leaving
     * everyone to assume it is current.
     */
    published: SNAPSHOT_PUBLISHED,
    ageInMonths: snapshotAgeMonths,
    confidence: "secondary — a reputable aggregator of state statutes, published once a year. Every taxing state has since had a source recorded for its rates, allowances and head-of-household treatment, and the build reports how many of those are the state's own site, how many are a 2026 document and how many are the state's most recent because it has published nothing for 2026. See ratesCheckedAgainstState and priorYearFigures on each state.",
  },
  payrollContributionSource: PAYROLL_SOURCE,
  earnedIncomeCreditSource: STATE_EITC_SOURCE,
  filingStatusMapping: {
    single: 'single',
    marriedJointly: 'marriedJointly',
    marriedSeparately: 'single',
    headOfHousehold: 'headOfHousehold',
    _note:
      'The source table publishes single and joint columns only. Head of household is no longer mapped to single: every taxing state has been checked against its own publication, and each carries headOfHouseholdBasis saying which schedule and which allowance it actually gets. Married-filing-separately maps to single, which is correct in most states.',
  },
  limitations: [
    'Income-based phase-outs of the standard deduction or personal exemption are modelled in nine states — Alabama, Colorado, Connecticut, Maryland, Maine, Minnesota, Rhode Island, South Carolina and Wisconsin, Colorado\'s as a cliff. Phase-outs of a CREDIT are modelled in two more, Oregon and Utah. Where a state has one that is not modelled, that state carries a note saying so and which way it runs.',
    'A deduction for federal income tax paid is modelled for Oregon. Alabama and Missouri also allow one and are not modelled: Alabama gives it on its own line of Form 40, to every filer rather than only to itemisers, worked out as the federal tax you actually bore after the refundable credits are backed out; Missouri sets it as a percentage of federal tax that reaches zero above $125,000 of Missouri income. Both carry a note saying so.',
    'Local income taxes are excluded here and handled separately; see local.json.',
    'Alternative minimum taxes and supplemental high-income surtaxes beyond the published bracket schedules are not modelled. Connecticut\'s recapture IS modelled; New York\'s is not, and New York carries a note.',
    'Every state that taxes wages has been read off its own publication for rates, allowances and head-of-household treatment. Ten states ship the prior year\'s figures because the state has not published this year\'s; each names itself in priorYearFigures.',
  ],
  states: byCode,
};

writeDataset(OUT, `${JSON.stringify(output, null, 2)}\n`);

// --- report ----------------------------------------------------------------

const withTax = Object.values(byCode).filter((s) => s.hasWageIncomeTax);
console.log(`Wrote ${OUT}`);
console.log(`  jurisdictions:        ${count}`);
console.log(`  with wage income tax: ${withTax.length}`);
console.log(`  no wage income tax:   ${noTax.length} (${noTax.join(', ')})`);
console.log(`  flat tax (1 bracket): ${withTax.filter((s) => s.brackets.single.length === 1).length}`);
console.log(`  federal tax deductible: ${Object.values(byCode).filter((s) => s.federalTaxDeductible).map((s) => s.code).join(', ')}`);
console.log(`  have local income tax:  ${Object.values(byCode).filter((s) => s.hasLocalIncomeTax).map((s) => s.code).join(', ')}`);
console.log(`  top marginal rate:      ${(topRate * 100).toFixed(2)}%`);

/*
 * HEAD OF HOUSEHOLD COVERAGE, printed every build.
 *
 * The point of printing it is that the unchecked states stay visible. They
 * were invisible before, which is how California went years overcharging a
 * single parent $2,028 on $120,000 while the code called it "conservative".
 */
/*
 * EVERY TAXING STATE, not just the ones with more than one bracket.
 *
 * This used to count only graduated states, because the question began as
 * "which rate schedule does a head of household use" and a flat state has only
 * one. That let twelve states out of the report entirely — and five of them
 * turned out to give a head of household a different ALLOWANCE, Louisiana by
 * the full joint amount. Being flat says nothing about the deduction.
 *
 * A coverage report that quietly excludes a category is worse than none: it
 * reads as "all clear" for states it never looked at.
 */
/*
 * IS THIS SOURCE THE STATE ITSELF, OR SOMEBODY REPUBLISHING IT?
 *
 * The coverage line below used to count any recorded source as "the state's
 * own publication", which was stronger than the evidence. A statute on a
 * commercial law site and a form mirrored by a forms aggregator are both
 * likely accurate and neither is the state speaking.
 *
 * The distinction is worth keeping because the whole point of recording a
 * source is that the next person can re-check it — and a mirror can go away,
 * or lag, without the state changing anything.
 */
const OFFICIAL_HOST =
  /\.gov(\/|$|:)|\.state\.[a-z]{2}\.us|legislature\.|\blegis\.|capitol\.|revisor\.|ksrevisor\.|mca\.legmt/i;

const secondarySources = [];
for (const s of Object.values(byCode)) {
  if (!s.hasWageIncomeTax) continue;
  for (const [what, src] of [
    ['rates', s.ratesCheckedAgainstState],
    ['head of household', s.headOfHouseholdSource],
  ]) {
    if (!src?.url) continue;
    if (!OFFICIAL_HOST.test(src.url)) {
      secondarySources.push(`${s.code} ${what}: ${new URL(src.url).host}`);
    }
  }
}

const taxing = Object.values(byCode).filter((s) => s.hasWageIncomeTax);
const checked = taxing.filter((s) => s.headOfHouseholdBasis !== 'assumed-single');
const unchecked = taxing.filter((s) => s.headOfHouseholdBasis === 'assumed-single');
console.log(`\n  HEAD OF HOUSEHOLD — ${checked.length} of ${taxing.length} taxing states verified`);
for (const s of checked) {
  console.log(`    ${s.code}  ${s.headOfHouseholdBasis.padEnd(15)} ${s.headOfHouseholdSource.url}`);
}
console.log(`  NOT yet checked against the state's own publication (${unchecked.length}):`);
console.log(`    ${unchecked.map((s) => s.code).join(' ')}`);

/*
 * RATES AND ALLOWANCES COVERAGE — a stronger claim than the one above.
 *
 * The head-of-household count says somebody settled which schedule and
 * allowance a single parent gets. This one says somebody compared EVERY
 * bracket and EVERY allowance against the state's own 2026 publication, which
 * is the only defence against an annual table going stale mid-year.
 */
const ratesChecked = taxing.filter((s) => s.ratesCheckedAgainstState);
const ratesCorrected = ratesChecked.filter((s) => !s.ratesCheckedAgainstState.matched);
const onPriorYear = taxing.filter((s) => s.priorYearFigures);
console.log(
  `\n  RATES AND ALLOWANCES — ${ratesChecked.length} of ${taxing.length} read off the state's own publication`,
);
console.log(
  `    of those, ${taxing.length - onPriorYear.length} against a 2026 document and ` +
    `${onPriorYear.length} against the state's most recent, because it has published no 2026 figures`,
);
if (secondarySources.length) {
  console.log(`    recorded against a REPUBLISHER rather than the state (${secondarySources.length}):`);
  for (const line of secondarySources) console.log(`      ${line}`);
}
if (ratesCorrected.length) {
  console.log(`    corrected as a result (${ratesCorrected.length}):`);
  console.log(`      ${ratesCorrected.map((s) => s.code).join(' ')}`);
}
const ratesUnchecked = taxing.filter((s) => !s.ratesCheckedAgainstState);
if (ratesUnchecked.length) {
  console.log(`    still taken on trust from the aggregated table (${ratesUnchecked.length}):`);
  console.log(`      ${ratesUnchecked.map((s) => s.code).join(' ')}`);
}
for (const line of secondarySources) {
  warnings.push(
    `${line} — recorded against a republisher rather than the state's own site. ` +
      `Likely accurate, but a mirror can lag or vanish without the state changing anything.`,
  );
}

if (warnings.length) {
  console.log('\nWARNINGS:');
  for (const w of warnings) console.log(`  - ${w}`);
} else {
  console.log('\nNo warnings.');
}
