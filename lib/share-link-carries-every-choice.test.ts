/**
 * A SHARE LINK MUST CARRY EVERY QUESTION THE FORM ASKS.
 *
 * The share bar promises "whoever opens it sees exactly these numbers". That
 * is a strong promise and it was false for eleven metros.
 *
 * `OPT_IN_ORDER` — the list of local tax answers the link has bits for — held
 * two names, New York City and Yonkers, from the time those were the only two
 * places with a "do you live inside it?" question. Eleven more metros were
 * later given a grouped "Where in this metro do you live?" and none of those
 * answers had anywhere to go. Nothing failed: the encoder simply had no bit,
 * so the answer was dropped, and on decode `resolveLocalJurisdictions` fell
 * back to `defaultApplies` — which is always the city rate.
 *
 * So somebody who said they live outside Philadelphia, shared the result and
 * opened their own link was shown the city tax anyway. Local tax $990 became
 * $3,738, leftover fell $2,747.50, and the verdict moved by the same amount.
 * The sender and the reader saw different answers with nothing to say so.
 *
 * The general rule this pins: the wire format is the set of questions the
 * interface asks. Adding a question to the form without adding it to the link
 * is a silent wrong answer, not a missing feature, so it fails here instead.
 */

import { describe, expect, it } from 'vitest';

import { decodeComparison, encodeComparison } from './share-link';
import {
  allMetros,
  defaultCityInputs,
  localTaxOptions,
  resolveLocalJurisdictions,
  CURRENT_DATASET_VERSION,
} from '@/engine';

const HOUSEHOLD = { filingStatus: 'single' as const, children: 0 };

const askedAnywhere = allMetros().flatMap((metro) =>
  localTaxOptions(metro.id)
    .filter((o) => o.optional)
    .map((option) => ({ metro, option })),
);

describe('every local tax question the form asks', () => {
  it('is asked somewhere, or this test is checking nothing', () => {
    expect(askedAnywhere.length).toBeGreaterThan(20);
  });

  it.each(askedAnywhere.map(({ metro, option }) => [metro.shortName, metro.id, option.jurisdictionId]))(
    'survives a share link — %s, %s',
    (_name, metroId, chosenId) => {
      const options = localTaxOptions(metroId).filter((o) => o.optional);
      const origin = defaultCityInputs(metroId, 100_000, HOUSEHOLD, 'rent');
      const destination = defaultCityInputs('12420', 100_000, HOUSEHOLD, 'rent');

      // What the interface actually sends: an explicit answer to every
      // question on the form, not just the one that was ticked.
      const chosen = Object.fromEntries(
        options.map((o) => [o.jurisdictionId, o.jurisdictionId === chosenId]),
      );

      const link = encodeComparison({
        datasetVersion: CURRENT_DATASET_VERSION,
        filingStatus: HOUSEHOLD.filingStatus,
        children: HOUSEHOLD.children,
        origin: {
          metroId,
          stateCode: origin.stateCode,
          grossSalary: 100_000,
          housing: origin.housing,
          cars: origin.cars,
          localOptIns: chosen,
        },
        destination: {
          metroId: '12420',
          stateCode: destination.stateCode,
          grossSalary: 100_000,
          housing: destination.housing,
          cars: destination.cars,
          localOptIns: {},
        },
      });

      const reopened = decodeComparison(link).origin.localOptIns;

      // Compare the jurisdictions that actually get charged, not the raw map.
      // A link that records the answer differently but taxes the same is fine;
      // a link that taxes differently is the whole defect.
      const asSent = resolveLocalJurisdictions(
        metroId,
        chosen,
        CURRENT_DATASET_VERSION,
        origin.stateCode,
      ).map((j) => j.id);
      const asOpened = resolveLocalJurisdictions(
        metroId,
        reopened,
        CURRENT_DATASET_VERSION,
        origin.stateCode,
      ).map((j) => j.id);

      expect(asOpened).toEqual(asSent);
    },
  );
});
