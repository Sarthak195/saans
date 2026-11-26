// The indoor advice data and its schema. Core layer, pure: the JSON is read at import time and
// checked against a strict schema, so a typo in the data fails every test instead of reaching a
// family. Every number and row carries a source.
import { z } from 'zod';

import { impactTemplateSchema } from '@/core/advice/impact-template';
import { sourceRefSchema } from '@/core/source';
import { COOKING, HEATING } from '@/core/profile/schema';
import type { Rule } from '@/core/rules/evaluate';
import indoorJson from '@/data/indoor.json';

import type { HomeFacts } from '@/core/home/facts';

// The levels a row can test: the six AQI bands, plus 'unknown' for a day with no air data.
const LEVELS = [
  'good',
  'satisfactory',
  'moderate',
  'poor',
  'very_poor',
  'severe',
  'unknown',
] as const;

// A list of true and false values a row accepts for a yes or no fact.
const flags = z.exactOptional(z.array(z.boolean()));

// Every fact a row may test is named here, so a typo in the data fails at load. A row lists the
// values it accepts for each fact it names, and facts it leaves out are not tested.
const whenSchema = z.strictObject({
  level: z.exactOptional(z.array(z.enum(LEVELS))),
  airing: z.exactOptional(z.array(z.enum(['normal', 'window', 'keep_shut']))),
  cooking: z.exactOptional(z.array(z.enum(COOKING))),
  heating: z.exactOptional(z.array(z.enum(HEATING))),
  incense: flags,
  mosquitoCoil: flags,
  smoking: flags,
  candles: flags,
  hasPurifier: flags,
  roomKnown: flags,
  purifierFit: z.exactOptional(z.array(z.enum(['none', 'unknown', 'short', 'spare', 'match']))),
  festivalSeason: flags,
});

// What a matching row says: text with {name} placeholders, a priority (0 is the most urgent, and
// life-safety rows use it), and optional flags and an impact figure. 'safety' and 'myth' can only
// be true, so a row either sets them or leaves them out.
const thenSchema = z.strictObject({
  priority: z.number().int().min(0),
  title: z.string().min(1),
  body: z.string().min(1),
  reason: z.string().min(1),
  safety: z.exactOptional(z.literal(true)),
  myth: z.exactOptional(z.literal(true)),
  impact: z.exactOptional(impactTemplateSchema),
});

// The whole indoor data file: the assumptions with their sources, the note for tall ceilings
// (which must contain {ceiling}), and the rows. Each row has its own source.
const indoorSchema = z.strictObject({
  assumptions: z.strictObject({
    cadrPerSqft: z.strictObject({ value: z.number().positive(), source: sourceRefSchema }),
    assumedCeilingFt: z.strictObject({ value: z.number().positive(), source: sourceRefSchema }),
    festivalMonths: z.strictObject({
      value: z.array(z.number().int().min(1).max(12)).min(1),
      source: sourceRefSchema,
    }),
  }),
  ceilingNote: z.string().includes('{ceiling}'),
  rows: z.array(
    z.strictObject({
      id: z.string().min(1),
      when: whenSchema,
      then: thenSchema,
      source: sourceRefSchema,
    }),
  ),
});

// Parsed once at load: a typo in the data fails every test instead of misleading a family.
/** The checked indoor data: the sizing, ceiling and festival assumptions, and the advice rows. */
export const INDOOR = indoorSchema.parse(indoorJson);

// The type of a row's 'then' part, taken from its schema so the two cannot drift apart.
type HomeThen = z.infer<typeof thenSchema>;

/**
 * The home advice rows, in file order, as rules over HomeFacts. The advice builder sorts them by
 * priority when it runs, so the file order only breaks ties.
 */
export const HOME_RULES: readonly Rule<HomeFacts, HomeThen>[] = INDOOR.rows;
