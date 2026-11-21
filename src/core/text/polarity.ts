import { reassurancePhrases } from '@/core/text/lexicon';
import { normalizeText } from '@/core/text/normalize';
import type { Decision } from '@/core/decision';

export type { Decision };

export interface PolarityItem {
  ref: string;
  decision: Decision;
}

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
const NEGATION_LOOKBACK = 2;

function namesRef(sentence: string, ref: string): boolean {
  const escaped = ref.replace(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);
  return new RegExp(`(?<![a-z0-9_])${escaped}(?![a-z0-9_])`).test(sentence);
}

function phraseAt(tokens: readonly string[], phrase: readonly string[], at: number): boolean {
  return phrase.every((word, i) => tokens[at + i] === word);
}

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
  const lower = text.toLowerCase();
  const sentences = lower.split(SENTENCE_BREAK);
  const nonKeep = items.filter((i) => i.decision !== 'keep').map((i) => i.ref.toLowerCase());
  const known = new Set(items.map((i) => i.ref.toLowerCase()));

  const missing = nonKeep.filter((ref) => !sentences.some((s) => namesRef(s, ref)));
  const reassuringAboutNonKeep = nonKeep.filter((ref) =>
    sentences.some((s) => namesRef(s, ref) && reassures(s)),
  );
  const invented = [...new Set(lower.match(REF_LIKE) ?? [])].filter((ref) => !known.has(ref));

  return {
    ok: missing.length === 0 && reassuringAboutNonKeep.length === 0 && invented.length === 0,
    missing,
    reassuringAboutNonKeep,
    invented,
  };
}
