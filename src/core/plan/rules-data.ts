import { z } from 'zod';

import { BANDS } from '@/core/aqi/breakpoints';
import type { Band } from '@/core/aqi';
import { healthStatement } from '@/core/aqi';
import { DECISIONS } from '@/core/decision';
import type { Decision } from '@/core/decision';
import { AGE_BANDS, INTENSITIES, MODES, ROUTINE_KINDS, WEEKDAYS } from '@/core/profile/schema';
import { sourceRefSchema } from '@/core/plan/source-schema';
import type { FactValue, Rule } from '@/core/rules/evaluate';
import type { SourceRef } from '@/core/source';
import type { AgeBand, Intensity, Mode, RoutineKind, Sensitivity, Weekday } from '@/core/types';
import rulesJson from '@/data/rules.json';

const SENSITIVITIES = ['high', 'raised', 'general'] as const;
const sensitivitySchema = z.enum(SENSITIVITIES);
const decisionSchema = z.enum(DECISIONS);
const sourceKey = z.string().min(1);

const gridRuleSchema = z.strictObject({
  id: z.string().min(1),
  when: z.strictObject({
    level: z.exactOptional(z.array(z.enum(BANDS)).min(1)),
    sensitivity: z.exactOptional(z.array(sensitivitySchema).min(1)),
    intensity: z.exactOptional(z.array(z.enum(INTENSITIES)).min(1)),
    essential: z.exactOptional(z.array(z.boolean()).min(1)),
  }),
  then: z.strictObject({
    decision: decisionSchema,
    fallback: z.exactOptional(decisionSchema),
    text: z.string().min(1),
  }),
  source: sourceKey,
});

const defaultRowSchema = z.strictObject({
  id: z.string().min(1),
  text: z.string().min(1),
  source: sourceKey,
});

const OUTCOMES = [...DECISIONS, 'none'] as const;

const rulesSchema = z.strictObject({
  sources: z.record(z.string(), sourceRefSchema),
  grid: z.array(gridRuleSchema).min(1),
  noWindow: z.strictObject({ indoors: z.string().min(1), lighten: z.string().min(1) }),
  defaults: z.strictObject({ noData: defaultRowSchema, notScheduled: defaultRowSchema }),
  guards: z.strictObject({
    essentialKinds: z.strictObject({ kinds: z.array(z.enum(ROUTINE_KINDS)), source: sourceKey }),
    windowGain: z.strictObject({ minCutPercent: z.number().min(0).max(100), source: sourceKey }),
    poorDay: z.strictObject({
      earliestHour: z.number().int().min(0).max(23),
      latestHour: z.number().int().min(1).max(24),
      source: sourceKey,
    }),
    childHours: z.strictObject({
      bands: z.array(z.enum(AGE_BANDS)),
      fromHour: z.number().int().min(0).max(23),
      toHour: z.number().int().min(1).max(24),
      schoolFromHour: z.number().int().min(0).max(23),
      schoolToHour: z.number().int().min(1).max(24),
      schoolDays: z.array(z.enum(WEEKDAYS)),
      source: sourceKey,
    }),
  }),
  airing: z.strictObject({
    fromHour: z.number().int().min(0).max(23),
    toHour: z.number().int().min(1).max(24),
    source: sourceKey,
    lengthSource: sourceKey,
  }),
  protection: z.array(
    z.strictObject({
      id: z.string().min(1),
      modes: z.array(z.enum([...MODES, 'unspecified'])).min(1),
      ages: z.array(z.enum(AGE_BANDS)).min(1),
      lines: z.array(z.string().min(1)).min(1),
      source: sourceKey,
    }),
  ),
  topActions: z.array(
    z.strictObject({
      id: z.string().min(1),
      when: z.strictObject({
        severe: z.exactOptional(z.array(z.boolean())),
        outcome: z.exactOptional(z.array(z.enum(OUTCOMES))),
        poorDay: z.exactOptional(z.array(z.boolean())),
        hasBest: z.exactOptional(z.array(z.boolean())),
      }),
      then: z.string().min(1),
      source: sourceKey,
    }),
  ),
});

// Parsed once at load: a typo in the data fails every test instead of mis-advising a family.
const data = rulesSchema.parse(rulesJson);

/** A source key is either a row of the `sources` table or `cpcb:<band>` for CPCB's own health statement. */
function resolve(key: string): SourceRef {
  if (key.startsWith('cpcb:')) {
    const band = BANDS.find((b) => b === key.slice('cpcb:'.length));
    if (band) return healthStatement(band).source;
  }
  const found = Object.hasOwn(data.sources, key) ? data.sources[key] : undefined;
  if (!found) throw new Error(`rules.json names an unknown source: ${key}`);
  return found;
}

export interface GridFacts extends Record<string, FactValue> {
  level: Band;
  sensitivity: Sensitivity;
  intensity: Intensity;
  essential: boolean;
}
export interface GridOutcome {
  decision: Decision;
  fallback?: Decision;
  text: string;
}

export type Outcome = Decision | 'none';
export interface TopFacts extends Record<string, FactValue> {
  severe: boolean;
  outcome: Outcome;
  poorDay: boolean;
  hasBest: boolean;
}

export const GRID: readonly Rule<GridFacts, GridOutcome>[] = data.grid.map((row) => ({
  id: row.id,
  when: row.when,
  then: row.then,
  source: resolve(row.source),
}));

export const TOP_ACTIONS: readonly Rule<TopFacts, string>[] = data.topActions.map((row) => ({
  id: row.id,
  when: row.when,
  then: row.then,
  source: resolve(row.source),
}));

export const NO_WINDOW = data.noWindow;

export interface DefaultRow {
  id: string;
  text: string;
  source: SourceRef;
}
export const NO_DATA: DefaultRow = {
  ...data.defaults.noData,
  source: resolve(data.defaults.noData.source),
};
export const NOT_SCHEDULED: DefaultRow = {
  ...data.defaults.notScheduled,
  source: resolve(data.defaults.notScheduled.source),
};

const { guards } = data;
export const ESSENTIAL_KINDS: readonly RoutineKind[] = guards.essentialKinds.kinds;
export const WINDOW_GAIN = { ...guards.windowGain, source: resolve(guards.windowGain.source) };
export const POOR_DAY = { ...guards.poorDay, source: resolve(guards.poorDay.source) };
export const CHILD_HOURS: {
  bands: readonly AgeBand[];
  fromHour: number;
  toHour: number;
  schoolFromHour: number;
  schoolToHour: number;
  schoolDays: readonly Weekday[];
  source: SourceRef;
} = { ...guards.childHours, source: resolve(guards.childHours.source) };
export const AIRING = {
  fromHour: data.airing.fromHour,
  toHour: data.airing.toHour,
  source: resolve(data.airing.source),
  lengthSource: resolve(data.airing.lengthSource),
};

export interface ProtectionRow {
  id: string;
  modes: readonly (Mode | 'unspecified')[];
  ages: readonly AgeBand[];
  lines: readonly string[];
  source: SourceRef;
}
export const PROTECTION: readonly ProtectionRow[] = data.protection.map((row) => ({
  ...row,
  source: resolve(row.source),
}));

/** The sources table, for tests that check every row. */
export const RULE_SOURCES: Readonly<Record<string, SourceRef>> = data.sources;
