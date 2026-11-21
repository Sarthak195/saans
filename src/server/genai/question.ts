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

const QUESTION_SCHEMA = jsonSchemaOf(questionOutputSchema);
const MAX_OUTPUT_TOKENS = 800;

const EMPTY = 'Type a question first.';
const NO_AI =
  'Questions need the AI reader, which is not available right now. Pick a routine from the plan instead.';
const NOT_UNDERSTOOD = 'We could not tell which routine you mean. Pick one from the plan instead.';

type Intent = Extract<QuestionResult, { kind: 'question' }>['intent'];

/** The new start time, only when the quote really has that clock time. */
function newStartOf(text: string, output: QuestionOutput): string | undefined {
  const start = output.newStart;
  if (!start || !quoteInText(text, start.quote)) return undefined;
  const wanted = tidyClock(start.value);
  return wanted !== undefined && clockTimes(start.quote).includes(wanted) ? wanted : undefined;
}

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
  const text = input.text.trim().slice(0, MAX_TEXT);
  if (text === '') return { kind: 'unclear', reason: EMPTY };
  const { call, models } = deps;
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
    isOutage,
  );
  if (!outcome.ok) return { kind: 'unclear', reason: NO_AI };

  const output = outcome.value;
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
