import { z } from 'zod';

import { impactTemplateSchema, sourceRefSchema } from '@/core/advice/source-schema';
import { TRANSIT } from '@/core/alternatives/cities';
import type { PlanLevel } from '@/core/advice/level';
import { MODES, ROUTINE_KINDS } from '@/core/profile/schema';
import type { FactValue, Rule } from '@/core/rules/evaluate';
import type { Mode, RoutineKind } from '@/core/types';

/** What the alternative rules can test about one trip. */
export interface TripFacts extends Record<string, FactValue> {
  band: 'short' | 'mid' | 'long' | 'unknown';
  mode: Mode;
  /** The trip's own level on the plan day; 'unknown' when the plan has none. */
  level: PlanLevel;
  kind: RoutineKind;
  /** The city has a metro or suburban rail. */
  rail: boolean;
  /** The trip happens on two or more days a week. */
  repeats: boolean;
}

const LEVELS = [
  'good',
  'satisfactory',
  'moderate',
  'poor',
  'very_poor',
  'severe',
  'unknown',
] as const;

const whenSchema = z.strictObject({
  band: z.exactOptional(z.array(z.enum(['short', 'mid', 'long', 'unknown']))),
  mode: z.exactOptional(z.array(z.enum(MODES))),
  level: z.exactOptional(z.array(z.enum(LEVELS))),
  kind: z.exactOptional(z.array(z.enum(ROUTINE_KINDS))),
  rail: z.exactOptional(z.array(z.boolean())),
  repeats: z.exactOptional(z.array(z.boolean())),
});

const thenSchema = z.strictObject({
  title: z.string().min(1),
  body: z.string().min(1),
  reason: z.string().min(1),
  impact: impactTemplateSchema,
  // 'transit' compares the current mode with the public transport the city has.
  exposure: z.exactOptional(z.literal('transit')),
});

const ruleSchema = z.strictObject({
  id: z.string().min(1),
  when: whenSchema,
  then: thenSchema,
  source: sourceRefSchema,
  // A second document behind the same advice, kept so the data shows everything it rests on.
  alsoSource: z.exactOptional(sourceRefSchema),
});

export const ALTERNATIVE_RULES = z.array(ruleSchema).parse(TRANSIT.rules);

export type AlternativeThen = z.infer<typeof thenSchema>;

export const TRIP_RULES: readonly Rule<TripFacts, AlternativeThen>[] = ALTERNATIVE_RULES;
