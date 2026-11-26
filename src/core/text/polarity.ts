// Checks that written text about a plan does not reassure a family about something the plan
// advises against. Layer: core (pure). The checks are lexical, using the reassurance word list.
import { reassurancePhrases } from '@/core/text/lexicon';
import { normalizeText } from '@/core/text/normalize';
import type { Decision } from '@/core/decision';

/** What the plan advises for an item: keep, lighten, move, indoors or essential. */
export type { Decision };

/** One routine or member the text must treat correctly: its placeholder ref and decision. */
export interface PolarityItem {
  ref: string;
  decision: Decision;
}

/** The outcome of checkPolarity: `ok` is true only when all three lists are empty. */
export interface PolarityResult {
  ok: boolean;
  /** Non-keep refs the text never mentions. */
  missing: string[];
  /** Non-keep refs named in a sentence that also reassures. */
  reassuringAboutNonKeep: string[];
  /** Placeholder-looking refs (routine_N, member_N) that are not in the items. */
  invented: string[];
}

// A full stop between digits is a decimal point, not the end of a sentence.
const SENTENCE_BREAK = /(?<!\d)\.|\.(?!\d)|[!?।॥\n\r]+/;
// A placeholder such as routine_3 or member_1, not part of a longer word.
const REF_LIKE = /(?<![a-z0-9_])(?:routine|member)_\d+(?![a-z0-9_])/gi;

// "not safe" and "safe nahi hai" warn; they must not be mistaken for reassurance.
const NEGATORS = new Set([
  'not',
  'isnt',
  'arent',
  'wasnt',
  'never',
  'cant',
  'cannot',
  'dont',
  'wont',
]);
const AFTER_NEGATORS = new Set(['nahi', 'nahin', 'not', 'नहीं']);
// How many words before a phrase are searched for a negator.
const NEGATION_LOOKBACK = 2;

// Whether the sentence names this exact ref, so routine_1 does not match routine_10.
function namesRef(sentence: string, ref: string): boolean {
  const escaped = ref.replace(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);
  return new RegExp(`(?<![a-z0-9_])${escaped}(?![a-z0-9_])`).test(sentence);
}

// Whether the phrase's words appear in order starting at position `at`.
function phraseAt(tokens: readonly string[], phrase: readonly string[], at: number): boolean {
  return phrase.every((word, i) => tokens[at + i] === word);
}

// Whether a phrase at `at` is negated, by a negator just before it ("not safe") or by a word just
// after it ("safe nahi hai"), unless the phrase itself ends in that word.
function isNegated(tokens: readonly string[], phrase: readonly string[], at: number): boolean {
  const before = tokens.slice(Math.max(0, at - NEGATION_LOOKBACK), at);
  if (before.some((t) => NEGATORS.has(t))) return true;
  const last = phrase.at(-1);
  const next = tokens[at + phrase.length];
  return (
    next !== undefined &&
    AFTER_NEGATORS.has(next) &&
    last !== undefined &&
    !AFTER_NEGATORS.has(last)
  );
}

// Whether a sentence holds a reassurance phrase that is not negated.
function reassures(sentence: string): boolean {
  const tokens = normalizeText(sentence).split(' ');
  return reassurancePhrases().some((phrase) =>
    tokens.some((_, at) => phraseAt(tokens, phrase, at) && !isNegated(tokens, phrase, at)),
  );
}

/**
 * Guards a briefing against telling a family everything is fine about something the plan advises
 * against. Every routine or member the plan changes must be mentioned, no sentence that mentions
 * one may reassure, and the text may not refer to a placeholder the plan never defined.
 */
export function checkPolarity(text: string, items: readonly PolarityItem[]): PolarityResult {
  // Refs are lower case in the text and in the lookups, so case never hides a mention.
  const lower = text.toLowerCase();
  const sentences = lower.split(SENTENCE_BREAK);
  // Only changed items need to be named; a kept item may be left out or mentioned freely.
  const nonKeep = items.filter((i) => i.decision !== 'keep').map((i) => i.ref.toLowerCase());
  const known = new Set(items.map((i) => i.ref.toLowerCase()));

  const missing = nonKeep.filter((ref) => !sentences.some((s) => namesRef(s, ref)));
  const reassuringAboutNonKeep = nonKeep.filter((ref) =>
    sentences.some((s) => namesRef(s, ref) && reassures(s)),
  );
  // Any routine_N or member_N that is not one of the plan's refs was made up by the writer.
  const invented = [...new Set(lower.match(REF_LIKE) ?? [])].filter((ref) => !known.has(ref));

  return {
    ok: missing.length === 0 && reassuringAboutNonKeep.length === 0 && invented.length === 0,
    missing,
    reassuringAboutNonKeep,
    invented,
  };
}
