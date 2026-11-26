// The rules for trip alternatives: the facts they can test and the shape of each rule row. Layer:
// core (pure). The rows are in src/data/transit.json and are parsed here, where the fact names
// are known; each row carries a source.
import { z } from 'zod';

import { impactTemplateSchema } from '@/core/advice/impact-template';
import { sourceRefSchema } from '@/core/source';
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

// The air levels a rule may name: the plan's levels, plus 'unknown' for a trip with no reading.
const LEVELS = [
  'good',
  'satisfactory',
  'moderate',
  'poor',
  'very_poor',
  'severe',
  'unknown',
] as const;

// The condition of a rule: for each fact it names, the values it accepts. A fact left out is not
// tested. The keys must match TripFacts, and strictObject rejects any other name.
const whenSchema = z.strictObject({
  band: z.exactOptional(z.array(z.enum(['short', 'mid', 'long', 'unknown']))),
  mode: z.exactOptional(z.array(z.enum(MODES))),
  level: z.exactOptional(z.array(z.enum(LEVELS))),
  kind: z.exactOptional(z.array(z.enum(ROUTINE_KINDS))),
  rail: z.exactOptional(z.array(z.boolean())),
  repeats: z.exactOptional(z.array(z.boolean())),
});

// What a rule gives when it matches: the texts, with {name} slots filled from the trip's figures
// when the alternative is built, and the impact line with its numbers.
const thenSchema = z.strictObject({
  title: z.string().min(1),
  body: z.string().min(1),
  reason: z.string().min(1),
  impact: impactTemplateSchema,
  // 'transit' compares the current mode with the public transport the city has.
  exposure: z.exactOptional(z.literal('transit')),
});

// One rule row: an id, when it applies, what it gives and the source behind it.
const ruleSchema = z.strictObject({
  id: z.string().min(1),
  when: whenSchema,
  then: thenSchema,
  source: sourceRefSchema,
  // A second document behind the same advice, kept so the data shows everything it rests on.
  alsoSource: z.exactOptional(sourceRefSchema),
});

/** The alternative rules from the transit data, checked at load so a typo fails the tests. */
export const ALTERNATIVE_RULES = z.array(ruleSchema).parse(TRANSIT.rules);

/** What an alternative rule gives when it matches: its texts, impact line and exposure setting. */
export type AlternativeThen = z.infer<typeof thenSchema>;

/**
 * The same rules typed against TripFacts, for the rule engine in src/core/rules/evaluate.ts.
 * Every matching rule is used, in file order, so one trip can get several alternatives.
 */
export const TRIP_RULES: readonly Rule<TripFacts, AlternativeThen>[] = ALTERNATIVE_RULES;
