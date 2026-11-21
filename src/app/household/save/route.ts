import type { Place } from '@/core/types';
import { draftPath, planPath, toPlace } from '@/server/edits';
import { userMessage } from '@/server/errors';
import { resolvePlace } from '@/server/geo/geocode';
import { handleForm, readGuardedForm, seeOther } from '@/server/http';
import { collectValues, parseHouseholdForm } from '@/server/household-form';
import type { FormError } from '@/server/household-form';
import { sealHousehold } from '@/server/seal';

// Stands in while the place is still unresolved, so the other fields can be checked in the same pass.
const UNSET: Place = { name: 'Unset', admin1: 'Unset', lat: 28.6, lon: 77.2 };

async function placeFrom(typed: string | undefined): Promise<{ place?: Place; error?: FormError }> {
  if (typed === undefined)
    return { error: { field: 'place', message: 'Type the place you live in.' } };
  const found = await resolvePlace(typed);
  if (found.kind === 'one') return { place: toPlace(found.place) };
  if (found.kind === 'many') {
    const names = found.options.map((o) => `${o.name} (${o.admin1})`).join(', ');
    return {
      error: {
        field: 'place',
        message: `More than one place has that name: ${names}. Type the nearest city instead.`,
      },
    };
  }
  const message = userMessage('geocode_none');
  return { error: { field: 'place', message: `${message.body} ${message.nextAction}` } };
}

/** Takes the household form: a plan when it is complete, otherwise the form again with what is wrong. */
export function POST(request: Request): Promise<Response> {
  return handleForm(async () => {
    const form = await readGuardedForm(request, new Date());
    const values = collectValues(form);
    const located = await placeFrom(values.place);
    const parsed = parseHouseholdForm(values, located.place ?? UNSET);

    const errors = [
      ...(located.error === undefined ? [] : [located.error]),
      ...('errors' in parsed ? parsed.errors : []),
    ];
    if (errors.length > 0 || 'errors' in parsed) {
      const draft = { text: '', options: [], values, errors };
      return seeOther(`${draftPath('/household', draft)}#error-summary`);
    }
    return seeOther(planPath(sealHousehold(parsed.household), { status: 'made' }, 'plan-title'));
  }, '/household');
}
