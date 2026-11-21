import { withQuery } from '@/components/links';
import { keepFromForm, pickedPlace, planPath, toPlace } from '@/server/edits';
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

    const picked = pickedPlace(form);
    if (picked !== undefined) return moved(picked);

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
    return seeOther(planPath(token, { ...keep, note: 'placeNotFound' }, 'plan-title'));
  });
}
