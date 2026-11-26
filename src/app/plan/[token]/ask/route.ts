// The route that takes a family's question about their plan (a form POST) and redirects.
// App layer: it only reads the form and picks the next page. The reading of the question
// is in src/server/genai, and nothing is kept: the household travels in the sealed token.

import type { NoteKey } from '@/components/copy';
import { keepFromForm, modeOf, planPath, withRoutineChange } from '@/server/edits';
import { field, handleForm, readGuardedForm, seeOther } from '@/server/http';
import { readQuestion } from '@/server/genai';
import { openHousehold, sealHousehold } from '@/server/seal';

/** The route context: the sealed household token from the path. */
interface Context {
  params: Promise<{ token: string }>;
}

// The longest question kept, in characters; the rest is cut off.
const MAX_QUESTION = 300;

/**
 * The fixed note that tells a reader why a question was not answered; the reason text itself
 * never travels.
 */
function noteFor(reason: string): NoteKey {
  return reason.includes('AI reader') ? 'noAi' : 'notUnderstood';
}

/**
 * Reads a question about the plan. A what-if (a new start time or mode) is worked out again on
 * a changed copy of the household. Any other question goes to the answer page with the question
 * and its target kept in the sealed household. When the question cannot be used, it redirects
 * back with a fixed note.
 */
export function POST(request: Request, { params }: Context): Promise<Response> {
  return handleForm(async () => {
    // The form must come from this site and carry a form token we issued lately.
    const form = await readGuardedForm(request, new Date());
    const { token } = await params;
    const household = openHousehold(token);
    const keep = keepFromForm(form);
    const text = field(form, 'text', MAX_QUESTION);

    // A question that cannot be used sends the reader back to the ask section with a fixed note.
    const unclear = (note: NoteKey): Response =>
      seeOther(planPath(token, { ...keep, note }, 'ask'));
    if (text === '') return unclear('noQuestion');

    const result = await readQuestion({ text, household });
    if (result.kind === 'unclear') return unclear(noteFor(result.reason));

    // The question and what it was about are kept in the sealed household, so the answer page
    // can show them without storing anything.
    const asked = { ...household, question: text, questionTarget: result.target };
    const { routineId } = result.target;
    // Only these two intents change the plan; every other intent leaves it as it is.
    const isChange = result.intent === 'what_if_time' || result.intent === 'what_if_mode';
    if (!isChange) {
      return seeOther(planPath(sealHousehold(asked), { ...keep, status: 'asked' }, 'answer'));
    }

    // A change needs a routine to apply it to. Without one, or with an id the household does
    // not have, the reader is asked which routine they meant.
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
