// The word lists that tie a user's own words (English, Hindi, Hinglish) to profile values, and
// the phrases that count as reassurance. The terms live in src/data/lexicon.json, with sources.
// Layer: core (pure). The JSON is checked when this module loads, so a bad row fails every test.
import { z } from 'zod';

import lexiconData from '@/data/lexicon.json';
import { AGE_BANDS, CONDITIONS, MODES, ROUTINE_KINDS } from '@/core/profile/schema';
import { sourceRefSchema } from '@/core/source';
import { normalizeText } from '@/core/text/normalize';

// One schema for a group of rows: the category is fixed and the value is limited to its own set.
function rows<C extends string, V extends z.ZodType>(category: C, value: V) {
  return z.strictObject({
    category: z.literal(category),
    value,
    terms: z.array(z.string().min(1)).min(1),
    source: sourceRefSchema,
  });
}

// The whole file: a list of rows, split by category so each category checks its own values.
const lexiconSchema = z.strictObject({
  entries: z.array(
    z.discriminatedUnion('category', [
      rows('condition', z.enum(CONDITIONS)),
      rows('mode', z.enum(MODES)),
      rows('routine', z.enum(ROUTINE_KINDS)),
      rows('age', z.enum(AGE_BANDS)),
      rows('reassurance', z.enum(['en', 'hi', 'hinglish'])),
    ]),
  ),
});

// One checked row of the lexicon.
type LexiconEntry = z.infer<typeof lexiconSchema>['entries'][number];

/** Every row of the lexicon, parsed once at load. A row that breaks the schema throws here. */
export const LEXICON_ENTRIES: readonly LexiconEntry[] = lexiconSchema.parse(lexiconData).entries;

/** Normalised terms that name a profile value (a condition, mode, routine kind or age band). */
export function termsForValue(value: string): string[] {
  // Reassurance rows have language names as values, never a profile value, so they are left out.
  return LEXICON_ENTRIES.filter((e) => e.category !== 'reassurance' && e.value === value).flatMap(
    (e) => e.terms.map(normalizeText),
  );
}

/** Every health-condition term, normalised and split into words. */
export function conditionPhrases(): string[][] {
  return LEXICON_ENTRIES.filter((e) => e.category === 'condition').flatMap((e) =>
    e.terms.map((t) => normalizeText(t).split(' ')),
  );
}

/** Every reassurance phrase in every language, normalised and split into words. */
export function reassurancePhrases(): string[][] {
  return LEXICON_ENTRIES.filter((e) => e.category === 'reassurance').flatMap((e) =>
    e.terms.map((t) => normalizeText(t).split(' ')),
  );
}
