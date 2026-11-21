import type { NoteKey } from '@/components/copy';
import { keepFromForm, modeOf, planPath, withRoutineChange } from '@/server/edits';
import { field, handleForm, readGuardedForm, seeOther } from '@/server/http';
import { readQuestion } from '@/server/genai';
import { openHousehold, sealHousehold } from '@/server/seal';

interface Context {
  params: Promise<{ token: string }>;
}

const MAX_QUESTION = 300;

/** The fixed note that tells a reader why a question was not answered; the reason text itself never travels. */
function noteFor(reason: string): NoteKey {
  return reason.includes('AI reader') ? 'noAi' : 'notUnderstood';
}

/** Reads a question about the plan; a what-if is worked out again, any other question picks out its routine. */
export function POST(request: Request, { params }: Context): Promise<Response> {
  return handleForm(async () => {
    const form = await readGuardedForm(request, new Date());
    const { token } = await params;
    const household = openHousehold(token);
    const keep = keepFromForm(form);
    const text = field(form, 'text', MAX_QUESTION);

    const unclear = (note: NoteKey): Response =>
      seeOther(planPath(token, { ...keep, note }, 'ask'));
    if (text === '') return unclear('noQuestion');

    const result = await readQuestion({ text, household });
    if (result.kind === 'unclear') return unclear(noteFor(result.reason));

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
      return unclear('whichRoutine');
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
