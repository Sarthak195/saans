// Indian grouping ("1,50,000") and western grouping ("1,500") both end in a three-digit group.
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
      .normalize('NFKC')
      // NFKC leaves Devanagari digits alone, and a model may write 245 either way.
      .replace(/[०-९]/g, (d) => String(d.charCodeAt(0) - 0x0966))
      .toLowerCase()
      // Zero-width characters sit inside Devanagari words; spacing them out would split the word.
      .replace(/[​-‍⁠﻿]/g, '')
      .replace(GROUPED_NUMBER, (n) => n.replaceAll(',', ''))
      .replace(/["'`´‘-‟′″«»]/g, '')
      .replace(/[^\p{L}\p{M}\p{N}\s.:%]/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  );
}
