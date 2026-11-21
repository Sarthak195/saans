import 'server-only';

import { GoogleGenAI } from '@google/genai';

import { AppError } from '@/server/errors';
import { classifyError } from '@/server/genai/classify';
import type { ModelCall, ModelRequest } from '@/server/genai/model';

/** The only place the Gemini SDK is used. */

export const CALL_TIMEOUT_MS = 6000;

/** Turns an answer that is not a finished text reply into the kind of failure it is. */
function failureOf(status: string, text: string | undefined): AppError | undefined {
  if (status === 'completed') {
    return text === undefined || text.trim() === ''
      ? new AppError('genai_blocked', 'The model returned no text')
      : undefined;
  }
  // Thinking can use up the output budget; the text that is left is cut short and unusable.
  if (status === 'incomplete') return new AppError('genai_schema', 'The model reply was cut short');
  return new AppError('genai_unavailable', `The model ended with status ${status}`);
}

async function send(apiKey: string, request: ModelRequest): Promise<string> {
  // Built per call: a client held at module scope would be state shared between requests.
  const ai = new GoogleGenAI({ apiKey });
  const interaction = await ai.interactions.create(
    {
      model: request.model,
      // The text can be a family's private details; nothing is kept on Google's side for later.
      store: false,
      input: request.input,
      system_instruction: request.system,
      ...(request.schema === undefined
        ? {}
        : {
            response_format: {
              type: 'text' as const,
              mime_type: 'application/json',
              schema: request.schema,
            },
          }),
      generation_config: {
        temperature: request.temperature,
        thinking_level: request.thinking,
        max_output_tokens: request.maxOutputTokens,
      },
      automatic_continuation: false,
    },
    // One attempt: the ladder, not the SDK, decides whether to try another model.
    { signal: AbortSignal.timeout(CALL_TIMEOUT_MS), retries: { strategy: 'none' } },
  );
  const failure = failureOf(interaction.status, interaction.output_text);
  if (failure) throw failure;
  return interaction.output_text ?? '';
}

/** A model call that uses the given key. Failures are thrown as AppErrors of the genai kinds. */
export function makeGeminiCall(apiKey: string): ModelCall {
  return async (request) => {
    try {
      return await send(apiKey, request);
    } catch (error) {
      throw classifyError(error);
    }
  };
}
