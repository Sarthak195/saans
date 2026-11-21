import { isPoorOrWorse, planLevel } from '@/core/advice/level';
import { pm25Level } from '@/core/aqi';
import { COMMUNITY } from '@/core/community/data';
import { fromMinutes, roundToFive, toMinutes } from '@/core/format';
import type { Plan, Window } from '@/core/plan/types';
import type { Routine } from '@/core/types';
import { hoursOf } from '@/core/time';

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
  const restricted = isPoorOrWorse(planLevel(plan));
  const earliest = toMinutes(COMMUNITY.window.earliest);
  const latest = toMinutes(COMMUNITY.window.latest);
  const out: Candidate[] = [];

  for (let shift = -slot.flexHours; shift <= slot.flexHours; shift += 1) {
    const start = toMinutes(slot.start) + shift * 60;
    const end = start + slot.minutes;
    if (start < 0 || end > 24 * 60) continue;
    if (slot.freeFrom !== undefined && start < toMinutes(slot.freeFrom)) continue;
    if (slot.freeTo !== undefined && end > toMinutes(slot.freeTo)) continue;
    // On poor days nothing is offered in the early morning or late evening, when the air is worst.
    if (restricted && (start < earliest || end > latest)) continue;

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
  const pm25ByHour = new Map<string, number>();
  for (const h of plan.air.hourly) if (h.pm25 !== null) pm25ByHour.set(h.hour, h.pm25);

  const all = slots
    .filter((slot) => slot.days.includes(plan.day.weekday))
    .flatMap((slot) => candidatesFor(slot, plan, pm25ByHour));
  const best = all.sort(
    (a, b) => a.mean - b.mean || Math.abs(a.shift) - Math.abs(b.shift) || a.start - b.start,
  )[0];
  if (!best) return null;
  return {
    start: fromMinutes(best.start),
    end: fromMinutes(best.end),
    pm25: roundToFive(best.mean),
    level: pm25Level(best.mean),
  };
}
