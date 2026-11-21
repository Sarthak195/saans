import { z } from 'zod';

/** The shape every data row's `source` must have; mirrors SourceRef. */
export const sourceRefSchema = z
  .strictObject({
    id: z.string().min(1),
    title: z.string().min(1),
    url: z.url(),
    quote: z.exactOptional(z.string().min(1)),
    status: z.enum(['P-READ', 'P-FETCH', 'APP']),
  })
  // A row that claims to be read from a document has to show the words it was read from.
  .refine((s) => s.status !== 'P-READ' || s.quote !== undefined, 'A P-READ source needs a quote');
