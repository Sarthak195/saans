// The route behind the button that writes the plan's summary (a form POST): it asks for a written
// summary and redirects to the plan with the result sealed into the link.
// App layer: it reads the form and picks the next page. Nothing is stored on the server.

import { keepFromForm, planPath } from '@/server/edits';
import { field, handleForm, readGuardedForm, seeOther } from '@/server/http';
import { writeBriefing } from '@/server/genai';
import { noCache } from '@/server/genai/cache';
import { defaultDeps } from '@/server/genai/config';
import { loadPlanView } from '@/server/plan-view';
import { airOf, dayOf } from '@/server/query';
import { openHousehold } from '@/server/seal';
import { sealWritten } from '@/server/written-draft';

/** The route context: the sealed household token from the path. */
interface Context {
  params: Promise<{ token: string }>;
}

/**
 * Writes the plan's summary with Gemini, only because the visitor pressed the button, and hands
 * it back sealed.
 */
export function POST(request: Request, { params }: Context): Promise<Response> {
  return handleForm(async () => {
    // The form must come from this site and carry a form token we issued lately.
    const form = await readGuardedForm(request, new Date());
    const { token } = await params;
    const household = openHousehold(token);
    const keep = keepFromForm(form);
    // Anything other than 'hi' reads as English, so the language is always one of the two.
    const lang = field(form, 'lang', 2) === 'hi' ? 'hi' : 'en';

    // The plan is built again from the sealed household and the day and air choices carried in
    // the form.
    const now = new Date();
    const view = await loadPlanView({
      household,
      now,
      day: dayOf(keep.day),
      air: airOf(keep.air),
    });
    // With no air data there is no plan to write about, so go back with a note instead.
    if (view.unavailable !== undefined) {
      return seeOther(planPath(token, { ...keep, note: 'noAir' }, 'plan-title'));
    }

    const written = await writeBriefing(
      {
        plan: view.plan,
        home: view.home,
        alternatives: view.alternatives,
        household: view.household,
        lang,
      },
      // "Write it again" must not hand back the text the page already remembers for these facts.
      // Only English skips the cache this way; Hindi uses the default dependencies.
      lang === 'en' ? { ...defaultDeps(), cache: noCache } : undefined,
    );
    // The written text is sealed into a short parameter, so the page can show it after the
    // redirect without keeping it.
    const b = sealWritten(written, {
      token,
      view,
      lang,
      audience: 'family',
      now,
    });
    return seeOther(planPath(token, { ...keep, b, lang }, 'summary'));
  });
}
