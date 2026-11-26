// The community rules and settings as sourced data: community.json parsed with a strict schema.
// Pure core: no clock, network or environment. Every row carries a source, and a bad row fails
// when the module loads.
import { z } from 'zod';

import { sourceRefSchema } from '@/core/source';
import { COMMUNITY_KINDS } from '@/core/profile/schema';
import type { Rule } from '@/core/rules/evaluate';
import communityJson from '@/data/community.json';

import type { CommunityFacts } from '@/core/community/facts';

// The levels a community rule can name: the six AQI bands, plus 'unknown' for a plan day with no
// usable air data.
const LEVELS = [
  'good',
  'satisfactory',
  'moderate',
  'poor',
  'very_poor',
  'severe',
  'unknown',
] as const;

// A 24-hour clock time written 'HH:MM', such as '07:30' or '19:00'. Hours run 00 to 23 and
// minutes 00 to 59.
const clock = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);

// The shape of community.json. Strict objects reject unknown keys, so a misspelt field fails.
const communitySchema = z.strictObject({
  // How many actions the community view shows at most; the file must allow at least 4.
  maxActions: z.number().int().min(4),
  // The car-km saving: the assumed round trip in km, the days a week, and the wording to fill in.
  aggregate: z.strictObject({
    roundTripKm: z.number().positive(),
    daysPerWeek: z.number().int().min(1).max(7),
    text: z.string().min(1),
    source: sourceRefSchema,
  }),
  // The best-outdoor-time action. On a poor day the window search only offers times between
  // `earliest` and `latest`, and `guardSource` is the guidance behind that limit.
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
  // The advice rows. `when` lists the facts a row needs, each as the values it accepts, and a
  // fact left out is ignored. `then` is the advice itself, and a lower `priority` is shown first.
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

/**
 * The community settings and advice rows from community.json, checked once when the module loads.
 * A typo in the data fails every test instead of misleading a community.
 */
export const COMMUNITY = communitySchema.parse(communityJson);

// What a community row says to do once its conditions match.
type CommunityThen = (typeof COMMUNITY.rows)[number]['then'];

/** The advice rows as the shared rule matcher takes them, tested against the community facts. */
export const COMMUNITY_RULES: readonly Rule<CommunityFacts, CommunityThen>[] = COMMUNITY.rows;
