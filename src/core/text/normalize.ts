// Brings text to one comparable form. Layer: core (pure). Used before any quote, number or
// phrase is compared, so the same rules apply to model output and to what a user typed.

// Indian grouping ("1,50,000") and western grouping ("1,500") both end in a three-digit group.
// Matches a digit group with commas, such as 1,50,000 or 1,500. The look-arounds stop it from
// matching in the middle of a longer run of digits.
const GROUPED_NUMBER = /(?<!\d)\d{1,3}(?:,\d{2})*,\d{3}(?!\d)/g;

/**
 * Brings model output and user text to one comparable form so a quote or a number can be checked
 * without caring about script, case, quote style or spacing. Straight and curly quotes are removed
 * (not replaced), so "don't" and "don’t" both become "dont". Other punctuation becomes a space.
 * Digits, '.', ':' and '%' survive because numbers, decimals, times and percentages need them.
 */
export function normalizeText(s: string): string {
  return (
    s
      // Compatibility forms (full-width digits, ligatures) become their plain equivalents.
      .normalize('NFKC')
      // NFKC leaves Devanagari digits alone, and a model may write 245 either way.
      .replace(/[०-९]/g, (d) => String(d.charCodeAt(0) - 0x0966))
      .toLowerCase()
      // Zero-width characters sit inside Devanagari words; spacing them out would split the word.
      .replace(/[​-‍⁠﻿]/g, '')
      // Commas inside a grouped number go, so 1,50,000 and 150000 read as the same number.
      .replace(GROUPED_NUMBER, (n) => n.replaceAll(',', ''))
      // Quotes and apostrophes of every style are removed, which joins "don't" into "dont".
      .replace(/["'`´‘-‟′″«»]/g, '')
      // Anything that is not a letter, mark, digit, space, '.', ':' or '%' becomes a space.
      .replace(/[^\p{L}\p{M}\p{N}\s.:%]/gu, ' ')
      // Runs of spaces collapse so words can be compared one by one after a split on ' '.
      .replace(/\s+/g, ' ')
      .trim()
  );
}
