// The shape of an impact written in a data row, checked when the data is loaded. Pure: it holds
// a schema and its type, nothing else.
import { z } from 'zod';

import type { Impact } from '@/core/plan/types';
import { sourceRefSchema } from '@/core/source';

/** A number a row shows: a fixed value, or the name of a value worked out for this household. */
const numberRefSchema = z.union([z.number(), z.string().min(1)]);

// The kinds an impact may have; `satisfies` keeps this list within the kinds the plan knows.
const IMPACT_KINDS = [
  'timing',
  'mode',
  'intensity',
  'indoors',
  'purifier',
  'distance',
  'none',
] as const satisfies readonly Impact['kind'][];

/**
 * An impact as written in a data row, with its text still holding {placeholders} and named
 * numbers. The object is strict, so a row with an unknown key is refused when it is loaded.
 */
export const impactTemplateSchema = z.strictObject({
  kind: z.enum(IMPACT_KINDS),
  text: z.string().min(1),
  numbers: z.array(numberRefSchema),
  source: z.exactOptional(sourceRefSchema),
});

/** An impact row as read from the data, before its placeholders and named numbers are filled. */
export type ImpactTemplate = z.infer<typeof impactTemplateSchema>;
