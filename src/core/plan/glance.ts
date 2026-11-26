// The "at a glance" summary of a plan day: best and worst three hours, airing advice, top action.
// Layer: core (pure). No clock, network or environment; the plan day and hourly PM2.5 come in as
// parameters and the wording comes from the sourced rules in rules-data.
import type { AirSeries } from '@/core/air/types';
import { BAND_LABEL, aqiToday, pm25Level } from '@/core/aqi';
import type { Band } from '@/core/aqi';
import { displayPm25, fillTemplate, fromMinutes } from '@/core/format';
import { dayWord, hourOfDay } from '@/core/plan/clock';
import { atLeast, meanOver } from '@/core/plan/pm25';
import type { PmIndex } from '@/core/plan/pm25';
import { AIRING, TOP_ACTIONS } from '@/core/plan/rules-data';
import type { Outcome } from '@/core/plan/rules-data';
import type { Airing, Glance, Window } from '@/core/plan/types';
import { firstMatch } from '@/core/rules/evaluate';
import type { PlanDay } from '@/core/time';

// Length of one "block" of hours: the unit the best, worst, poor and severe checks all use.
const BLOCK_HOURS = 3;
// The "at a glance" blocks stay inside the waking day.
const GLANCE_FROM = 6;
const GLANCE_TO = 22;

// The mean PM2.5 of the three hours from `hour`, or null when any of them has no data.
function blockStarting(
  pm: PmIndex,
  day: PlanDay,
  hour: number,
): { start: number; mean: number } | null {
  const hours = Array.from({ length: BLOCK_HOURS }, (_, i) => hourOfDay(day, hour + i));
  // A block with a missing hour is dropped rather than assessed on part of its hours.
  const mean = meanOver(pm, hours, true);
  return mean === null ? null : { start: hour, mean };
}

// Turns a block into the shown window: clock times, the rounded PM2.5 and its level.
function toWindow(block: { start: number; mean: number }): Window {
  return {
    start: fromMinutes(block.start * 60),
    end: fromMinutes((block.start + BLOCK_HOURS) * 60),
    pm25: displayPm25(block.mean),
    level: pm25Level(block.mean),
  };
}

/** Best and worst three hours between 06:00 and 22:00; the earlier block wins a tie. */
function bestAndWorst(pm: PmIndex, day: PlanDay): { best: Window | null; worst: Window | null } {
  // Every start hour from 06:00 to 19:00, so the last block ends at 22:00.
  const blocks = Array.from({ length: GLANCE_TO - GLANCE_FROM - BLOCK_HOURS + 1 }, (_, i) =>
    blockStarting(pm, day, GLANCE_FROM + i),
  ).filter((b) => b !== null);
  let best = blocks[0];
  let worst = blocks[0];
  // Strict comparisons keep the first block seen, which is how the earlier block wins a tie.
  for (const block of blocks) {
    if (best && block.mean < best.mean) best = block;
    if (worst && block.mean > worst.mean) worst = block;
  }
  return { best: best ? toWindow(best) : null, worst: worst ? toWindow(worst) : null };
}

/** True when any three hours in a row on the plan day are Very Poor or worse. */
export function hasSevereBlock(pm: PmIndex, day: PlanDay): boolean {
  // Unlike the glance blocks, this looks at the whole day, including the night hours.
  return Array.from({ length: 24 - BLOCK_HOURS + 1 }, (_, h) => blockStarting(pm, day, h)).some(
    (block) => block !== null && atLeast(pm25Level(block.mean), 'very_poor'),
  );
}

/**
 * One level for the whole plan day: the CPCB index for the 24 hours ending at 23:00 (PM2.5 and PM10),
 * or, with too little data for that, the band of the day's mean PM2.5. Null with no data at all.
 */
export function planDayBand(series: AirSeries, pm: PmIndex, day: PlanDay): Band | null {
  const aqi = aqiToday(series, hourOfDay(day, 23));
  if (aqi.kind === 'ok') return aqi.band;
  // Fallback: the plain mean of the day's hours with PM2.5, assessed on the hourly PM2.5 bands.
  const mean = meanOver(
    pm,
    Array.from({ length: 24 }, (_, h) => hourOfDay(day, h)),
    false,
  );
  return mean === null ? null : pm25Level(mean);
}

/** True when any three hours in a row between 06:00 and 22:00 are Poor or worse. */
function hasPoorBlock(pm: PmIndex, day: PlanDay): boolean {
  const starts = Array.from(
    { length: GLANCE_TO - GLANCE_FROM - BLOCK_HOURS + 1 },
    (_, i) => GLANCE_FROM + i,
  );
  return starts.some((hour) => {
    const block = blockStarting(pm, day, hour);
    return block !== null && atLeast(pm25Level(block.mean), 'poor');
  });
}

/**
 * Open the windows in the cleanest hour from 12:00 to 16:00. Ordinary airing is advised only when
 * the day is not Poor or worse and no three hours in the waking day are either, because the poor
 * spells are the morning and late-evening hours the advice is about.
 */
function airingAdvice(pm: PmIndex, day: PlanDay, dayBand: Band | null): Airing {
  // Ordinary day: the day is not Poor and no waking-day block is, so no special advice.
  if (!atLeast(dayBand, 'poor') && !hasPoorBlock(pm, day)) return { kind: 'normal' };
  // Find the hour with the lowest PM2.5 inside the airing hours (the end hour is not included).
  let least: { hour: number; value: number } | null = null;
  for (let hour = AIRING.fromHour; hour < AIRING.toHour; hour += 1) {
    const value = pm.get(hourOfDay(day, hour));
    if (value !== undefined && (least === null || value < least.value)) least = { hour, value };
  }
  // No data in those hours means there is nothing to base a window on.
  if (least === null) return { kind: 'normal' };
  const pm25 = displayPm25(least.value);
  // Even the cleanest hour is Very Poor or worse: say to keep windows shut.
  if (atLeast(pm25Level(least.value), 'very_poor')) {
    return { kind: 'keep_shut', leastBadHour: hourOfDay(day, least.hour), pm25 };
  }
  return {
    kind: 'window',
    start: fromMinutes(least.hour * 60),
    end: fromMinutes((least.hour + 1) * 60),
    pm25,
  };
}

// Picks the one headline sentence for the day from the top-action rules and fills in its blanks.
function topActionFor(args: {
  day: PlanDay;
  severe: boolean;
  outcome: Outcome;
  dayBand: Band | null;
  best: Window | null;
  activeStays: boolean;
}): string {
  const { day, severe, outcome, dayBand, best, activeStays } = args;
  // The first rule whose conditions all hold wins, so the order of the rules is the priority.
  const rule = firstMatch(TOP_ACTIONS, {
    severe,
    outcome,
    poorDay: atLeast(dayBand, 'poor'),
    hasBest: best !== null,
    activeStays,
  });
  // The rules are meant to cover every case, so no match is a mistake in the data.
  if (!rule) throw new Error('No top-action rule matched');
  // A missing level or window fills as empty text.
  return fillTemplate(rule.then, {
    when: dayWord(day),
    level: dayBand === null ? '' : BAND_LABEL[dayBand],
    best: best === null ? '' : `${best.start} to ${best.end}`,
  });
}

/**
 * The "at a glance" part of a plan: the best and worst three hours, airing advice and the one
 * headline action. A block with no data is left out, so a field is null when nothing could be
 * assessed.
 */
export function buildGlance(args: {
  day: PlanDay;
  pm: PmIndex;
  severe: boolean;
  outcome: Outcome;
  dayBand: Band | null;
  /** A hard exercise or outdoor play routine is kept, lightened or moved rather than brought indoors. */
  activeStays: boolean;
  /** The hours airing is assessed on, when they differ from the model because a nearby monitor reads worse. */
  airingPm?: PmIndex | undefined;
  /** The hours the cleanest window is picked from: the ones the routines were decided on. */
  advicePm?: PmIndex | undefined;
}): Glance {
  const { worst } = bestAndWorst(args.pm, args.day);
  // The cleanest window is advice about when to go out, so it avoids hours a monitor reads worse.
  const { best } = bestAndWorst(args.advicePm ?? args.pm, args.day);
  return {
    best,
    worst,
    airing: airingAdvice(args.airingPm ?? args.pm, args.day, args.dayBand),
    topAction: topActionFor({ ...args, best }),
    activeStays: args.activeStays,
  };
}
