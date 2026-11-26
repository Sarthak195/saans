// Finds a cleaner time of day for a routine within its flexible hours.
// Layer: core (pure). The air arrives as an hourly index and the plan day as a parameter, so the
// search depends on nothing else. Thresholds come from the sourced rules in rules-data.
import { pm25Level } from '@/core/aqi';
import { displayPm25, fromMinutes, toMinutes } from '@/core/format';
import { DAY_MINUTES } from '@/core/plan/clock';
import { bandRank, meanOver } from '@/core/plan/pm25';
import type { PmIndex } from '@/core/plan/pm25';
import { CHILD_HOURS, POOR_DAY, WINDOW_GAIN } from '@/core/plan/rules-data';
import { sensitivityOf } from '@/core/plan/sensitivity';
import type { Window } from '@/core/plan/types';
import type { PlanDay } from '@/core/time';
import { hoursOf } from '@/core/time';
import type { Member, Routine, Sensitivity } from '@/core/types';

/** A cleaner time found for a routine, with the unrounded mean kept for the exposure totals. */
interface FoundWindow {
  window: Window;
  /** Unrounded mean PM2.5 over the window; the shown value in `window.pm25` is rounded. */
  mean: number;
}

/** What the search for a cleaner time needs: the routine, who does it, the day and the air. */
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

// Whether a candidate slot (minutes after midnight) is a time this person may be sent out in.
function allowed(search: WindowSearch, start: number, end: number): boolean {
  const { routine, member, day } = search;
  // India's day ends at midnight: a window must finish on the plan day itself.
  if (start < search.notBefore || end >= DAY_MINUTES) return false;

  // On a poor day only the hours from POOR_DAY.earliestHour to POOR_DAY.latestHour are offered.
  if (search.poorDay && (start < POOR_DAY.earliestHour * 60 || end > POOR_DAY.latestHour * 60)) {
    return false;
  }

  // Free hours that run backwards would mean overnight; they are neither used to restrict nor
  // taken as given, so the school-hours check below still applies.
  const free =
    routine.freeFrom !== undefined &&
    routine.freeTo !== undefined &&
    toMinutes(routine.freeFrom) < toMinutes(routine.freeTo)
      ? { from: toMinutes(routine.freeFrom), to: toMinutes(routine.freeTo) }
      : null;
  // The family said when the person is free; the slot must sit inside those hours.
  if (free && (start < free.from || end > free.to)) return false;

  // Infants, small children, older adults and young people are not sent out in the dark or the late evening.
  // The bands listed as daytime-only keep to the rule's daytime hours (see CHILD_HOURS).
  if (CHILD_HOURS.daytimeBands.includes(member.ageBand)) {
    if (start < CHILD_HOURS.fromHour * 60 || end > CHILD_HOURS.toHour * 60) return false;
  }
  // Children and teenagers are not moved into school hours on a school day. Their own free hours
  // (when given) replace this check, since they already say when the person is free.
  if (CHILD_HOURS.bands.includes(member.ageBand)) {
    const school = free === null && CHILD_HOURS.schoolDays.includes(day.weekday);
    const [classFrom, classTo] = [CHILD_HOURS.schoolFromHour * 60, CHILD_HOURS.schoolToHour * 60];
    if (school && start < classTo && end > classFrom) return false;
  }
  return true;
}

/**
 * A cleaner time is worth offering when it is a band lower or at least the minimum share lower, and
 * it lands in a band the person can be moved to: Moderately polluted or better for children, older
 * adults and people with conditions, Poor or better for other adults. Moving someone from one polluted
 * hour to a slightly less polluted one is not a plan, so the caller falls back instead.
 */
function worthOffering(original: number, candidate: number, sensitivity: Sensitivity): boolean {
  // Compare the level the person would land in against the highest level they may be moved to.
  const target = pm25Level(candidate);
  if (bandRank(target) > bandRank(sensitivity === 'general' ? 'poor' : 'moderate')) return false;
  // A lower band is always worth it; within the same band the cut must reach the minimum share.
  if (bandRank(target) < bandRank(pm25Level(original))) return true;
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

  // Try every whole-hour shift within the routine's flexibility, earlier and later.
  for (let shift = -routine.flexHours; shift <= routine.flexHours; shift += 1) {
    // Shift 0 is the usual time, which is the baseline and not a candidate.
    if (shift === 0) continue;
    const from = start + shift * 60;
    const to = from + routine.minutes;
    if (from < 0 || to >= DAY_MINUTES) continue;
    // Every hour the slot touches must have data (requireAll), so a slot is never assessed on a gap.
    const mean = meanOver(pm, hoursOf(day, fromMinutes(from), routine.minutes), true);
    if (mean === null || !allowed(search, from, to)) continue;
    // Lowest mean wins; on an exact tie the slot nearer the usual time wins, then the earlier one.
    const better =
      best === null ||
      mean < best.mean ||
      (mean === best.mean && Math.abs(shift) < Math.abs(best.shift));
    if (better) best = { mean, shift, start: from };
  }

  // Even the best slot is dropped when it is not worth moving to; the caller then falls back.
  if (best === null || !worthOffering(original, best.mean, sensitivityOf(search.member))) {
    return null;
  }
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
