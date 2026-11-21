import { normalizeText } from '@/core/text/normalize';
import { extractWordNumbers } from '@/core/text/number-words';

const DIGITS = /\d+(?:\.\d+)?/g;

/** Reads digits and number words in order, so "20 or twenty five" gives [20, 25]. */
function extract(text: string, includeSmall: boolean): number[] {
  const out: number[] = [];
  let words: string[] = [];
  const closeWords = (): void => {
    out.push(...extractWordNumbers(words, includeSmall));
    words = [];
  };

  for (const token of normalizeText(text).split(' ')) {
    const digits = token.match(DIGITS);
    if (digits) {
      closeWords();
      // A time such as 17:00 is read as two numbers, 17 and 0, so a clock time in a briefing has
      // to be allowed by both parts.
      for (const d of digits) out.push(Number(d));
    } else {
      words.push(token);
    }
  }
  closeWords();
  return out;
}

/**
 * Every number a text states: ASCII and Devanagari digits, decimals, percentages (40% gives 40),
 * times (17:00 gives 17 and 0) and number words from eleven up in English, Hindi and Hinglish.
 */
export function extractNumbers(text: string): number[] {
  return extract(text, false);
}

/** Like extractNumbers but also reads one to ten, for checking what a user wrote about themselves. */
export function extractNumbersWithSmallWords(text: string): number[] {
  return extract(text, true);
}

/**
 * The model may only restate numbers the app computed. Returns each stated number that is not in
 * `allowed`, once, in the order they appear. The allowed values are already rounded the way the
 * briefing displays them, so comparison is exact.
 */
export function checkNumbers(
  text: string,
  allowed: readonly number[],
): { ok: boolean; unknown: number[] } {
  const known = new Set(allowed);
  const unknown = [...new Set(extractNumbers(text).filter((n) => !known.has(n)))];
  return { ok: unknown.length === 0, unknown };
}
