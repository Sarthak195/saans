// Finds the cleanest time for outdoor activity among a community's slots, using the plan's hourly
// PM2.5 forecast. Pure core: no clock, network or environment; the plan day is passed in.
import { isPoorOrWorse, planLevel } from '@/core/advice/level';
import { pm25Level } from '@/core/aqi';
import { COMMUNITY } from '@/core/community/data';
import { fromMinutes, roundToFive, toMinutes } from '@/core/format';
import type { Plan, Window } from '@/core/plan/types';
import type { Routine } from '@/core/types';
import { hoursOf } from '@/core/time';

// One possible start for a slot. `start` and `end` are minutes after midnight, `mean` is the
// forecast PM2.5 in micrograms per cubic metre averaged over the hours it covers, and `shift` is
// how many hours it moves from the slot's usual start (negative is earlier).
interface Candidate {
  start: number;
  end: number;
  mean: number;
  shift: number;
}

/** Every start the slot allows, an hour at a time either side, with the forecast mean for each. */
function candidatesFor(
  slot: Routine,
  plan: Plan,
  pm25ByHour: ReadonlyMap<string, number>,
): Candidate[] {
  // On a poor-or-worse day only the band of hours set in community.json is allowed.
  const restricted = isPoorOrWorse(planLevel(plan));
  const earliest = toMinutes(COMMUNITY.window.earliest);
  const latest = toMinutes(COMMUNITY.window.latest);
  const out: Candidate[] = [];

  // Try the usual start and each whole hour earlier or later, up to the slot's `flexHours`.
  for (let shift = -slot.flexHours; shift <= slot.flexHours; shift += 1) {
    const start = toMinutes(slot.start) + shift * 60;
    const end = start + slot.minutes;
    // A candidate must stay inside the same day.
    if (start < 0 || end > 24 * 60) continue;
    // When the slot names a free period, the whole candidate must fit inside it.
    if (slot.freeFrom !== undefined && start < toMinutes(slot.freeFrom)) continue;
    if (slot.freeTo !== undefined && end > toMinutes(slot.freeTo)) continue;
    // On poor days nothing is offered in the early morning or late evening, when the air is worst.
    if (restricted && (start < earliest || end > latest)) continue;

    // The forecast for every clock hour the candidate touches.
    const values = hoursOf(plan.day, fromMinutes(start), slot.minutes).map((hour) =>
      pm25ByHour.get(hour),
    );
    // A candidate with any hour missing from the forecast cannot be compared fairly.
    if (values.some((v) => v === undefined)) continue;
    const known = values as number[];
    out.push({ start, end, mean: known.reduce((a, b) => a + b, 0) / known.length, shift });
  }
  return out;
}

/**
 * The cleanest time for outdoor activity among a community's slots: for each slot that happens on
 * the plan day, the start within its flexibility with the lowest mean forecast PM2.5, then the best
 * of those. Ties go to the smaller move, then the earlier time. Null when no slot has a forecast.
 */
export function bestOutdoorWindow(plan: Plan, slots: readonly Routine[]): Window | null {
  // Forecast PM2.5 by hour stamp; hours with no value are left out, so they read as missing.
  const pm25ByHour = new Map<string, number>();
  for (const h of plan.air.hourly) if (h.pm25 !== null) pm25ByHour.set(h.hour, h.pm25);

  // Only slots that run on the plan day's weekday are considered.
  const all = slots
    .filter((slot) => slot.days.includes(plan.day.weekday))
    .flatMap((slot) => candidatesFor(slot, plan, pm25ByHour));
  // Lowest mean first; on a tie the smaller move, then the earlier start.
  const best = all.sort(
    (a, b) => a.mean - b.mean || Math.abs(a.shift) - Math.abs(b.shift) || a.start - b.start,
  )[0];
  if (!best) return null;
  return {
    start: fromMinutes(best.start),
    end: fromMinutes(best.end),
    // Shown to the nearest 5, but the band comes from the unrounded mean.
    pm25: roundToFive(best.mean),
    level: pm25Level(best.mean),
  };
}
