// Loads src/data/rules.json once, checks it against a strict schema and exposes the tables the
// plan reads: the decision grid, the top actions, the guards and the protection lines. Every
// row names a source, and the source key is resolved here to a full source. Core layer: no
// clock, network or environment.
import { z } from 'zod';

import { BANDS } from '@/core/aqi/breakpoints';
import type { Band } from '@/core/aqi';
import { healthStatement } from '@/core/aqi';
import { DECISIONS } from '@/core/decision';
import type { Decision } from '@/core/decision';
import { AGE_BANDS, INTENSITIES, MODES, ROUTINE_KINDS, WEEKDAYS } from '@/core/profile/schema';
import { sourceRefSchema } from '@/core/source';
import type { FactValue, Rule } from '@/core/rules/evaluate';
import type { SourceRef } from '@/core/source';
import type { AgeBand, Intensity, Mode, RoutineKind, Sensitivity, Weekday } from '@/core/types';
import rulesJson from '@/data/rules.json';

// The sensitivity levels a grid row can name, the same three as the Sensitivity type.
const SENSITIVITIES = ['high', 'raised', 'general'] as const;
const sensitivitySchema = z.enum(SENSITIVITIES);
const decisionSchema = z.enum(DECISIONS);
const sourceKey = z.string().min(1);

// One row of the decision grid. A fact left out of `when` matches any value.
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

// A fixed line for a routine the grid cannot assess: no air data, or not on the plan day.
const defaultRowSchema = z.strictObject({
  id: z.string().min(1),
  text: z.string().min(1),
  source: sourceKey,
});

// What the day's routines add up to: the strongest decision, or 'none' when no routine has data.
const OUTCOMES = [...DECISIONS, 'none'] as const;

// The whole shape of rules.json. It is strict, so an unknown key is an error.
const rulesSchema = z.strictObject({
  // Named sources that rows point at by key.
  sources: z.record(z.string(), sourceRefSchema),
  // The decision grid, most specific rows first: the first match wins.
  grid: z.array(gridRuleSchema).min(1),
  // Sentences added when a move was wanted and no cleaner time was found.
  noWindow: z.strictObject({ indoors: z.string().min(1), lighten: z.string().min(1) }),
  // The two fixed lines from defaultRowSchema.
  defaults: z.strictObject({ noData: defaultRowSchema, notScheduled: defaultRowSchema }),
  // Limits applied on top of the grid. Hours are whole IST hours on a 24-hour clock, and an end
  // hour may be 24 for midnight.
  guards: z.strictObject({
    // Routine kinds that cannot be dropped, so they get protection instead of a move.
    essentialKinds: z.strictObject({ kinds: z.array(z.enum(ROUTINE_KINDS)), source: sourceKey }),
    // The least percentage cut in PM2.5 that makes a cleaner time worth moving to when it stays in
    // the same band.
    windowGain: z.strictObject({ minCutPercent: z.number().min(0).max(100), source: sourceKey }),
    // The hours left open for exercise on a Poor or worse day, and the words used when a routine's
    // own hours fall outside them.
    poorDay: z.strictObject({
      earliestHour: z.number().int().min(0).max(23),
      latestHour: z.number().int().min(1).max(24),
      source: sourceKey,
      // Where the advice on a routine's own hours comes from, and the words for it.
      adviceSource: sourceKey,
      moveText: z.string().min(1),
      lightNote: z.string().min(1),
    }),
    // Daytime hours kept for every age band in daytimeBands, and school hours that the bands in
    // `bands` are kept out of on schoolDays.
    childHours: z.strictObject({
      /** Children and teenagers: kept out of school hours as well as inside the daytime band. */
      bands: z.array(z.enum(AGE_BANDS)),
      /** Everyone kept inside the daytime band, children and teenagers included. */
      daytimeBands: z.array(z.enum(AGE_BANDS)),
      fromHour: z.number().int().min(0).max(23),
      toHour: z.number().int().min(1).max(24),
      schoolFromHour: z.number().int().min(0).max(23),
      schoolToHour: z.number().int().min(1).max(24),
      schoolDays: z.array(z.enum(WEEKDAYS)),
      source: sourceKey,
    }),
  }),
  // The hours in which the cleanest hour is offered for airing the home.
  airing: z.strictObject({
    fromHour: z.number().int().min(0).max(23),
    toHour: z.number().int().min(1).max(24),
    source: sourceKey,
    lengthSource: sourceKey,
  }),
  // Protection lines for a trip that has to happen, picked by mode, age band and level.
  protection: z.array(
    z.strictObject({
      id: z.string().min(1),
      modes: z.array(z.enum([...MODES, 'unspecified'])).min(1),
      ages: z.array(z.enum(AGE_BANDS)).min(1),
      /** The levels the row applies at; absent means every level. */
      levels: z.exactOptional(z.array(z.enum(BANDS)).min(1)),
      lines: z.array(z.string().min(1)).min(1),
      source: sourceKey,
    }),
  ),
  // Rows for the day's one-line top action, tested in order.
  topActions: z.array(
    z.strictObject({
      id: z.string().min(1),
      when: z.strictObject({
        severe: z.exactOptional(z.array(z.boolean())),
        outcome: z.exactOptional(z.array(z.enum(OUTCOMES))),
        poorDay: z.exactOptional(z.array(z.boolean())),
        hasBest: z.exactOptional(z.array(z.boolean())),
        activeStays: z.exactOptional(z.array(z.boolean())),
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
  // 'cpcb:poor' points at CPCB's own health statement for that band.
  if (key.startsWith('cpcb:')) {
    const band = BANDS.find((b) => b === key.slice('cpcb:'.length));
    if (band) return healthStatement(band).source;
  }
  // Own keys only, so a key such as 'toString' is reported as unknown.
  const found = Object.hasOwn(data.sources, key) ? data.sources[key] : undefined;
  if (!found) throw new Error(`rules.json names an unknown source: ${key}`);
  return found;
}

/** The facts about one routine and its member that a decision-grid row can test. */
export interface GridFacts extends Record<string, FactValue> {
  level: Band;
  sensitivity: Sensitivity;
  intensity: Intensity;
  essential: boolean;
}
/**
 * What a matched grid row says: the decision, the decision to use instead when a move finds no
 * window, and the sentence, which may hold a {level} placeholder.
 */
interface GridOutcome {
  decision: Decision;
  fallback?: Decision;
  text: string;
}

/** The strongest decision across a day's routines, or 'none' when no routine has air data. */
export type Outcome = Decision | 'none';
/** The facts about the whole day that a top-action row can test. */
interface TopFacts extends Record<string, FactValue> {
  severe: boolean;
  outcome: Outcome;
  poorDay: boolean;
  hasBest: boolean;
  /** A hard exercise or outdoor play routine on the day is not brought indoors. */
  activeStays: boolean;
}

/** The decision grid as rules with their sources resolved. The first matching row decides. */
export const GRID: readonly Rule<GridFacts, GridOutcome>[] = data.grid.map((row) => ({
  id: row.id,
  when: row.when,
  then: row.then,
  source: resolve(row.source),
}));

/**
 * The top-action rows as rules with their sources resolved. The first matching row gives the day's
 * one-line headline.
 */
export const TOP_ACTIONS: readonly Rule<TopFacts, string>[] = data.topActions.map((row) => ({
  id: row.id,
  when: row.when,
  then: row.then,
  source: resolve(row.source),
}));

/**
 * Sentences added to the advice when a move was wanted but no cleaner time was found, keyed by the
 * decision used instead.
 */
export const NO_WINDOW = data.noWindow;

/** A fixed line with its rule id and source, used when the grid cannot assess a routine. */
export interface DefaultRow {
  id: string;
  text: string;
  source: SourceRef;
}
/** The line for a routine whose hours have no air data. */
export const NO_DATA: DefaultRow = {
  ...data.defaults.noData,
  source: resolve(data.defaults.noData.source),
};
/**
 * The line for a routine that does not happen on the plan day. It holds a {weekdays} placeholder.
 */
export const NOT_SCHEDULED: DefaultRow = {
  ...data.defaults.notScheduled,
  source: resolve(data.defaults.notScheduled.source),
};

// Guards are limits applied on top of the grid.
const { guards } = data;
/**
 * Routine kinds that cannot be dropped, such as a commute or school run, so the advice is
 * protection rather than a move.
 */
export const ESSENTIAL_KINDS: readonly RoutineKind[] = guards.essentialKinds.kinds;
/**
 * How much cleaner a time must be to be worth moving to: a cut in PM2.5 of at least minCutPercent
 * (0 to 100), or a time that lands in a lower band.
 */
export const WINDOW_GAIN = { ...guards.windowGain, source: resolve(guards.windowGain.source) };
/**
 * The hours left open for exercise on a Poor or worse day, as whole IST hours (latestHour may be
 * 24), with the sources of the hours and of the advice, and the words used for a move and for a
 * light routine.
 */
export const POOR_DAY = {
  ...guards.poorDay,
  source: resolve(guards.poorDay.source),
  adviceSource: resolve(guards.poorDay.adviceSource),
};
/**
 * Hours a cleaner time may not fall outside, as whole IST hours. Every band in daytimeBands stays
 * between fromHour and toHour. The bands in `bands` also stay out of school hours (schoolFromHour
 * to schoolToHour) on schoolDays.
 */
export const CHILD_HOURS: {
  bands: readonly AgeBand[];
  daytimeBands: readonly AgeBand[];
  fromHour: number;
  toHour: number;
  schoolFromHour: number;
  schoolToHour: number;
  schoolDays: readonly Weekday[];
  source: SourceRef;
} = { ...guards.childHours, source: resolve(guards.childHours.source) };
/**
 * The hours (toHour not included, whole IST hours) in which the cleanest hour is offered for
 * airing the home, with the source of the hours and a second source for the length of the window.
 */
export const AIRING = {
  fromHour: data.airing.fromHour,
  toHour: data.airing.toHour,
  source: resolve(data.airing.source),
  lengthSource: resolve(data.airing.lengthSource),
};

/**
 * One row of protection lines, with the trip modes, age bands and (when present) levels it applies
 * to.
 */
interface ProtectionRow {
  id: string;
  modes: readonly (Mode | 'unspecified')[];
  ages: readonly AgeBand[];
  levels?: readonly Band[];
  lines: readonly string[];
  source: SourceRef;
}
/**
 * Protection lines for a trip that has to happen. A row applies when the trip's mode (or
 * 'unspecified' when none is given), the member's age band and, if the row names levels, the level
 * all match.
 */
export const PROTECTION: readonly ProtectionRow[] = data.protection.map((row) => ({
  ...row,
  source: resolve(row.source),
}));

/** The sources table, for tests that check every row. */
export const RULE_SOURCES: Readonly<Record<string, SourceRef>> = data.sources;
