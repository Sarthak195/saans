// Plans the same household somewhere else: from typed text, a pick from a list, or the device
// location. The family, routines and home stay as they were; only the place changes.
import { withQuery } from '@/components/links';
import type { NoteKey } from '@/components/copy';
import { keepFromForm, placeOfForm, planPath, toPlace } from '@/server/edits';
import type { GivenPlace } from '@/server/geo/geocode';
import { handleForm, readGuardedForm, seeOther } from '@/server/http';
import { openHousehold, sealDraft, sealHousehold } from '@/server/seal';

interface Context {
  params: Promise<{ token: string }>;
}

// A link carries only a fixed key for the line to show, never words a family or a server wrote.
const PROBLEM_NOTE: Record<Exclude<GivenPlace['kind'], 'one' | 'many'>, NoteKey> = {
  none: 'placeNotFound',
  outside_india: 'placeOutside',
  unreachable: 'placeLookup',
  not_given: 'placeMissing',
};

/** Plans the same household somewhere else, or says why the place could not be used. */
export function POST(request: Request, { params }: Context): Promise<Response> {
  return handleForm(async () => {
    const form = await readGuardedForm(request, new Date());
    const { token } = await params;
    const household = openHousehold(token);
    const keep = keepFromForm(form);

    const given = await placeOfForm(form);
    switch (given.kind) {
      case 'one':
        return seeOther(
          planPath(
            sealHousehold({ ...household, place: toPlace(given.place) }),
            { ...keep, status: 'place' },
            'plan-title',
          ),
        );
      case 'many':
        // The pick posts back here (the "for" link), so the plan keeps its family.
        return seeOther(
          withQuery(`/choose/${sealDraft({ text: '', options: given.options.map(toPlace) })}`, {
            for: token,
            ...keep,
          }),
        );
      case 'none':
      case 'outside_india':
      case 'unreachable':
      case 'not_given':
        return seeOther(planPath(token, { ...keep, note: PROBLEM_NOTE[given.kind] }, 'plan-title'));
    }
  });
}
