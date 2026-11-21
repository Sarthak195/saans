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

const BLOCK_HOURS = 3;
// The "at a glance" blocks stay inside the waking day.
const GLANCE_FROM = 6;
const GLANCE_TO = 22;

function blockStarting(
  pm: PmIndex,
  day: PlanDay,
  hour: number,
): { start: number; mean: number } | null {
  const hours = Array.from({ length: BLOCK_HOURS }, (_, i) => hourOfDay(day, hour + i));
  const mean = meanOver(pm, hours, true);
  return mean === null ? null : { start: hour, mean };
}

function toWindow(block: { start: number; mean: number }): Window {
  return {
    start: fromMinutes(block.start * 60),
    end: fromMinutes((block.start + BLOCK_HOURS) * 60),
    pm25: displayPm25(block.mean),
    level: pm25Level(block.mean),
  };
}

/** Best and worst three hours between 06:00 and 22:00; the earlier block wins a tie. */
export function bestAndWorst(
  pm: PmIndex,
  day: PlanDay,
): { best: Window | null; worst: Window | null } {
  const blocks = Array.from({ length: GLANCE_TO - GLANCE_FROM - BLOCK_HOURS + 1 }, (_, i) =>
    blockStarting(pm, day, GLANCE_FROM + i),
  ).filter((b) => b !== null);
  let best = blocks[0];
  let worst = blocks[0];
  for (const block of blocks) {
    if (best && block.mean < best.mean) best = block;
    if (worst && block.mean > worst.mean) worst = block;
  }
  return { best: best ? toWindow(best) : null, worst: worst ? toWindow(worst) : null };
}

/** True when any three hours in a row on the plan day are Very Poor or worse. */
export function hasSevereBlock(pm: PmIndex, day: PlanDay): boolean {
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
  const mean = meanOver(
    pm,
    Array.from({ length: 24 }, (_, h) => hourOfDay(day, h)),
    false,
  );
  return mean === null ? null : pm25Level(mean);
}

/** Open the windows in the cleanest hour from 12:00 to 16:00, and only on a Poor or worse day. */
export function airingAdvice(pm: PmIndex, day: PlanDay, dayBand: Band | null): Airing {
  if (!atLeast(dayBand, 'poor')) return { kind: 'normal' };
  let least: { hour: number; value: number } | null = null;
  for (let hour = AIRING.fromHour; hour < AIRING.toHour; hour += 1) {
    const value = pm.get(hourOfDay(day, hour));
    if (value !== undefined && (least === null || value < least.value)) least = { hour, value };
  }
  if (least === null) return { kind: 'normal' };
  const pm25 = displayPm25(least.value);
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

export function topActionFor(args: {
  day: PlanDay;
  severe: boolean;
  outcome: Outcome;
  dayBand: Band | null;
  best: Window | null;
}): string {
  const { day, severe, outcome, dayBand, best } = args;
  const rule = firstMatch(TOP_ACTIONS, {
    severe,
    outcome,
    poorDay: atLeast(dayBand, 'poor'),
    hasBest: best !== null,
  });
  if (!rule) throw new Error('No top-action rule matched');
  return fillTemplate(rule.then, {
    when: dayWord(day),
    level: dayBand === null ? '' : BAND_LABEL[dayBand],
    best: best === null ? '' : `${best.start} to ${best.end}`,
  });
}

export function buildGlance(args: {
  day: PlanDay;
  pm: PmIndex;
  severe: boolean;
  outcome: Outcome;
  dayBand: Band | null;
}): Glance {
  const { best, worst } = bestAndWorst(args.pm, args.day);
  return {
    best,
    worst,
    airing: airingAdvice(args.pm, args.day, args.dayBand),
    topAction: topActionFor({ ...args, best }),
  };
}
