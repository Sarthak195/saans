// Builds the whole Plan for a household on one plan day from an air series: advice for every
// routine, then the day at a glance, the member totals and the answer to a question if one was
// asked. Core layer: pure. The moment and the data are passed in.
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
import { stationDecision } from '@/core/plan/station';
import type { Outcome } from '@/core/plan/rules-data';
import type { AirSummary, Plan, QuestionTarget } from '@/core/plan/types';
import { defaultPlanDay, istParts, planDays } from '@/core/time';
import type { PlanDay } from '@/core/time';
import { WEEKDAYS } from '@/core/profile/schema';
import type { Household } from '@/core/types';

// Re-exported: the type of the `question` field of PlanInput.
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

/**
 * Everything buildPlan needs: the household, the air series, the moment and the optional day and
 * question.
 */
export interface PlanInput {
  household: Household;
  series: AirSeries;
  /**
   * The moment the plan is for. For a recorded series the caller sets it to a time on `recordedOn`,
   * so the plan reads the recorded day rather than the real date.
   */
  now: Date;
  /**
   * Which plan day to build for. The default plan day for `now` is used when this is absent or
   * matches none.
   */
  day?: PlanDay['relative'] | undefined;
  /** What a family's question points at. When present, the plan carries an answer. */
  question?: QuestionTarget | undefined;
}

/**
 * A scheduled hard exercise or outdoor play routine the plan does not bring indoors: the top
 * action may not tell the family to keep such routines indoors while the routine lines say otherwise.
 */
function activeStays(household: Household, evaluated: Evaluated[]): boolean {
  return evaluated.some((e) => {
    const routine = household.routines.find((r) => r.id === e.advice.routineId);
    const active =
      routine !== undefined &&
      (routine.intensity !== 'light' ||
        routine.kind === 'sport' ||
        routine.kind === 'outdoor_play');
    return active && e.advice.scheduled && e.advice.decision !== 'indoors';
  });
}

// The strongest decision among routines that have data, or 'none'. Routines with no data (usual is
// null) are left out.
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
  // The clock is read in IST from the moment passed in.
  const parts = istParts(now);
  const days = planDays(now);
  const day = days.find((d) => d.relative === input.day) ?? defaultPlanDay(now);
  const pm = pmIndex(series);
  // Routine decisions read the hours with any monitor-driven worse level; the day's level, the
  // strip and the best and worst hours stay the model's own numbers.
  const station = stationDecision({ series, pm, day, now });
  const aqi = aqiToday(series, parts.hourStamp);
  const dayBand = planDayBand(series, pm, day);
  // The advice context for a plan day. Another day gets its own day band, and it is built again
  // when a question needs a later day.
  const contextFor = (forDay: PlanDay) => ({
    day: forDay,
    pm: station.pm,
    poorDay: atLeast(forDay === day ? dayBand : planDayBand(series, pm, forDay), 'poor'),
    // Today's earlier hours are gone, so no window is offered before now.
    notBefore: forDay.relative === 'today' ? parts.hour * 60 + parts.minute : 0,
  });
  const ctx = contextFor(day);

  // One advice per routine, numbered from 1 in household order.
  const evaluated = household.routines.map((routine, index) => {
    const at = household.members.findIndex((m) => m.id === routine.memberId);
    const member = household.members[at];
    // A routine whose member is missing means a broken household, so fail instead of guessing.
    if (!member)
      throw new RangeError(`Routine ${routine.id} names a member who is not in the household`);
    return adviseRoutine(routine, member, { routine: index + 1, member: at + 1 }, ctx);
  });

  // Severe is AQI today at Very Poor or worse, or any block of the plan day at that level.
  const severe = (aqi.kind === 'ok' && aqi.aqi >= VERY_POOR_AQI) || hasSevereBlock(pm, day);
  // The glance reads the same station-adjusted hours as the routines.
  const glance = buildGlance({
    day,
    pm,
    severe,
    outcome: strongest(evaluated),
    dayBand,
    activeStays: activeStays(household, evaluated),
    airingPm: station.pm,
    advicePm: station.pm,
  });

  const air: AirSummary = {
    aqi,
    dataHour: aqi.windowEnd,
    source: series.source,
    gridLat: series.gridLat,
    gridLon: series.gridLon,
    fetchedAt: series.fetchedAt,
    ...(series.recordedOn === undefined ? {} : { recordedOn: series.recordedOn }),
    // The monitor reading is shown only for model data from open-meteo-cams.
    ...(series.station === undefined || series.source !== 'open-meteo-cams'
      ? {}
      : { station: series.station }),
    ...(station.precaution === undefined ? {} : { precaution: station.precaution }),
    // The hourly strip: 16 values from 06:00, with null where the series has no hour.
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

  // True when the question was about today but the plan day is tomorrow and the evening has gone.
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
    // The routine runs on no later plan day, so only the next weekday it runs is named, wrapping
    // round the week, with no advice.
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
    // Advice for the later day is built the same way as for the plan day.
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
