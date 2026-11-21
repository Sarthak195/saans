import { placeSchema } from '@/core/profile/schema';
import { withQuery } from '@/components/links';
import { keepFromForm, planPath, toPlace } from '@/server/edits';
import { userMessage } from '@/server/errors';
import { resolvePlace } from '@/server/geo/geocode';
import { field, handleForm, readGuardedForm, seeOther } from '@/server/http';
import { openHousehold, sealDraft, sealHousehold } from '@/server/seal';

interface Context {
  params: Promise<{ token: string }>;
}

/** Plans the same household somewhere else, from typed text or from a place picked in a list. */
export function POST(request: Request, { params }: Context): Promise<Response> {
  return handleForm(async () => {
    const form = await readGuardedForm(request, new Date());
    const { token } = await params;
    const household = openHousehold(token);
    const keep = keepFromForm(form);
    const moved = (place: typeof household.place): Response =>
      seeOther(
        planPath(
          sealHousehold({ ...household, place }),
          { ...keep, status: 'place' },
          'plan-title',
        ),
      );

    // A place picked from the list arrives as four fields; it is checked like any other place.
    const picked = placeSchema.safeParse({
      name: field(form, 'placeName', 80),
      admin1: field(form, 'placeAdmin1', 80),
      lat: Number(field(form, 'placeLat', 12)),
      lon: Number(field(form, 'placeLon', 12)),
    });
    if (picked.success) return moved(picked.data);

    const found = await resolvePlace(field(form, 'place', 80));
    if (found.kind === 'one') return moved(toPlace(found.place));
    if (found.kind === 'many') {
      return seeOther(
        withQuery(`/choose/${sealDraft({ text: '', options: found.options.map(toPlace) })}`, {
          for: token,
          ...keep,
        }),
      );
    }
    const message = userMessage('geocode_none');
    const reason = sealDraft({
      text: '',
      options: [],
      reason: `${message.body} ${message.nextAction}`,
    });
    return seeOther(planPath(token, { ...keep, note: reason }, 'plan-title'));
  });
}
