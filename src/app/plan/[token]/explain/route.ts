import { templateBriefing } from '@/core/briefing';
import { keepFromForm, planPath } from '@/server/edits';
import { field, handleForm, readGuardedForm, seeOther } from '@/server/http';
import { writeBriefing } from '@/server/genai';
import { loadPlanView } from '@/server/plan-view';
import { airOf, dayOf } from '@/server/query';
import { openHousehold } from '@/server/seal';
import { sealWritten } from '@/server/written-draft';

interface Context {
  params: Promise<{ token: string }>;
}

/** Writes the plan's summary with Gemini, only because the visitor pressed the button, and hands it back sealed. */
export function POST(request: Request, { params }: Context): Promise<Response> {
  return handleForm(async () => {
    const form = await readGuardedForm(request, new Date());
    const { token } = await params;
    const household = openHousehold(token);
    const keep = keepFromForm(form);
    const lang = field(form, 'lang', 2) === 'hi' ? 'hi' : 'en';

    const now = new Date();
    const view = await loadPlanView({
      household,
      now,
      day: dayOf(keep.day),
      air: airOf(keep.air),
    });
    if (view.unavailable !== undefined) {
      return seeOther(planPath(token, { ...keep, note: 'noAir' }, 'plan-title'));
    }

    const written = await writeBriefing({
      plan: view.plan,
      home: view.home,
      alternatives: view.alternatives,
      household: view.household,
      lang,
    });
    const b = sealWritten(written, templateBriefing(view.plan), {
      token,
      view,
      lang,
      audience: 'family',
      now,
    });
    return seeOther(planPath(token, { ...keep, b, lang }, 'summary'));
  });
}
