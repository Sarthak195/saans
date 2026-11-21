import { pm25Level } from '@/core/aqi';
import { displayPm25, fromMinutes, toMinutes } from '@/core/format';
import { DAY_MINUTES } from '@/core/plan/clock';
import { bandRank, meanOver } from '@/core/plan/pm25';
import type { PmIndex } from '@/core/plan/pm25';
import { CHILD_HOURS, POOR_DAY, WINDOW_GAIN } from '@/core/plan/rules-data';
import type { Window } from '@/core/plan/types';
import type { PlanDay } from '@/core/time';
import { hoursOf } from '@/core/time';
import type { Member, Routine } from '@/core/types';

interface FoundWindow {
  window: Window;
  /** Unrounded mean PM2.5 over the window; the shown value in `window.pm25` is rounded. */
  mean: number;
}

interface WindowSearch {
  routine: Routine;
  member: Member;
  day: PlanDay;
  pm: PmIndex;
  /** Unrounded mean PM2.5 over the routine as planned. */
  original: number;
  /** True when the plan day, or this routine's own air, is Poor or worse: the strict hours apply. */
  poorDay: boolean;
  /** Minutes after midnight now, when the plan day is today; nothing earlier is offered. */
  notBefore: number;
}

function allowed(search: WindowSearch, start: number, end: number): boolean {
  const { routine, member, day } = search;
  // India's day ends at midnight: a window must finish on the plan day itself.
  if (start < search.notBefore || end >= DAY_MINUTES) return false;

  if (search.poorDay && (start < POOR_DAY.earliestHour * 60 || end > POOR_DAY.latestHour * 60)) {
    return false;
  }

  if (routine.freeFrom !== undefined && routine.freeTo !== undefined) {
    const [from, to] = [toMinutes(routine.freeFrom), toMinutes(routine.freeTo)];
    // Free hours that run backwards would mean overnight; they are not used to restrict.
    if (from < to && (start < from || end > to)) return false;
  }

  if (CHILD_HOURS.bands.includes(member.ageBand)) {
    if (start < CHILD_HOURS.fromHour * 60 || end > CHILD_HOURS.toHour * 60) return false;
    const freeHoursGiven = routine.freeFrom !== undefined && routine.freeTo !== undefined;
    const school = !freeHoursGiven && CHILD_HOURS.schoolDays.includes(day.weekday);
    const [classFrom, classTo] = [CHILD_HOURS.schoolFromHour * 60, CHILD_HOURS.schoolToHour * 60];
    if (school && start < classTo && end > classFrom) return false;
  }
  return true;
}

function worthOffering(original: number, candidate: number): boolean {
  if (bandRank(pm25Level(candidate)) < bandRank(pm25Level(original))) return true;
  return candidate <= original * (1 - WINDOW_GAIN.minCutPercent / 100);
}

/**
 * The cleanest slot of the same length, whole hours either side of the start and inside the plan day,
 * or null when none is worth moving to. Ties go to the slot nearest the usual time, then the earlier one.
 */
export function findCleanerWindow(search: WindowSearch): FoundWindow | null {
  const { routine, day, pm, original } = search;
  const start = toMinutes(routine.start);
  let best: { mean: number; shift: number; start: number } | null = null;

  for (let shift = -routine.flexHours; shift <= routine.flexHours; shift += 1) {
    if (shift === 0) continue;
    const from = start + shift * 60;
    const to = from + routine.minutes;
    if (from < 0 || to >= DAY_MINUTES) continue;
    const mean = meanOver(pm, hoursOf(day, fromMinutes(from), routine.minutes), true);
    if (mean === null || !allowed(search, from, to)) continue;
    const better =
      best === null ||
      mean < best.mean ||
      (mean === best.mean && Math.abs(shift) < Math.abs(best.shift));
    if (better) best = { mean, shift, start: from };
  }

  if (best === null || !worthOffering(original, best.mean)) return null;
  return {
    mean: best.mean,
    window: {
      start: fromMinutes(best.start),
      end: fromMinutes(best.start + routine.minutes),
      pm25: displayPm25(best.mean),
      level: pm25Level(best.mean),
    },
  };
}
