import { keepFromForm, modeOf, planPath, withRoutineChange } from '@/server/edits';
import { field, handleForm, readGuardedForm, seeOther } from '@/server/http';
import { readQuestion } from '@/server/genai';
import { openHousehold, sealDraft, sealHousehold } from '@/server/seal';

interface Context {
  params: Promise<{ token: string }>;
}

const MAX_QUESTION = 300;

/** A sealed line of our own words for the plan page to show after the redirect. */
function note(reason: string): string {
  return sealDraft({ text: '', options: [], reason: reason.slice(0, 300) });
}

/** Reads a question about the plan; a what-if is worked out again, any other question picks out its routine. */
export function POST(request: Request, { params }: Context): Promise<Response> {
  return handleForm(async () => {
    const form = await readGuardedForm(request, new Date());
    const { token } = await params;
    const household = openHousehold(token);
    const keep = keepFromForm(form);
    const text = field(form, 'text', MAX_QUESTION);

    const unclear = (reason: string): Response =>
      seeOther(planPath(token, { ...keep, note: note(reason) }, 'ask'));
    if (text === '') return unclear('Type a question first.');

    const result = await readQuestion({ text, household });
    if (result.kind === 'unclear') return unclear(result.reason);

    const asked = { ...household, question: text, questionTarget: result.target };
    const { routineId } = result.target;
    const isChange = result.intent === 'what_if_time' || result.intent === 'what_if_mode';
    if (!isChange) {
      return seeOther(planPath(sealHousehold(asked), { ...keep, status: 'asked' }, 'answer'));
    }

    const changed =
      routineId === undefined
        ? undefined
        : withRoutineChange(asked, {
            routineId,
            newStart: result.newStart,
            newMode: result.newMode === undefined ? undefined : modeOf(result.newMode),
          });
    if (changed === undefined || routineId === undefined) {
      return unclear('Say which routine you mean, for example the evening walk.');
    }
    return seeOther(
      planPath(
        sealHousehold(changed),
        { ...keep, status: 'asked', from: token, r: routineId },
        'answer',
      ),
    );
  });
}
