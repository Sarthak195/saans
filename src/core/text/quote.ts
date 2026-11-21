import { termsForValue } from '@/core/text/lexicon';
import { normalizeText } from '@/core/text/normalize';
import { extractNumbersWithSmallWords } from '@/core/text/numbers';

/** normalizeText keeps '.' and ':' for decimals and times; elsewhere they are sentence punctuation. */
function looseKey(s: string): string {
  return normalizeText(s)
    .replace(/(?<!\d)[.:]|[.:](?!\d)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * True when the model's quote really appears in the user's text. Compared after normalisation, so
 * smart quotes, case, spacing, Devanagari digits and compatibility characters do not matter. An
 * empty quote proves nothing and is refused.
 */
export function quoteInText(source: string, quote: string): boolean {
  const wanted = looseKey(quote);
  return wanted !== '' && looseKey(source).includes(wanted);
}

const WORD_CHAR = String.raw`[\p{L}\p{M}\p{N}]`;
// Inflections people actually write: "walks", "running", "drives", "khelta hai", "टहलने".
// Kept to an explicit list because a general suffix would let "दिल" match "दिल्ली" (Delhi).
const SUFFIXES = 'ning|ting|ping|ing|ner|ers|er|es|ed|s|ta|ti|te|ता|ती|ते|ना|ने|ों|ें';

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);
}

function termInText(term: string, text: string): boolean {
  const stems = term.endsWith('e')
    ? `(?:${escapeRegex(term)}|${escapeRegex(term.slice(0, -1))}ing)`
    : escapeRegex(term);
  const pattern = new RegExp(`(?<!${WORD_CHAR})${stems}(?:${SUFFIXES})?(?!${WORD_CHAR})`, 'u');
  return pattern.test(text);
}

/**
 * True when what the model extracted is something the user's quote says. A number must appear in
 * the quote as digits or as a number word, including one to ten and their Hindi and Hinglish forms.
 * A profile value (condition, mode, routine kind, age band) must match one of its lexicon terms
 * inside the quote. A value the lexicon does not know cannot be supported.
 *
 * Hinglish "do" (two) is also an English verb, so a quote containing "do" supports the value 2.
 * That errs toward accepting an extraction that is still bounded by the schema and range checks.
 */
export function valueSupportedByQuote(value: string | number, quote: string): boolean {
  if (typeof value === 'number') {
    return extractNumbersWithSmallWords(quote).includes(value);
  }
  const text = normalizeText(quote);
  return termsForValue(value).some((term) => termInText(term, text));
}
