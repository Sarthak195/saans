// The checks a written briefing or notice must pass before a family sees it. Pure: no clock,
// network or environment. The server runs them on the model's text and falls back to the
// template wording when any check fails.
import type { Decision } from '@/core/decision';
import type { Plan } from '@/core/plan/types';
import type { Language } from '@/core/types';
import { checkNumbers, checkPolarity } from '@/core/text';

// Size limits for a written text: characters, and sentences as split by SENTENCE_BREAK.
const MAX_CHARS = 1200;
const MIN_SENTENCES = 2;
const MAX_SENTENCES = 8;
// A Hindi sentence may carry a placeholder or a level name in Latin letters, but it may not be
// mostly English: at least this share of its letters must be Devanagari.
const MIN_SENTENCE_SHARE = 0.25;
// Each Devanagari character, and each letter of any script: their counts give the Devanagari share.
const DEVANAGARI = /\p{Script=Devanagari}/gu;
const LETTERS = /\p{L}/gu;
// A sentence ends at a full stop that is not part of a number ("PM2.5", "3.5"), at ! or ?, at a
// Hindi danda (। or ॥), or at a line break.
const SENTENCE_BREAK = /(?<!\d)\.|\.(?!\d)|[!?।॥\n\r]+/;
// Characters that belong to markup or templating, never to plain prose: {}, <>, and backticks.
const MARKUP = /[{}<>`]/;
// Not markup, but a family would read it as a link or an address to follow. Matches a scheme
// ("https://"), "www.", an email address ("a@b"), a few link shorteners and the nic.in domain,
// and a word followed by a common top-level domain ("example.com").
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

/** The outcome of checking a written text: whether it may be shown, and why not if it may not. */
export interface CheckResult {
  ok: boolean;
  /** Short reasons for a rejected text, for tests and maintainers. Never shown to a family. */
  reasons: string[];
}

/**
 * Cleans the model's text before it is checked or shown. Dashes read badly out loud and in a
 * narrow column; a range becomes "to", a pause a comma. Markdown marks and repeated spaces go too.
 */
export function tidyText(text: string): string {
  // In order: two numbers joined by an en or em dash become a range ("5 to 8"); any other dash,
  // with the spaces around it, becomes a comma; every * and # is dropped (Markdown bold, italic and
  // headings); runs of spaces and tabs become one space (line breaks are kept).
  return text
    .replace(new RegExp(`(\\d)\\s*[${EN_DASH}${EM_DASH}]\\s*(\\d)`, 'g'), '$1 to $2')
    .replace(new RegExp(`\\s*[${EN_DASH}${EM_DASH}]\\s*`, 'g'), ', ')
    .replace(/[*#]+/g, '')
    .replace(/[ \t]+/g, ' ')
    .trim();
}

// The share of the text's letters that are Devanagari, from 0 to 1; 0 when it has no letters.
function devanagariShare(text: string): number {
  const letters = text.match(LETTERS)?.length ?? 0;
  return letters === 0 ? 0 : (text.match(DEVANAGARI)?.length ?? 0) / letters;
}

// True when some sentence has letters but too little Devanagari to count as Hindi.
function hasEnglishSentence(text: string): boolean {
  return text
    .split(SENTENCE_BREAK)
    .some(
      (sentence) =>
        sentence.match(LETTERS) !== null && devanagariShare(sentence) < MIN_SENTENCE_SHARE,
    );
}

// How many non-empty sentences the text has, split the same way as the other checks.
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

/** A placeholder name the briefing may use for a plan item, with the decision made about it. */
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
    // The first routine of this member that the plan changes, if there is one.
    const changed = plan.routines.find((r) => r.memberRef === m.memberRef && r.decision !== 'keep');
    return changed === undefined ? [] : [{ ref: m.memberRef, decision: changed.decision }];
  });
}

// A summary for a family that asked nothing must not answer a question it made up. Matches
// "you asked", "they wanted to know", "your question", or the Hindi stem for "ask" (पूछ).
const MENTIONS_QUESTION = /\b(you|they) (asked|wanted to know)\b|\byour question\b|पूछ/iu;

/**
 * Decides whether written text may be shown. Every number must be one the plan computed (an hour
 * or minute only when written as a time), every routine the plan changes must be named and not
 * reassured about, no placeholder may be made up, and the text must be in the language asked for
 * and free of markup. The reasons it returns are for the tests and maintainers, not a family.
 */
export function checkWritten(
  text: string,
  options: {
    lang: Language;
    allowedNumbers: readonly number[];
    refs: readonly PolarityRef[];
    memberGuards?: readonly PolarityRef[];
    noReassurance?: boolean;
    /** Allowed numbers in the facts only as an hour or minute: fine as a time, not a count. */
    clockOnly?: readonly number[];
    /** Place name and labels: numbers inside them are fine, only as part of the exact string. */
    names?: readonly string[];
    /** False when the family asked nothing, so the text may not say they did. */
    asked?: boolean;
  },
): CheckResult {
  const reasons: string[] = [];
  // An empty text fails at once; the other checks have nothing to look at.
  if (text.trim() === '') return { ok: false, reasons: ['empty'] };
  if (text.length > MAX_CHARS) reasons.push('too long');
  if (MARKUP.test(text)) reasons.push('markup');
  if (URL_LIKE.test(text)) reasons.push('link');
  const sentences = sentenceCount(text);
  if (sentences < MIN_SENTENCES || sentences > MAX_SENTENCES) reasons.push('sentence count');

  // Hindi must be at least 40% Devanagari letters; English may have at most 5% (stray words).
  const share = devanagariShare(text);
  if (options.lang === 'hi' ? share < 0.4 : share > 0.05) reasons.push('wrong language');
  // A Hindi text that drops an English sentence in the middle is not Hindi throughout.
  if (options.lang === 'hi' && hasEnglishSentence(text)) reasons.push('English sentence');

  // Every number in the text must be one the plan computed. The names are masked out first, so
  // a number inside one ("Sector 62") counts only as part of that exact string.
  const numbers = checkNumbers(text, options.allowedNumbers, {
    ...(options.clockOnly === undefined ? {} : { clockOnly: options.clockOnly }),
    ...(options.names === undefined ? {} : { masks: options.names }),
  });
  if (!numbers.ok) reasons.push(`unknown numbers ${numbers.unknown.join(' ')}`);

  // Each changed routine must be named, none reassured about, and no ref made up.
  const polarity = checkPolarity(text, options.refs);
  if (polarity.missing.length > 0) reasons.push(`missing ${polarity.missing.join(' ')}`);
  if (polarity.reassuringAboutNonKeep.length > 0) reasons.push('reassurance about a change');
  if (polarity.invented.length > 0) reasons.push(`invented ${polarity.invented.join(' ')}`);
  // A member whose routine the plan changes may not be reassured about, named or not.
  const guarded = checkPolarity(text, options.memberGuards ?? []);
  if (guarded.reassuringAboutNonKeep.length > 0) reasons.push('reassurance about a member');
  // When the caller asks for it, no sentence anywhere may reassure.
  if (options.noReassurance === true && reassuresAnywhere(text)) reasons.push('reassurance');
  // Only an explicit false turns this on: a text with `asked` left out is not checked for it.
  if (options.asked === false && MENTIONS_QUESTION.test(text)) reasons.push('invented question');
  return { ok: reasons.length === 0, reasons };
}
