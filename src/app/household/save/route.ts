// Takes the household form. A complete form becomes a plan; a form with mistakes comes back with
// every value kept (the rounded device location too) and one reason per field to fix.
import type { Place } from '@/core/types';
import { draftPath, placeOfForm, placeProblem, planPath, toPlace } from '@/server/edits';
import type { GivenPlace } from '@/server/geo/geocode';
import { handleForm, readGuardedForm, seeOther } from '@/server/http';
import { collectValues, parseHouseholdForm } from '@/server/household-form';
import type { FormError } from '@/server/household-form';
import { sealHousehold } from '@/server/seal';

// Stands in while the place is still unresolved, so the other fields can be checked in the same pass.
const UNSET: Place = { name: 'Unset', admin1: 'Unset', lat: 28.6, lon: 77.2 };

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
  return { error: { field: 'place', message: placeProblem(given) ?? NO_PLACE } };
}

/** Takes the household form: a plan when it is complete, otherwise the form again with what is wrong. */
export function POST(request: Request): Promise<Response> {
  return handleForm(async () => {
    const form = await readGuardedForm(request, new Date());
    const values = collectValues(form);
    const located = placeOrError(await placeOfForm(form));
    const parsed = parseHouseholdForm(values, 'place' in located ? located.place : UNSET);

    const errors = [
      ...('error' in located ? [located.error] : []),
      ...('errors' in parsed ? parsed.errors : []),
    ];
    if (errors.length > 0 || 'errors' in parsed) {
      const draft = { text: '', options: [], values, errors };
      return seeOther(`${draftPath('/household', draft)}#error-summary`);
    }
    return seeOther(planPath(sealHousehold(parsed.household), { status: 'made' }, 'plan-title'));
  }, '/household');
}
