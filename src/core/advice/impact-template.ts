import { z } from 'zod';

import type { Impact } from '@/core/plan/types';
import { sourceRefSchema } from '@/core/source';

/** A number a row shows: a fixed value, or the name of a value worked out for this household. */
const numberRefSchema = z.union([z.number(), z.string().min(1)]);

const IMPACT_KINDS = [
  'timing',
  'mode',
  'intensity',
  'indoors',
  'purifier',
  'distance',
  'none',
] as const satisfies readonly Impact['kind'][];

/** An impact as written in a data row, with its text still holding {placeholders} and named numbers. */
export const impactTemplateSchema = z.strictObject({
  kind: z.enum(IMPACT_KINDS),
  text: z.string().min(1),
  numbers: z.array(numberRefSchema),
  source: z.exactOptional(sourceRefSchema),
});

export type ImpactTemplate = z.infer<typeof impactTemplateSchema>;
