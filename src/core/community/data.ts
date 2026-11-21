import { z } from 'zod';

import { sourceRefSchema } from '@/core/advice/source-schema';
import { COMMUNITY_KINDS } from '@/core/profile/schema';
import type { Rule } from '@/core/rules/evaluate';
import communityJson from '@/data/community.json';

import type { CommunityFacts } from '@/core/community/facts';

const LEVELS = [
  'good',
  'satisfactory',
  'moderate',
  'poor',
  'very_poor',
  'severe',
  'unknown',
] as const;

const clock = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);

const communitySchema = z.strictObject({
  maxActions: z.number().int().min(4),
  aggregate: z.strictObject({
    roundTripKm: z.number().positive(),
    daysPerWeek: z.number().int().min(1).max(7),
    text: z.string().min(1),
    source: sourceRefSchema,
  }),
  window: z.strictObject({
    earliest: clock,
    latest: clock,
    guardSource: sourceRefSchema,
    action: z.strictObject({
      id: z.string().min(1),
      title: z.string().min(1),
      body: z.string().min(1),
      // Wording for a window that is itself poor or worse, so it never reads as a good time for sport.
      poor: z.strictObject({ title: z.string().min(1), body: z.string().min(1) }),
      reason: z.string().min(1),
      source: sourceRefSchema,
    }),
  }),
  rows: z.array(
    z.strictObject({
      id: z.string().min(1),
      when: z.strictObject({
        kind: z.exactOptional(z.array(z.enum(COMMUNITY_KINDS))),
        level: z.exactOptional(z.array(z.enum(LEVELS))),
        ncr: z.exactOptional(z.array(z.boolean())),
        delhi: z.exactOptional(z.array(z.boolean())),
      }),
      then: z.strictObject({
        priority: z.number().int().min(0),
        title: z.string().min(1),
        body: z.string().min(1),
        reason: z.string().min(1),
      }),
      source: sourceRefSchema,
    }),
  ),
});

// Parsed once at load: a typo in the data fails every test instead of misleading a community.
export const COMMUNITY = communitySchema.parse(communityJson);

export type CommunityThen = (typeof COMMUNITY.rows)[number]['then'];

export const COMMUNITY_RULES: readonly Rule<CommunityFacts, CommunityThen>[] = COMMUNITY.rows;
