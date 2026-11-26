// The schema for a source: where a rule, threshold or number comes from. Every data row
// carries one, and the interface shows it as the reason behind advice. Core layer: pure.
import { z } from 'zod';

// An app rule's title must start with this.
const APP_TITLE_PREFIX = 'Saans';

// True for a parseable address that starts with https://.
function isHttps(url: string): boolean {
  return url.startsWith('https://') && URL.canParse(url);
}

/**
 * Where a rule, threshold or number comes from. Every data row carries one so the interface can show
 * the reason behind advice. 'APP' marks a choice Saans made itself where no authority gives a number,
 * so its title says so and it may have no URL to point at.
 */
export const sourceRefSchema = z
  .strictObject({
    id: z.string().min(1),
    title: z.string().min(1),
    url: z.string(),
    // Required when status is P-READ: the words the row was read from.
    quote: z.exactOptional(z.string().min(1)),
    // P-READ: the document's text was read directly. P-FETCH: read through a page summary, so the
    // wording is a paraphrase. APP: a choice Saans made where no authority gives a number.
    status: z.enum(['P-READ', 'P-FETCH', 'APP']),
  })
  .superRefine((source, ctx) => {
    // An app rule has no outside document: its title says it is Saans' own, and its link may be
    // empty.
    if (source.status === 'APP') {
      if (!source.title.startsWith(APP_TITLE_PREFIX)) {
        ctx.addIssue({
          code: 'custom',
          message: `An app rule title starts "${APP_TITLE_PREFIX}"`,
          path: ['title'],
        });
      }
      if (source.url !== '' && !isHttps(source.url)) {
        ctx.addIssue({
          code: 'custom',
          message: 'An app rule URL is empty or https',
          path: ['url'],
        });
      }
      return;
    }
    // Every other row has to link to its source over https.
    if (!isHttps(source.url)) {
      ctx.addIssue({ code: 'custom', message: 'A sourced row needs an https URL', path: ['url'] });
    }
    // A row read from a document has to show the words it was read from.
    if (source.status === 'P-READ' && source.quote === undefined) {
      ctx.addIssue({ code: 'custom', message: 'A P-READ row quotes its source', path: ['quote'] });
    }
  });

/** A source as parsed by sourceRefSchema. */
export type SourceRef = z.infer<typeof sourceRefSchema>;
