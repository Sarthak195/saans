// Checks that something a model extracted from a user's own words is really in those words: a
// quote, a number, a profile value or an age. Layer: core (pure). Every check normalises the text
// first, so case, spacing and punctuation do not matter.
import { conditionPhrases, termsForValue } from '@/core/text/lexicon';
import { normalizeText } from '@/core/text/normalize';
import { extractNumbersWithSmallWords } from '@/core/text/numbers';

/** normalizeText keeps '.' and ':' for decimals and times; elsewhere they are sentence punctuation. */
function looseKey(s: string): string {
  return normalizeText(s)
    .replace(/(?<!\d)[.:]|[.:](?!\d)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// The words of a text after loose normalisation; empty text gives no words.
function tokensOf(s: string): string[] {
  const key = looseKey(s);
  return key === '' ? [] : key.split(' ');
}

// One letter, mark or digit in any script, used to find whole-word edges.
const WORD_CHAR = String.raw`[\p{L}\p{M}\p{N}]`;
// Inflections people actually write: "walks", "running", "drives", "khelta hai", "टहलने".
// Kept to an explicit list because a general suffix would let "दिल" match "दिल्ली" (Delhi).
const SUFFIXES = 'ning|ting|ping|ing|ner|ers|er|es|ed|s|ta|ti|te|ता|ती|ते|ना|ने|ों|ें';
const SUFFIXED = new RegExp(`^(?:${SUFFIXES})$`, 'u');

// Makes a plain string safe to place inside a regular expression.
function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);
}

// Whether a lexicon term appears as a whole word in the text, with an optional inflection.
// A term ending in 'e' also matches its -ing form ("drive" and "driving").
function termInText(term: string, text: string): boolean {
  const stems = term.endsWith('e')
    ? `(?:${escapeRegex(term)}|${escapeRegex(term.slice(0, -1))}ing)`
    : escapeRegex(term);
  const pattern = new RegExp(`(?<!${WORD_CHAR})${stems}(?:${SUFFIXES})?(?!${WORD_CHAR})`, 'u');
  return pattern.test(text);
}

// Words that turn "has asthma" into "has no asthma". Contractions are listed without the
// apostrophe because normalizeText removes it.
const NEGATORS = new Set([
  'no',
  'not',
  'nahi',
  'nahin',
  'nhi',
  'नहीं',
  'नही',
  'without',
  'never',
  'none',
  'neither',
  'nor',
  'isnt',
  'doesnt',
  'dont',
  'hasnt',
  'havent',
  'cant',
  'cannot',
]);
// "asthma nahi hai": Hindi and Hinglish put the negator after the thing it denies.
const AFTER_NEGATORS = new Set(['nahi', 'nahin', 'nhi', 'नहीं', 'नही']);
// How many words either side of a condition are searched for a negator.
const NEGATION_REACH = 2;

// Whether a source token is this word. Only the last word of a phrase may carry a listed suffix.
function wordMatches(word: string, token: string, last: boolean): boolean {
  if (token === word) return true;
  return last && token.startsWith(word) && SUFFIXED.test(token.slice(word.length));
}

/** Each health condition named inside source[from, to), and whether the text denies it. */
function conditionMentions(
  source: readonly string[],
  from: number,
  to: number,
): { denied: boolean }[] {
  const found: { denied: boolean }[] = [];
  for (const phrase of conditionPhrases()) {
    for (let at = from; at + phrase.length <= to; at += 1) {
      const hit = phrase.every((word, i) =>
        wordMatches(word, source[at + i] ?? '', i === phrase.length - 1),
      );
      if (!hit) continue;
      const before = source.slice(Math.max(0, at - NEGATION_REACH), at);
      const after = source.slice(at + phrase.length, at + phrase.length + NEGATION_REACH);
      found.push({
        denied: before.some((t) => NEGATORS.has(t)) || after.some((t) => AFTER_NEGATORS.has(t)),
      });
    }
  }
  return found;
}

/** A quote whose every condition mention is denied ("no asthma") is not evidence of a condition. */
function namesDeniedCondition(source: readonly string[], at: number, length: number): boolean {
  const mentions = conditionMentions(source, at, at + length);
  return mentions.length > 0 && mentions.every((m) => m.denied);
}

// Every position in `source` where the quote's words appear in a row, whole word for whole word.
function runStarts(source: readonly string[], quote: readonly string[]): number[] {
  const starts: number[] = [];
  for (let at = 0; at + quote.length <= source.length; at += 1) {
    if (quote.every((token, i) => source[at + i] === token)) starts.push(at);
  }
  return starts;
}

/**
 * True when the model's quote really appears in the user's text. Compared after normalisation, so
 * smart quotes, case, spacing, Devanagari digits and compatibility characters do not matter. The
 * quote must be a run of whole words or numbers, so "5" is not found inside "65" and a quote
 * cannot begin partway through a word. An empty quote proves nothing and is refused, and so is a
 * quote that names a health condition the text denies ("no asthma", "asthma nahi hai").
 */
export function quoteInText(source: string, quote: string): boolean {
  const wanted = tokensOf(quote);
  if (wanted.length === 0) return false;
  const text = tokensOf(source);
  // One occurrence that does not deny a condition is enough.
  return runStarts(text, wanted).some((at) => !namesDeniedCondition(text, at, wanted.length));
}

// Words for a count of years, then of months, then of weeks, in English, Hindi and Hinglish.
const YEAR_WORDS = new Set([
  'year',
  'years',
  'yr',
  'yrs',
  'yo',
  'saal',
  'sal',
  'saalon',
  'साल',
  'वर्ष',
  'varsh',
  'बरस',
]);
const MONTH_WORDS = new Set(['month', 'months', 'mahine', 'mahina', 'महीने', 'महीना', 'महीनों']);
const WEEK_WORDS = new Set(['week', 'weeks', 'hafte', 'hafta', 'हफ्ते', 'हफ्ता', 'सप्ताह']);
// How many words before a unit word are read as its number, so "twenty five years" gives 25.
const NUMBER_REACH = 3;

/** Digits glued to letters ("7yo", "8months") are split so the unit stands as its own word. */
function ageTokens(quote: string): string[] {
  return tokensOf(quote.normalize('NFKC').replace(/(\d)(\p{L})/gu, '$1 $2'));
}

// The number just before the unit word at `unitAt`, or undefined when there is none.
function numberBefore(tokens: readonly string[], unitAt: number): number | undefined {
  const previous = tokens[unitAt - 1];
  if (previous === undefined || extractNumbersWithSmallWords(previous).length === 0) {
    return undefined;
  }
  // The last number in the window wins, so a multi-word number such as "twenty five" is whole.
  const window = tokens.slice(Math.max(0, unitAt - NUMBER_REACH), unitAt).join(' ');
  return extractNumbersWithSmallWords(window).at(-1);
}

/**
 * The age in years a quote supports for an age the reader claims, or undefined when it does not
 * support it. The number must sit next to a year word (years, yrs, saal, साल), so "65" or "8
 * months" does not become 5 or 8 years. A count of months or weeks is a baby: "8 months" gives
 * 0.67, which the age bands read as under one.
 */
export function ageYearsFromQuote(claimed: number, quote: string): number | undefined {
  const tokens = ageTokens(quote);
  for (const [at, token] of tokens.entries()) {
    const n = numberBefore(tokens, at);
    if (n === undefined) continue;
    // Years must match the claim exactly.
    if (YEAR_WORDS.has(token) && n === claimed) return n;
    // A reader that mistook the count of months for years claims the same number, or 0.
    if (MONTH_WORDS.has(token) && (n === claimed || claimed === 0)) return n / 12;
    if (WEEK_WORDS.has(token) && (n === claimed || claimed === 0)) return n / 52;
  }
  return undefined;
}

/** Quote tokens without the numbers that count months or weeks, which are not plain quantities. */
function withoutDurations(quote: string): string {
  const tokens = ageTokens(quote);
  const drop = new Set<number>();
  for (const [at, token] of tokens.entries()) {
    if (!MONTH_WORDS.has(token) && !WEEK_WORDS.has(token)) continue;
    // Walk back over the digits and number words that make up the count.
    for (let back = at - 1; back >= Math.max(0, at - NUMBER_REACH); back -= 1) {
      if (extractNumbersWithSmallWords(tokens[back] ?? '').length === 0) break;
      drop.add(back);
    }
  }
  return tokens.filter((_, at) => !drop.has(at)).join(' ');
}

/**
 * True when what the model extracted is something the user's quote says. A number must appear in
 * the quote as digits or as a number word, including one to ten and their Hindi and Hinglish forms,
 * and not as a count of months or weeks. A profile value (condition, mode, routine kind, age
 * band) must match one of its lexicon terms inside the quote. A value the lexicon does not know
 * cannot be supported.
 *
 * Hinglish "do" (two) is also an English verb, so a quote containing "do" supports the value 2.
 * That errs toward accepting an extraction that is still bounded by the schema and range checks.
 * An age in years needs the stricter ageYearsFromQuote.
 */
export function valueSupportedByQuote(value: string | number, quote: string): boolean {
  if (typeof value === 'number') {
    return extractNumbersWithSmallWords(withoutDurations(quote)).includes(value);
  }
  // Profile values are matched against lexicon terms as whole words, with listed inflections.
  const text = normalizeText(quote);
  return termsForValue(value).some((term) => termInText(term, text));
}
