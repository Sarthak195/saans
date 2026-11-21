import { z } from 'zod';

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
