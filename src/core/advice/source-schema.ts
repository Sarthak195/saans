import { z } from 'zod';

import type { Impact } from '@/core/plan/types';

/**
 * The shape every data row's source must have. A row quoting an official document has to carry the
 * words it relies on, and a rule Saans made up has to say so in its title, so a reader can always
 * tell a sourced fact from a choice the app made.
 */
export const sourceRefSchema = z
  .strictObject({
    id: z.string().min(1),
    title: z.string().min(1),
    // Empty only for an app rule that has no document to point at.
    url: z.string(),
    quote: z.exactOptional(z.string().min(1)),
    status: z.enum(['P-READ', 'P-FETCH', 'APP']),
  })
  .superRefine((source, ctx) => {
    if (source.status === 'APP') {
      if (!source.title.startsWith('Saans rule: ')) {
        ctx.addIssue({ code: 'custom', message: 'An app rule title starts "Saans rule: "' });
      }
      return;
    }
    if (!source.url.startsWith('https://')) {
      ctx.addIssue({ code: 'custom', message: 'A sourced row needs an https URL', path: ['url'] });
    }
    if (source.status === 'P-READ' && source.quote === undefined) {
      ctx.addIssue({ code: 'custom', message: 'A P-READ row quotes its source', path: ['quote'] });
    }
  });

/** A number a row shows: a fixed value, or the name of a value worked out for this household. */
export const numberRefSchema = z.union([z.number(), z.string().min(1)]);

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
