// Finds every number a text states, as digits or as words, and checks them against numbers the
// app computed. Layer: core (pure). Used to refuse written text that invents or misquotes a
// figure.
import { normalizeText } from '@/core/text/normalize';
import { extractWordNumbers } from '@/core/text/number-words';

// A run of digits with an optional decimal part, such as 245 or 0.67. Used on normalised tokens.
const DIGITS = /\d+(?:\.\d+)?/g;
// A token that starts like a clock reading, such as 17:00 or 5:30.
const CLOCK_TOKEN = /^\d{1,2}:\d{2}/;
// A number followed by one of these is a time of day ("5 pm", "8 baje"), not a quantity.
const MERIDIEM = new Set(['am', 'pm', 'a.m.', 'p.m.', 'a.m', 'p.m']);
const OTHER_TIME_WORDS = new Set(['baje', 'bje', 'बजे', 'oclock']);
// Digits glued to am or pm, such as 5pm or 8a.m.
const MERIDIEM_SUFFIX = /\d(?:a\.?m\.?|p\.?m\.?)$/;
// One letter, mark or digit in any script. Used to find whole-word edges when masking.
const LETTER_OR_NUMBER = String.raw`[\p{L}\p{M}\p{N}]`;

/** A number as the text states it. `time` marks a clock reading; `hour12` an hour before am or pm. */
export interface NumberMention {
  value: number;
  time: boolean;
  hour12: boolean;
}

// Makes a plain string safe to place inside a regular expression.
function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);
}

/** Blanks out exact strings (a family label, a place name) so numbers inside them are not read. */
function maskStrings(normalized: string, masks: readonly string[]): string {
  let out = normalized;
  for (const mask of masks) {
    // The mask is normalised the same way as the text so the two can match.
    const wanted = normalizeText(mask);
    if (wanted === '') continue;
    // Only a whole match counts: "Sector 5" does not match inside "Sector 55".
    const pattern = new RegExp(
      `(?<!${LETTER_OR_NUMBER})${escapeRegex(wanted)}(?!${LETTER_OR_NUMBER})`,
      'gu',
    );
    out = out.replace(pattern, ' ');
  }
  return out.replace(/\s+/g, ' ').trim();
}

/**
 * Reads digits and number words in order, with whether each digit group is a time of day. A time
 * such as 17:00 is read as two numbers, 17 and 0, so a clock time in a briefing has to be allowed
 * by both parts.
 */
export function extractNumberMentions(
  text: string,
  options: { includeSmall?: boolean; masks?: readonly string[] } = {},
): NumberMention[] {
  const out: NumberMention[] = [];
  let words: string[] = [];
  // Reads the number words gathered since the last digit token, then starts a new gathering.
  const closeWords = (): void => {
    for (const value of extractWordNumbers(words, options.includeSmall === true)) {
      out.push({ value, time: false, hour12: false });
    }
    words = [];
  };

  // Masking happens after normalising, so a label with digits in it never reaches the reader.
  const tokens = maskStrings(normalizeText(text), options.masks ?? []).split(' ');
  tokens.forEach((token, at) => {
    const digits = token.match(DIGITS);
    // A token without digits may be part of a number word, so it is kept for the word reader.
    if (!digits) {
      words.push(token);
      return;
    }
    // Words before a digit token cannot continue into it, so they are read first.
    closeWords();
    const next = tokens[at + 1] ?? '';
    // The am or pm may be the next token ("5 pm") or attached to this one ("5pm").
    const meridiem = MERIDIEM.has(next) || MERIDIEM_SUFFIX.test(token);
    // Time of day: a clock reading, an am or pm hour, or an hour followed by "baje" or "oclock".
    const time = CLOCK_TOKEN.test(token) || meridiem || OTHER_TIME_WORDS.has(next);
    // A token such as 5:30pm gives two digit groups; only the first is the 12-hour hour.
    digits.forEach((d, i) => {
      out.push({ value: Number(d), time, hour12: meridiem && i === 0 });
    });
  });
  closeWords();
  return out;
}

/**
 * Every number a text states: ASCII and Devanagari digits, decimals, percentages (40% gives 40),
 * times (17:00 gives 17 and 0) and number words from eleven up in English, Hindi and Hinglish.
 */
export function extractNumbers(text: string): number[] {
  return extractNumberMentions(text).map((m) => m.value);
}

/** Like extractNumbers but also reads one to ten, for checking what a user wrote about themselves. */
export function extractNumbersWithSmallWords(text: string): number[] {
  return extractNumberMentions(text, { includeSmall: true }).map((m) => m.value);
}

/** The numbers a text states, split into those written as a clock time (HH:MM, "5 pm") and the rest. */
export function splitClockNumbers(
  text: string,
  masks: readonly string[] = [],
): { plain: number[]; clock: number[] } {
  const mentions = extractNumberMentions(text, { masks });
  return {
    plain: mentions.filter((m) => !m.time).map((m) => m.value),
    clock: mentions.filter((m) => m.time).map((m) => m.value),
  };
}

/** Settings for checkNumbers. */
export interface NumberCheckOptions {
  /** Allowed numbers that are in the facts only as an hour or minute of the day. */
  clockOnly?: readonly number[];
  /** Exact strings (labels, place names) whose own numbers are not read. */
  masks?: readonly string[];
}

// "5 pm" may stand for 17:00 and "12 am" for 00:00, so an hour before am or pm has these readings.
function hourReadings(hour: number): number[] {
  return [hour, ...(hour >= 1 && hour < 12 ? [hour + 12] : []), ...(hour === 12 ? [0] : [])];
}

/**
 * The model may only restate numbers the app computed. Returns each stated number that is not in
 * `allowed`, once, in the order they appear. The allowed values are already rounded the way the
 * briefing displays them, so comparison is exact. A number in `clockOnly` is allowed only when
 * the text writes it as a time, so "AQI of 20" is refused when 20 is only the hour of 20:00.
 */
export function checkNumbers(
  text: string,
  allowed: readonly number[],
  options: NumberCheckOptions = {},
): { ok: boolean; unknown: number[] } {
  const known = new Set(allowed);
  const clockOnly = new Set(options.clockOnly ?? []);
  const unknown = new Set<number>();
  const mentions = extractNumberMentions(
    text,
    options.masks === undefined ? {} : { masks: options.masks },
  );
  for (const m of mentions) {
    // An hour before am or pm may be the 24-hour hour the app computed, so every reading is tried.
    const readings = m.hour12 ? hourReadings(m.value) : [m.value];
    // A clock-only value is fine only when the text itself writes it as a time.
    const fine = readings.some((v) => known.has(v) && (m.time || !clockOnly.has(v)));
    if (!fine) unknown.add(m.value);
  }
  return { ok: unknown.size === 0, unknown: [...unknown] };
}
