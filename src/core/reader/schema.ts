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

const QUOTE = z.string().min(1).max(300);

function quoted<T extends z.ZodType>(value: T) {
  return z.object({ value, quote: QUOTE });
}

const quotedText = quoted(z.string().min(1).max(80));
const quotedNumber = quoted(z.number());

const memberDraft = z.object({
  label: quotedText,
  years: quotedNumber.optional(),
  ageWord: quoted(z.enum(AGE_BANDS)).optional(),
  conditions: z.array(quoted(z.enum(CONDITIONS))).max(CONDITIONS.length),
});

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

export const readerOutputSchema = z.object({
  place: quotedText.optional(),
  members: z.array(memberDraft).max(6),
  routines: z.array(routineDraft).max(8),
  home: homeDraft,
  question: z.object({ text: quotedText, ...questionAbout }).optional(),
});

export const questionOutputSchema = z.object({
  intent: z.enum(['can_i', 'what_if_time', 'what_if_mode', 'explain']),
  ...questionAbout,
  newStart: quotedText.optional(),
  newMode: quoted(z.enum(MODES)).optional(),
});

export type ReaderOutput = z.infer<typeof readerOutputSchema>;
export type QuestionOutput = z.infer<typeof questionOutputSchema>;
export type QuestionAbout = Pick<QuestionOutput, 'about' | 'hour' | 'today'>;
export interface Quoted<T> {
  value: T;
  quote: string;
}

/** The schema in the form the Gemini API takes: plain JSON Schema, without the draft marker. */
export function jsonSchemaOf(schema: z.ZodType): Record<string, unknown> {
  const full = z.toJSONSchema(schema, { target: 'draft-7' }) as Record<string, unknown>;
  return Object.fromEntries(Object.entries(full).filter(([key]) => key !== '$schema'));
}
