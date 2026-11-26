// The public face of the reader: what the rest of the app imports from the files behind it.
// Pure core: this file only re-exports.

// Checking what the model returned, finishing a household from it, and telling Hindi from English.
export { detectLang, finishHousehold, readDraft } from '@/core/reader/draft';
export type { FinishedDraft, HouseholdDraft } from '@/core/reader/draft';
// The word-matching reader used when the AI reader is not available, and the place list it takes.
export { keywordOutput } from '@/core/reader/keywords';
export type { PlaceName } from '@/core/reader/keywords';
// The shape of the model's reply, and the JSON schema built from it to ask for that shape.
export { jsonSchemaOf, questionOutputSchema, readerOutputSchema } from '@/core/reader/schema';
export type { QuestionOutput, ReaderOutput } from '@/core/reader/schema';
// Working out who or what a question points at.
export { hasSubject, resolveTarget } from '@/core/reader/target';
export type { TargetContext } from '@/core/reader/target';
// Reading clock times out of a quote, and tidying one into "HH:MM".
export { clockTimes, tidyClock } from '@/core/reader/clock';
