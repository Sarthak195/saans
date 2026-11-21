import { z } from 'zod';

import { impactTemplateSchema, sourceRefSchema } from '@/core/advice/source-schema';
import { COOKING, HEATING } from '@/core/profile/schema';
import type { Rule } from '@/core/rules/evaluate';
import indoorJson from '@/data/indoor.json';

import type { HomeFacts } from '@/core/home/facts';

const LEVELS = [
  'good',
  'satisfactory',
  'moderate',
  'poor',
  'very_poor',
  'severe',
  'unknown',
] as const;

const flags = z.exactOptional(z.array(z.boolean()));

// Every fact a row may test is named here, so a typo in the data fails at load.
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

const thenSchema = z.strictObject({
  priority: z.number().int().min(0),
  title: z.string().min(1),
  body: z.string().min(1),
  reason: z.string().min(1),
  safety: z.exactOptional(z.literal(true)),
  myth: z.exactOptional(z.literal(true)),
  impact: z.exactOptional(impactTemplateSchema),
});

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
export const INDOOR = indoorSchema.parse(indoorJson);

export type HomeThen = z.infer<typeof thenSchema>;

/** Rows are ordered by priority at build time, so the file order only breaks ties. */
export const HOME_RULES: readonly Rule<HomeFacts, HomeThen>[] = INDOOR.rows;
