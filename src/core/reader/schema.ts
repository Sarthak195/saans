// The shapes the model must return when it reads a family's text or a question, as zod schemas,
// plus the plain JSON Schema form the Gemini API takes. Pure core: no clock, network or
// environment. Every value carries the words it came from, so code can check it before use.
import { z } from 'zod';

import {
  AGE_BANDS,
  CONDITIONS,
  COOKING,
  HABITS,
  HEATING,
  INTENSITIES,
  MODES,
  ROUTINE_KINDS,
  WEEKDAYS,
} from '@/core/profile/schema';

// What the model returns. Every value travels with the words of the family's text that it came
// from, so code can check each one before it is used.

// The quote that backs a value: from 1 to 300 characters of the family's text.
const QUOTE = z.string().min(1).max(300);

// Wraps a value schema so the value always comes with its supporting quote.
function quoted<T extends z.ZodType>(value: T) {
  return z.object({ value, quote: QUOTE });
}

// Short labels and words are limited to 80 characters.
const quotedText = quoted(z.string().min(1).max(80));
const quotedNumber = quoted(z.number());

// One person in the household. Age comes as a number of years or an age word, and each
// health condition is listed on its own with its own quote.
const memberDraft = z.object({
  label: quotedText,
  years: quotedNumber.optional(),
  ageWord: quoted(z.enum(AGE_BANDS)).optional(),
  conditions: z.array(quoted(z.enum(CONDITIONS))).max(CONDITIONS.length),
});

// One routine of one person: who, what kind, and the optional start, length (minutes), intensity,
// mode of travel, distance (km) and days of the week.
const routineDraft = z.object({
  who: quotedText,
  kind: quoted(z.enum(ROUTINE_KINDS)),
  start: quotedText.optional(),
  minutes: quotedNumber.optional(),
  intensity: quoted(z.enum(INTENSITIES)).optional(),
  mode: quoted(z.enum(MODES)).optional(),
  km: quotedNumber.optional(),
  days: quoted(z.array(z.enum(WEEKDAYS)).min(1).max(WEEKDAYS.length)).optional(),
});

// The home: room size in square feet, ceiling height in feet, the purifier rating as the family
// wrote it (cfm or m3/h, read from the quote), then cooking fuel, indoor smoke habits and heating.
const homeDraft = z.object({
  roomSqft: quotedNumber.optional(),
  ceilingFt: quotedNumber.optional(),
  purifierCadrCfm: quotedNumber.optional(),
  cooking: quoted(z.enum(COOKING)).optional(),
  habits: z.array(quoted(z.enum(HABITS))).max(HABITS.length),
  heating: quoted(z.enum(HEATING)).optional(),
});

/** Which member or routine a question is about, and when. */
const questionAbout = {
  about: quotedText.optional(),
  hour: quotedNumber.optional(),
  today: quoted(z.boolean()).optional(),
};

/**
 * What the model returns after reading a family's own words: a place, up to 6 members, up to 8
 * routines, the home, and a question if the family asked one. Each value has its quote.
 */
export const readerOutputSchema = z.object({
  place: quotedText.optional(),
  members: z.array(memberDraft).max(6),
  routines: z.array(routineDraft).max(8),
  home: homeDraft,
  question: z.object({ text: quotedText, ...questionAbout }).optional(),
});

/**
 * What the model returns when it reads one question: the kind of question, who or what it is
 * about, and optionally the new start or the new mode of travel for a "what if" question.
 */
export const questionOutputSchema = z.object({
  intent: z.enum(['can_i', 'what_if_time', 'what_if_mode', 'explain']),
  ...questionAbout,
  newStart: quotedText.optional(),
  newMode: quoted(z.enum(MODES)).optional(),
});

/** A reader reply that passed the schema, still unchecked against the family's text. */
export type ReaderOutput = z.infer<typeof readerOutputSchema>;
/** A question reply that passed the schema, still unchecked against the family's text. */
export type QuestionOutput = z.infer<typeof questionOutputSchema>;
/** The part of a question reply that says what the question is about. */
export type QuestionAbout = Pick<QuestionOutput, 'about' | 'hour' | 'today'>;
/** A value with the words of the family's text that it came from. */
export interface Quoted<T> {
  value: T;
  quote: string;
}

// Keywords the API's constrained decoding cannot serve ("too many states for serving"). The zod
// schema still enforces every limit when the reply is parsed.
const UNSUPPORTED = [
  '$schema',
  'minLength',
  'maxLength',
  'minItems',
  'maxItems',
  'minimum',
  'maximum',
  'additionalProperties',
];

// Copies a JSON Schema, dropping the unsupported keywords at every depth.
function stripLimits(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripLimits);
  if (typeof value !== 'object' || value === null) return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !UNSUPPORTED.includes(key))
      .map(([key, inner]) => [key, stripLimits(inner)]),
  );
}

/** The schema in the form the Gemini API takes: plain JSON Schema without size limits or the draft marker. */
export function jsonSchemaOf(schema: z.ZodType): Record<string, unknown> {
  return stripLimits(z.toJSONSchema(schema, { target: 'draft-7' })) as Record<string, unknown>;
}
