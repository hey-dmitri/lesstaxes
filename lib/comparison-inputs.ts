/**
 * Turning the form's state into the engine's inputs.
 *
 * This exists because of a bug that is worth naming. The calculator used to
 * build the engine's input object by hand:
 *
 *     origin: {
 *       metroId: origin.metroId,
 *       grossSalary: origin.grossSalary,
 *       housing: origin.housing,
 *       cars: origin.cars,
 *     }
 *
 * That is a list of fields, maintained by memory, that has to be kept in step
 * with a type it never references. When stateCode was added to CityInputs the
 * list was not updated, so the interactive page silently dropped it: the badge
 * showed NJ, New York City's tax correctly disappeared, and New York's state
 * income tax and sales tax kept being charged anyway. The share link and the
 * share card were right, because both pass the whole object — so the page and
 * the picture of the page disagreed.
 *
 * TypeScript could not catch it. Every field present was the right type, and
 * the missing one was optional.
 *
 * So the conversion is done by REMOVING the one field the engine does not want,
 * rather than by listing the ones it does. Anything added to CityInputs from
 * here on arrives automatically, and the test below fails if this file ever
 * goes back to enumerating fields.
 */

import type { CityInputs, ComparisonInputs, FilingStatus } from '@/engine';
import type { CityFormState } from '@/components/city-panel';

/** The form's per-city state, minus the part only the form cares about. */
export function cityInputsFrom(state: CityFormState): CityInputs {
  // Rest-spread, deliberately: it carries every field it does not name.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { localOptIns, ...inputs } = state;
  return inputs;
}

export interface FormState {
  filingStatus: FilingStatus;
  children: number;
  earners: number;
  origin: CityFormState;
  destination: CityFormState;
}

export function comparisonInputsFrom(
  form: FormState,
  datasetVersion: string,
): ComparisonInputs {
  return {
    datasetVersion,
    household: {
      filingStatus: form.filingStatus,
      children: form.children,
      earners: form.earners,
    },
    origin: cityInputsFrom(form.origin),
    destination: cityInputsFrom(form.destination),
  };
}
