// The front door: a family's own words, and optionally a place or a device location, become a
// plan. Anything still missing sends them to the household form with what they gave so far.
import { MAX_TEXT } from '@/core/profile/schema';
import { draftPath, placeOfForm, placeProblem, planPath, toPlace } from '@/server/edits';
import { readHousehold } from '@/server/genai';
import type { GivenPlace } from '@/server/geo/geocode';
import { valuesOfPlace } from '@/server/household-values';
import type { FormValues } from '@/server/household-form';
import { ASK_MAX_BYTES, field, handleForm, readGuardedForm, seeOther } from '@/server/http';
import { sealDraft, sealHousehold } from '@/server/seal';

// What the household form says when a family sent no words of their own.
const NO_TEXT = 'Add who is in your family below, or go back and write a few lines about your day.';

/**
 * The place fields the household form opens with: the place that was found (as "name, state",
 * or its rounded device location), else the text as typed, so the family can correct it.
 */
function placeValues(given: GivenPlace, typed: string): FormValues {
  if (given.kind === 'one') return valuesOfPlace(toPlace(given.place));
  return typed === '' ? {} : { place: typed };
}

/** Reads a family's own words into a plan, or sends them to the one thing still needed. */
export function POST(request: Request): Promise<Response> {
  return handleForm(async () => {
    // The one reading of the clock for this request: it checks the form token and
    // goes to the reader.
    const now = new Date();
    // Same-site, size-capped and token-checked. The cap is larger than for other forms because the
    // words can run to 1500 characters, and Devanagari grows when it is percent-encoded.
    const form = await readGuardedForm(request, now, ASK_MAX_BYTES);
    const text = field(form, 'text', MAX_TEXT);

    // The place is read first, so every way on to the form below keeps it: a family that gave a
    // place or used their location never has to give it again.
    const given = await placeOfForm(form);
    // Several places share the name: the family picks one on /choose, and the words go with them.
    if (given.kind === 'many') {
      return seeOther(`/choose/${sealDraft({ text, options: given.options.map(toPlace) })}`);
    }
    // 80 characters is the cap on a typed place, the same as on the form field.
    const values = placeValues(given, field(form, 'place', 80));
    // Back to the household form, with the reason and what the family gave so far sealed in
    // the address.
    const toForm = (reason: string): Response =>
      seeOther(draftPath('/household', { text, options: [], reason, values }));

    // A place that was given but cannot be used (not found, outside India, lookup down)
    // comes first.
    const problem = placeProblem(given);
    if (problem !== undefined) return toForm(problem);
    // No words: the household form is where the family can say who they are.
    if (text === '') return toForm(NO_TEXT);

    // Reads the words with the AI reader, or by matching words when it is not available.
    const result = await readHousehold({
      text,
      now,
      // A place already found is passed on; without one the reader looks for it in the text.
      ...(given.kind === 'one' ? { place: given.place } : {}),
    });
    switch (result.kind) {
      case 'household': {
        // A question found in the words (about one routine, say) travels with the household.
        const household =
          result.target === undefined
            ? result.household
            : { ...result.household, questionTarget: result.target };
        // The notes quote the family's own labels, so only a fixed key goes into the address.
        const note = result.by === 'keywords' ? 'keywords' : 'filled';
        const query = result.notes.length === 0 ? {} : { note };
        // Land on the answer when the words held a question, otherwise on the page heading.
        const anchor = household.questionTarget === undefined ? 'plan-title' : 'answer';
        return seeOther(planPath(sealHousehold(household), { ...query, status: 'made' }, anchor));
      }
      // The place named in the words matches several places, so the family picks one.
      case 'choose_place':
        return seeOther(
          `/choose/${sealDraft({ text: result.text, options: result.options.map(toPlace) })}`,
        );
      case 'form':
        return toForm(result.reason);
    }
  });
}
