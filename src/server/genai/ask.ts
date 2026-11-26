// Helpers for talking to the model: wrapping a family's text as data, and parsing a JSON reply.
// Server layer: pure string handling, no network and no module-scope state.
import type { z } from 'zod';

import { AppError } from '@/server/errors';

/**
 * Wraps a family's text so the model sees where the data starts and ends. Angle brackets in the
 * text are swapped for look-alikes so it cannot close the wrapper early; quotes still match
 * the original, because both forms normalise to a space.
 */
export function fenced(text: string): string {
  // U+2039 and U+203A look like angle brackets to a reader but are not markup.
  const safe = text.replaceAll('<', '‹').replaceAll('>', '›');
  return `<user_text>\n${safe}\n</user_text>`;
}

/**
 * Parses a model's JSON reply against a schema; anything else is a reply we cannot use. Throws an
 * AppError of kind genai_schema when the text is not JSON or does not fit the schema.
 */
export function parseReply<S extends z.ZodType>(raw: string, schema: S): z.infer<S> {
  // The messages are fixed text: the reply itself is never copied into the error.
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    throw new AppError('genai_schema', 'The model reply was not JSON');
  }
  const parsed = schema.safeParse(json);
  if (!parsed.success) throw new AppError('genai_schema', 'The model reply did not fit the schema');
  return parsed.data;
}
