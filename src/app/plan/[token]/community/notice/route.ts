// Form handler that asks Gemini to write the community notice for a household's plan.
// Layer: route (src/app). It is the only place the notice is written, and only on a button press.
// It keeps nothing: the text goes back to the page sealed inside the address.
import { communityKindOf, keepFromForm, withCommunityKind } from '@/server/edits';
import { field, handleForm, readGuardedForm, seeOther } from '@/server/http';
import { writeNotice } from '@/server/genai';
import { loadPlanView } from '@/server/plan-view';
import { airOf } from '@/server/query';
import { openHousehold } from '@/server/seal';
import { sealWritten } from '@/server/written-draft';
import { withQuery } from '@/components/links';

/** The sealed household token from the address. */
interface Context {
  params: Promise<{ token: string }>;
}

/** Writes the community notice with Gemini, only because the visitor pressed the button, and hands it back sealed. */
export function POST(request: Request, { params }: Context): Promise<Response> {
  return handleForm(async () => {
    const form = await readGuardedForm(request, new Date());
    const { token } = await params;
    const household = openHousehold(token);
    // The kind from the form when it is one of the three; otherwise the household's, or a society.
    const kind = communityKindOf(field(form, 'kind', 12), household.community?.kind ?? 'society');
    const air = airOf(keepFromForm(form).air);
    // Anything other than Hindi is English.
    const lang = field(form, 'lang', 2) === 'hi' ? 'hi' : 'en';

    const now = new Date();
    const view = await loadPlanView({
      household: withCommunityKind(household, kind),
      now,
      air,
    });
    const { community } = view;
    if (community === undefined) throw new Error('The community view was not built');

    const back = `${withQuery(`/plan/${token}/community`, { kind, air, lang })}#notice`;
    // When the air data could not be loaded, nothing is written and the page shows again.
    if (view.unavailable !== undefined) return seeOther(back);

    const written = await writeNotice({ plan: view.plan, community, lang });
    // The sealed text is tied to this household, day, air mode, language, audience and the plan's
    // decisions, and carries its issue time, so the page can refuse it if any of those differ.
    const n = sealWritten(written, {
      token,
      view,
      lang,
      audience: kind,
      now,
    });
    return seeOther(`${withQuery(`/plan/${token}/community`, { kind, air, lang, n })}#notice`);
  });
}
