// Reads a family's own words into a household: the AI reader first, a word-matching pass when it
// is unavailable, then the place. Server layer: the model call comes in through `deps`, and no
// state is kept between calls. What the model returns is checked in src/core/reader (ADR 0005).
import { MAX_TEXT } from '@/core/profile/schema';
import {
  finishHousehold,
  jsonSchemaOf,
  keywordOutput,
  readDraft,
  readerOutputSchema,
  type HouseholdDraft,
  type ReaderOutput,
} from '@/core/reader';
import type { Place } from '@/core/types';
import { AppError } from '@/server/errors';
import { fenced, parseReply } from '@/server/genai/ask';
import { climb, isOutage } from '@/server/genai/ladder';
import type { GenaiDeps } from '@/server/genai/model';
import { READER_SYSTEM } from '@/server/genai/prompts/reader';
import type { ReaderResult } from '@/server/genai/types';
import { resolvePlace, type PlaceMatch } from '@/server/geo/geocode';
import { STATIC_PLACES } from '@/server/geo/places';

// The shape the model is asked to reply in, built from the same schema that checks the reply.
const READER_SCHEMA = jsonSchemaOf(readerOutputSchema);
// The most tokens the model may write in one reply.
const MAX_OUTPUT_TOKENS = 3000;

// What a family reads when the text cannot become a household, one line per case, and the note
// shown when the words were matched without the AI reader. They are fixed text.
const NO_AI_NOTE =
  'We read this by matching words, without the AI reader. Please check each detail.';
const EMPTY_TEXT = 'Type a few lines about your family first, or fill in the form.';
const NO_MEMBER = 'We could not find who is in your family from that text. Add them in the form.';
const NO_PLACE = 'Tell us which city or area you live in, in the form.';
const PLACE_LOOKUP = 'We could not look up that place right now. Choose it in the form.';
const PLACE_NONE = 'We could not find that place in India. Check the spelling in the form.';

/** One decimal, the precision a household keeps for a place. */
function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

/** A place match as a household keeps it: position rounded to one decimal degree. */
function toPlace(match: PlaceMatch): Place {
  return { name: match.name, admin1: match.admin1, lat: round1(match.lat), lon: round1(match.lon) };
}

/**
 * Asks the AI reader to read the text. The reader model is tried first and then the fallback, and
 * only a quota, timeout or service failure moves on to the next model. Gives undefined when
 * there is no client or no model gave a usable reply, so the caller uses word matching.
 */
async function askModel(text: string, deps: GenaiDeps): Promise<ReaderOutput | undefined> {
  const { call, models } = deps;
  // No client is set up (there is no API key): the AI reader is skipped.
  if (call === null) return undefined;
  const outcome = await climb(
    [models.reader, models.fallback],
    async (model) =>
      parseReply(
        await call({
          model,
          system: READER_SYSTEM,
          // The family's text goes in wrapped, so the model sees where the data starts and ends.
          input: fenced(text),
          schema: READER_SCHEMA,
          temperature: 0,
          thinking: 'low',
          maxOutputTokens: MAX_OUTPUT_TOKENS,
        }),
        readerOutputSchema,
      ),
    isOutage,
  );
  return outcome.ok ? outcome.value : undefined;
}

/**
 * The place the family gave, else the one they named, else one found in the text by name. A
 * ReaderResult comes back instead when the family has to choose or fill in the form.
 */
async function placeFor(
  text: string,
  draft: HouseholdDraft,
  given: PlaceMatch | undefined,
): Promise<Place | ReaderResult> {
  // A place the family already picked or typed in the form wins over anything read from the text.
  if (given) return toPlace(given);
  // The place the model quoted, else a listed place found in the text by matching words.
  const query = draft.placeQuery ?? keywordOutput(text, STATIC_PLACES).place?.value;
  if (query === undefined) return { kind: 'form', reason: NO_PLACE, text };
  try {
    const found = await resolvePlace(query);
    if (found.kind === 'one') return toPlace(found.place);
    if (found.kind === 'many') return { kind: 'choose_place', options: found.options, text };
    return { kind: 'form', reason: PLACE_NONE, text };
  } catch (error) {
    // A place search that cannot be reached is shown as a problem with the form; anything else
    // is a real fault and is rethrown.
    if (error instanceof AppError) return { kind: 'form', reason: PLACE_LOOKUP, text };
    throw error;
  }
}

/** Tells a ReaderResult from a Place: only a result has a `kind`. */
function isResult(value: Place | ReaderResult): value is ReaderResult {
  return 'kind' in value;
}

/**
 * Reads a family's own words into a household. The AI reader proposes values with quotes and code
 * keeps only what the text supports; when the AI is unavailable, or finds nobody, a word-matching
 * pass reads the same text and its output goes through the same checks.
 */
export async function readWithDeps(
  input: { text: string; place?: PlaceMatch },
  deps: GenaiDeps,
): Promise<ReaderResult> {
  // The text is cut to MAX_TEXT (1500 characters).
  const text = input.text.trim().slice(0, MAX_TEXT);
  if (text === '') return { kind: 'form', reason: EMPTY_TEXT, text: input.text };

  const model = await askModel(text, deps);
  // The model's output is checked against the text before anything is used.
  let draft = model === undefined ? undefined : readDraft(text, model);
  let by: 'gemini' | 'keywords' = 'gemini';
  // The word-matching pass runs when the AI gave nothing or found nobody. It is checked by the
  // same readDraft, and the family is told to check each detail.
  if (draft === undefined || draft.members.length === 0) {
    draft = readDraft(text, keywordOutput(text, STATIC_PLACES));
    by = 'keywords';
  }
  if (draft.members.length === 0) return { kind: 'form', reason: NO_MEMBER, text };

  const place = await placeFor(text, draft, input.place);
  if (isResult(place)) return place;
  const finished = finishHousehold(draft, place, text);
  if (!finished.ok) return { kind: 'form', reason: finished.reason, text };
  return {
    kind: 'household',
    household: finished.household,
    ...(finished.target === undefined ? {} : { target: finished.target }),
    notes: by === 'keywords' ? [NO_AI_NOTE, ...finished.notes] : finished.notes,
    by,
  };
}
