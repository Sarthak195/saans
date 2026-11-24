import type { Decision } from '@/core/decision';
import type { Plan } from '@/core/plan/types';
import type { Language } from '@/core/types';
import { checkNumbers, checkPolarity } from '@/core/text';

const MAX_CHARS = 1200;
const MIN_SENTENCES = 2;
const MAX_SENTENCES = 8;
// A Hindi sentence may carry a placeholder or a level name in Latin letters, but not be mostly English.
const MIN_SENTENCE_SHARE = 0.25;
const DEVANAGARI = /\p{Script=Devanagari}/gu;
const LETTERS = /\p{L}/gu;
const SENTENCE_BREAK = /(?<!\d)\.|\.(?!\d)|[!?।॥\n\r]+/;
const MARKUP = /[{}<>`]/;
// Not markup, but a family would read it as a link or an address to follow.
const URL_LIKE = new RegExp(
  [
    '://',
    String.raw`(?:^|[^\p{L}\p{N}])www\.`,
    String.raw`[\p{L}\p{N}-]@[\p{L}\p{N}]`,
    String.raw`(?:^|[^\p{L}\p{N}])(?:wa\.me|bit\.ly|t\.me|goo\.gl|nic\.in)`,
    String.raw`[\p{L}\p{N}-]\.(?:com|org|net|edu|gov|info|biz|io|app|dev|xyz|top|site|online|link|page|shop|store|news|live|club)(?![\p{L}\p{N}])`,
  ].join('|'),
  'iu',
);
// Built from code points so this file does not itself contain the characters it removes.
const EN_DASH = String.fromCodePoint(0x2013);
const EM_DASH = String.fromCodePoint(0x2014);

export interface CheckResult {
  ok: boolean;
  /** Short reasons for a rejected text, for the tests and the maintainers. Never shown to a family. */
  reasons: string[];
}

/** Dashes read badly out loud and in a narrow column; a range becomes "to", a pause a comma. */
export function tidyText(text: string): string {
  return text
    .replace(new RegExp(`(\\d)\\s*[${EN_DASH}${EM_DASH}]\\s*(\\d)`, 'g'), '$1 to $2')
    .replace(new RegExp(`\\s*[${EN_DASH}${EM_DASH}]\\s*`, 'g'), ', ')
    .replace(/[*#]+/g, '')
    .replace(/[ \t]+/g, ' ')
    .trim();
}

function devanagariShare(text: string): number {
  const letters = text.match(LETTERS)?.length ?? 0;
  return letters === 0 ? 0 : (text.match(DEVANAGARI)?.length ?? 0) / letters;
}

function hasEnglishSentence(text: string): boolean {
  return text
    .split(SENTENCE_BREAK)
    .some(
      (sentence) =>
        sentence.match(LETTERS) !== null && devanagariShare(sentence) < MIN_SENTENCE_SHARE,
    );
}

function sentenceCount(text: string): number {
  return text.split(SENTENCE_BREAK).filter((s) => s.trim() !== '').length;
}

/** True when any one sentence tells the reader things are fine (a nudge toward "safe"). */
export function reassuresAnywhere(text: string): boolean {
  // checkPolarity looks for reassurance in sentences that name a plan item, so each sentence is
  // given a stand-in item to name.
  return text
    .split(SENTENCE_BREAK)
    .some(
      (sentence) =>
        checkPolarity(`routine_0 ${sentence}`, [{ ref: 'routine_0', decision: 'move' }])
          .reassuringAboutNonKeep.length > 0,
    );
}

export interface PolarityRef {
  ref: string;
  decision: Decision;
}

/** The refs a briefing may mention: every routine with its decision, and every member as a keep. */
export function polarityRefs(plan: Plan): PolarityRef[] {
  return [
    ...plan.routines.map((r) => ({ ref: r.ref, decision: r.decision })),
    ...plan.members.map((m) => ({ ref: m.memberRef, decision: 'keep' as const })),
  ];
}

/**
 * Members whose routines the plan changes, each with one of those decisions. A text may not
 * reassure about such a member ("member_2 is safe to play outside"), but need not mention them.
 */
export function memberGuards(plan: Plan): PolarityRef[] {
  return plan.members.flatMap((m) => {
    const changed = plan.routines.find((r) => r.memberRef === m.memberRef && r.decision !== 'keep');
    return changed === undefined ? [] : [{ ref: m.memberRef, decision: changed.decision }];
  });
}

// A summary for a family that asked nothing must not answer a question it made up.
const MENTIONS_QUESTION = /\b(you|they) (asked|wanted to know)\b|\byour question\b|पूछ/iu;

/**
 * Decides whether written text may be shown. Every number must be one the plan computed (an hour
 * or minute only when written as a time), every
 * routine the plan changes must be named and not reassured about, no placeholder may be made up,
 * and the text must be in the language asked for and free of markup.
 */
export function checkWritten(
  text: string,
  options: {
    lang: Language;
    allowedNumbers: readonly number[];
    refs: readonly PolarityRef[];
    memberGuards?: readonly PolarityRef[];
    noReassurance?: boolean;
    /** Allowed numbers that are in the facts only as an hour or minute: fine as a time, not as a count. */
    clockOnly?: readonly number[];
    /** Place name and labels: numbers inside them are fine, but only as part of the exact string. */
    names?: readonly string[];
    /** False when the family asked nothing, so the text may not say they did. */
    asked?: boolean;
  },
): CheckResult {
  const reasons: string[] = [];
  if (text.trim() === '') return { ok: false, reasons: ['empty'] };
  if (text.length > MAX_CHARS) reasons.push('too long');
  if (MARKUP.test(text)) reasons.push('markup');
  if (URL_LIKE.test(text)) reasons.push('link');
  const sentences = sentenceCount(text);
  if (sentences < MIN_SENTENCES || sentences > MAX_SENTENCES) reasons.push('sentence count');

  const share = devanagariShare(text);
  if (options.lang === 'hi' ? share < 0.4 : share > 0.05) reasons.push('wrong language');
  // A Hindi text that drops an English sentence in the middle is not Hindi throughout.
  if (options.lang === 'hi' && hasEnglishSentence(text)) reasons.push('English sentence');

  const numbers = checkNumbers(text, options.allowedNumbers, {
    ...(options.clockOnly === undefined ? {} : { clockOnly: options.clockOnly }),
    ...(options.names === undefined ? {} : { masks: options.names }),
  });
  if (!numbers.ok) reasons.push(`unknown numbers ${numbers.unknown.join(' ')}`);

  const polarity = checkPolarity(text, options.refs);
  if (polarity.missing.length > 0) reasons.push(`missing ${polarity.missing.join(' ')}`);
  if (polarity.reassuringAboutNonKeep.length > 0) reasons.push('reassurance about a change');
  if (polarity.invented.length > 0) reasons.push(`invented ${polarity.invented.join(' ')}`);
  const guarded = checkPolarity(text, options.memberGuards ?? []);
  if (guarded.reassuringAboutNonKeep.length > 0) reasons.push('reassurance about a member');
  if (options.noReassurance === true && reassuresAnywhere(text)) reasons.push('reassurance');
  if (options.asked === false && MENTIONS_QUESTION.test(text)) reasons.push('invented question');
  return { ok: reasons.length === 0, reasons };
}
