import type { z } from 'zod';

import { AppError } from '@/server/errors';

/**
 * Wraps a family's text so the model sees where the data starts and ends. Angle brackets in the
 * text are swapped for look-alikes so it cannot close the wrapper early; quotes still match
 * the original, because both forms normalise to a space.
 */
export function fenced(text: string): string {
  const safe = text.replaceAll('<', '‹').replaceAll('>', '›');
  return `<user_text>\n${safe}\n</user_text>`;
}

/** Parses a model's JSON reply against a schema; anything else is a reply we cannot use. */
export function parseReply<S extends z.ZodType>(raw: string, schema: S): z.infer<S> {
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
