// Takes the household form. A complete form becomes a plan; a form with mistakes comes back with
// every value kept (the rounded device location too) and one reason per field to fix.
import type { Place } from '@/core/types';
import { draftPath, placeOfForm, placeProblem, planPath, toPlace } from '@/server/edits';
import type { GivenPlace } from '@/server/geo/geocode';
import { handleForm, readGuardedForm, seeOther } from '@/server/http';
import { collectValues, parseHouseholdForm } from '@/server/household-form';
import type { FormError } from '@/server/household-form';
import { sealHousehold } from '@/server/seal';

// Delhi, as a stand-in while the place is unresolved, so the other fields are checked in the same
// pass. It is never sealed into a plan, because a form with a place error goes back to the family.
const UNSET: Place = { name: 'Unset', admin1: 'Unset', lat: 28.6, lon: 77.2 };

// Said when the form had no place and no device location.
const NO_PLACE = 'Type the place you live in, or use your location.';

/** The household's place, or what to fix in the place field. */
function placeOrError(given: GivenPlace): { place: Place } | { error: FormError } {
  if (given.kind === 'one') return { place: toPlace(given.place) };
  if (given.kind === 'many') {
    // "Name, state" is read back to that one place. One example keeps the message inside the
    // 200 characters a sealed draft allows for it, however long the place names are.
    const example = given.options[0];
    const hint = example === undefined ? '' : `, for example ${example.name}, ${example.admin1}`;
    return {
      error: {
        field: 'place',
        message: `More than one place has that name. Add your state after a comma${hint}.`,
      },
    };
  }
  // Nothing found, outside India, lookup down or nothing given: say what to fix in the
  // place field.
  return { error: { field: 'place', message: placeProblem(given) ?? NO_PLACE } };
}

/**
 * Takes the household form: a plan when it is complete, otherwise the form again with what is
 * wrong. It redirects with a 303 and keeps nothing.
 */
export function POST(request: Request): Promise<Response> {
  // A failure that stops the form being taken shows a message page with a link to /household.
  return handleForm(async () => {
    // Same-site, size-capped and token-checked before anything is read.
    const form = await readGuardedForm(request, new Date());
    // Every text field the family filled in, so a form sent back shows what they entered.
    const values = collectValues(form);
    const located = placeOrError(await placeOfForm(form));
    // The rest of the form is checked even when the place failed, so all mistakes come back
    // together.
    const parsed = parseHouseholdForm(values, 'place' in located ? located.place : UNSET);

    const errors = [
      ...('error' in located ? [located.error] : []),
      ...('errors' in parsed ? parsed.errors : []),
    ];
    // The second test also narrows the type, so parsed.household can be used below.
    if (errors.length > 0 || 'errors' in parsed) {
      // The form has no free text, so the draft carries only the values and the errors.
      const draft = { text: '', options: [], values, errors };
      // The anchor lands on the error summary, which is announced when the page loads.
      return seeOther(`${draftPath('/household', draft)}#error-summary`);
    }
    return seeOther(planPath(sealHousehold(parsed.household), { status: 'made' }, 'plan-title'));
  }, '/household');
}
