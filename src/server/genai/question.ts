// Sorts one question about the plan: the model proposes an intent, a target and an optional
// new time or mode, and code keeps only what the question's own words support. Server layer: all
// I/O comes in through deps, and any failure ends in an "unclear" result, never an exception.
import { MAX_TEXT } from '@/core/profile/schema';
import {
  clockTimes,
  hasSubject,
  jsonSchemaOf,
  questionOutputSchema,
  resolveTarget,
  tidyClock,
  type QuestionOutput,
} from '@/core/reader';
import type { Household } from '@/core/types';
import { quoteInText, valueSupportedByQuote } from '@/core/text';
import { fenced, parseReply } from '@/server/genai/ask';
import { climb, isOutage } from '@/server/genai/ladder';
import type { GenaiDeps } from '@/server/genai/model';
import { QUESTION_SYSTEM } from '@/server/genai/prompts/question';
import type { QuestionResult } from '@/server/genai/types';

// The JSON Schema sent to the model, made from the same zod schema that checks the reply.
const QUESTION_SCHEMA = jsonSchemaOf(questionOutputSchema);
// Cap on the reply's tokens (thinking included); the reply is a small JSON object.
const MAX_OUTPUT_TOKENS = 800;

// What the family sees when the question cannot be used: empty, no AI, or not understood.
const EMPTY = 'Type a question first.';
const NO_AI =
  'Questions need the AI reader, which is not available right now. Pick a routine from the plan instead.';
const NOT_UNDERSTOOD = 'We could not tell which routine you mean. Pick one from the plan instead.';

type Intent = Extract<QuestionResult, { kind: 'question' }>['intent'];

/**
 * The new start time, only when the quote really has that clock time. The quote must be in the
 * question, and the time the model gave must be one the quote reads as, so "5 pm" cannot be
 * turned into 05:00.
 */
function newStartOf(text: string, output: QuestionOutput): string | undefined {
  const start = output.newStart;
  if (!start || !quoteInText(text, start.quote)) return undefined;
  const wanted = tidyClock(start.value);
  return wanted !== undefined && clockTimes(start.quote).includes(wanted) ? wanted : undefined;
}

// The new travel mode, only when the quote is in the question and its words support that mode.
function newModeOf(text: string, output: QuestionOutput) {
  const mode = output.newMode;
  const ok = mode && quoteInText(text, mode.quote) && valueSupportedByQuote(mode.value, mode.quote);
  return ok ? mode.value : undefined;
}

/**
 * Sorts one question into an intent, the routine or member it is about, and a new time or way of
 * travelling. Each part must be in the question's own words; what cannot be checked is dropped,
 * and a question with nothing left to act on is reported as unclear.
 */
export async function questionWithDeps(
  input: { text: string; household: Household },
  deps: GenaiDeps,
): Promise<QuestionResult> {
  // Long text is cut to MAX_TEXT characters before it is sent or checked.
  const text = input.text.trim().slice(0, MAX_TEXT);
  if (text === '') return { kind: 'unclear', reason: EMPTY };
  const { call, models } = deps;
  // No API key, so there is no model to ask.
  if (call === null) return { kind: 'unclear', reason: NO_AI };

  const outcome = await climb(
    [models.reader, models.fallback],
    async (model) =>
      parseReply(
        await call({
          model,
          system: QUESTION_SYSTEM,
          input: fenced(text),
          schema: QUESTION_SCHEMA,
          temperature: 0,
          thinking: 'low',
          maxOutputTokens: MAX_OUTPUT_TOKENS,
        }),
        questionOutputSchema,
      ),
    // Only quota, timeout and outage failures move to the fallback model; a bad reply stops here.
    isOutage,
  );
  if (!outcome.ok) return { kind: 'unclear', reason: NO_AI };

  const output = outcome.value;
  // The target is resolved against the question's text and the household's own members and
  // routines.
  const target = resolveTarget(text, output, {
    members: input.household.members,
    routines: input.household.routines,
  });
  const newStart = newStartOf(text, output);
  const newMode = newModeOf(text, output);
  if (!hasSubject(target) && newStart === undefined && newMode === undefined) {
    return { kind: 'unclear', reason: NOT_UNDERSTOOD };
  }
  // A what-if needs the new time or way it asks about; without one it is a plain question.
  let intent: Intent = output.intent === 'explain' ? 'explain' : 'can_i';
  if (newMode !== undefined) intent = 'what_if_mode';
  if (newStart !== undefined) intent = 'what_if_time';
  return {
    kind: 'question',
    intent,
    target,
    ...(newStart === undefined ? {} : { newStart }),
    ...(newMode === undefined ? {} : { newMode }),
  };
}
