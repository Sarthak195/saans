import type { AirSeries } from '@/core/air/types';
import { aqiToday, pm25Level } from '@/core/aqi';
import type { Decision } from '@/core/decision';
import { displayPm25 } from '@/core/format';
import { adviseRoutine } from '@/core/plan/advice';
import type { Evaluated } from '@/core/plan/advice';
import { buildAnswer } from '@/core/plan/answer';
import type { NextRun } from '@/core/plan/answer';
import { hourOfDay } from '@/core/plan/clock';
import { buildGlance, hasSevereBlock, planDayBand } from '@/core/plan/glance';
import { summariseMembers } from '@/core/plan/members';
import { atLeast, pmIndex } from '@/core/plan/pm25';
import type { Outcome } from '@/core/plan/rules-data';
import type { AirSummary, Plan, QuestionTarget } from '@/core/plan/types';
import { defaultPlanDay, istParts, planDays } from '@/core/time';
import type { PlanDay } from '@/core/time';
import { WEEKDAYS } from '@/core/profile/schema';
import type { Household } from '@/core/types';

export type { QuestionTarget } from '@/core/plan/types';

// AQI 301 is where Very Poor starts; the plan's `severe` flag means Very Poor or worse.
const VERY_POOR_AQI = 301;
// The hourly strip in the plan covers the waking day: 06:00 up to, not including, 22:00.
const STRIP_FROM = 6;
const STRIP_HOURS = 16;
// The most serious thing the plan asks for, strongest first.
const OUTCOME_ORDER: readonly Decision[] = ['indoors', 'move', 'essential', 'lighten', 'keep'];
// After this IST hour, "today" for an evening question means the evening has gone.
const EVENING_OVER_HOUR = 17;

export interface PlanInput {
  household: Household;
  series: AirSeries;
  /**
   * The moment the plan is for. For a recorded series the caller sets it to a time on `recordedOn`,
   * so the plan reads the recorded day rather than the real date.
   */
  now: Date;
  day?: PlanDay['relative'] | undefined;
  question?: QuestionTarget | undefined;
}

function strongest(evaluated: Evaluated[]): Outcome {
  const seen = new Set(evaluated.filter((e) => e.usual !== null).map((e) => e.advice.decision));
  return OUTCOME_ORDER.find((outcome) => seen.has(outcome)) ?? 'none';
}

/**
 * Decides every routine of a household for one day: what to keep, lighten, move, bring indoors or
 * protect, with the reason and the computed effect. Pure: the same inputs give the same plan.
 */
export function buildPlan(input: PlanInput): Plan {
  const { household, series, now } = input;
  const parts = istParts(now);
  const days = planDays(now);
  const day = days.find((d) => d.relative === input.day) ?? defaultPlanDay(now);
  const pm = pmIndex(series);
  const aqi = aqiToday(series, parts.hourStamp);
  const dayBand = planDayBand(series, pm, day);
  const contextFor = (forDay: PlanDay) => ({
    day: forDay,
    pm,
    poorDay: atLeast(forDay === day ? dayBand : planDayBand(series, pm, forDay), 'poor'),
    // Today's earlier hours are gone, so no window is offered before now.
    notBefore: forDay.relative === 'today' ? parts.hour * 60 + parts.minute : 0,
  });
  const ctx = contextFor(day);

  const evaluated = household.routines.map((routine, index) => {
    const at = household.members.findIndex((m) => m.id === routine.memberId);
    const member = household.members[at];
    if (!member)
      throw new RangeError(`Routine ${routine.id} names a member who is not in the household`);
    return adviseRoutine(routine, member, { routine: index + 1, member: at + 1 }, ctx);
  });

  const severe = (aqi.kind === 'ok' && aqi.aqi >= VERY_POOR_AQI) || hasSevereBlock(pm, day);
  const glance = buildGlance({ day, pm, severe, outcome: strongest(evaluated), dayBand });

  const air: AirSummary = {
    aqi,
    dataHour: aqi.windowEnd,
    source: series.source,
    gridLat: series.gridLat,
    gridLon: series.gridLon,
    fetchedAt: series.fetchedAt,
    ...(series.recordedOn === undefined ? {} : { recordedOn: series.recordedOn }),
    ...(series.stale === undefined ? {} : { staleSince: series.stale.lastGoodAt }),
    hourly: Array.from({ length: STRIP_HOURS }, (_, i) => {
      const hour = hourOfDay(day, STRIP_FROM + i);
      const value = pm.get(hour);
      return {
        hour,
        pm25: value === undefined ? null : displayPm25(value),
        level: value === undefined ? null : pm25Level(value),
      };
    }),
  };

  const shifted =
    input.question?.aboutToday === true &&
    day.relative === 'tomorrow' &&
    parts.hour >= EVENING_OVER_HOUR;
  // A routine asked about that is not on the plan day is answered for the next day it runs.
  const nextRun = (found: Evaluated): NextRun | undefined => {
    const routine = household.routines.find((r) => r.id === found.advice.routineId);
    if (!routine) return undefined;
    const later = days
      .slice(days.findIndex((d) => d.date === day.date) + 1)
      .find((d) => routine.days.includes(d.weekday));
    if (!later) {
      const from = WEEKDAYS.indexOf(day.weekday);
      const weekday = [...WEEKDAYS.slice(from + 1), ...WEEKDAYS.slice(0, from + 1)].find((w) =>
        routine.days.includes(w),
      );
      return weekday === undefined ? undefined : { weekday };
    }
    const at = household.members.findIndex((m) => m.id === routine.memberId);
    const member = household.members[at];
    if (!member) return undefined;
    const numbers = { routine: evaluated.indexOf(found) + 1, member: at + 1 };
    const laterCtx = contextFor(later);
    return {
      weekday: later.weekday,
      later: { found: adviseRoutine(routine, member, numbers, laterCtx), day: later },
    };
  };
  const answer = input.question
    ? buildAnswer({ target: input.question, evaluated, day, shifted, nextRun })
    : undefined;

  return {
    place: household.place,
    day,
    days,
    air,
    severe,
    glance,
    routines: evaluated.map((e) => e.advice),
    members: summariseMembers(household.members, evaluated),
    ...(answer ? { answer } : {}),
  };
}
