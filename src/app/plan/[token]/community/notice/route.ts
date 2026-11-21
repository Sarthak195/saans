import { communityKindOf, keepFromForm, withCommunityKind } from '@/server/edits';
import { field, handleForm, readGuardedForm, seeOther } from '@/server/http';
import { writeNotice } from '@/server/genai';
import { loadPlanView } from '@/server/plan-view';
import { airOf } from '@/server/query';
import { openHousehold } from '@/server/seal';
import { sealWritten } from '@/server/written-draft';
import { withQuery } from '@/components/links';

interface Context {
  params: Promise<{ token: string }>;
}

/** Writes the community notice with Gemini, only because the visitor pressed the button, and hands it back sealed. */
export function POST(request: Request, { params }: Context): Promise<Response> {
  return handleForm(async () => {
    const form = await readGuardedForm(request, new Date());
    const { token } = await params;
    const household = openHousehold(token);
    const kind = communityKindOf(field(form, 'kind', 12), household.community?.kind ?? 'society');
    const air = airOf(keepFromForm(form).air);
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
    // With no air data there is nothing to write about, so the plain page shows again.
    if (view.unavailable !== undefined) return seeOther(back);

    const written = await writeNotice({ plan: view.plan, community, lang });
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
