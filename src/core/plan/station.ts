// Compares a nearby monitor's PM2.5 with the model and, when the monitor reads worse, raises the
// next few hours for the plan. Layer: core (pure). The clock arrives as `now`; nothing is fetched,
// and the 24-hour AQI is not touched by it.
import type { AirSeries, HourStamp } from '@/core/air/types';
import { pm25Level } from '@/core/aqi';
import { bandRank } from '@/core/plan/pm25';
import type { PmIndex } from '@/core/plan/pm25';
import type { StationPrecaution } from '@/core/plan/types';
import { addHours, istParts } from '@/core/time';
import type { PlanDay } from '@/core/time';

/** The precaution covers the hour of now and this many hours after it. */
export const PRECAUTION_HOURS_AHEAD = 3;
/** A reading older than this (4 hours, in milliseconds) no longer describes the air now. */
const MAX_AGE_MS = 4 * 60 * 60 * 1000;
/** A clock a few minutes ahead of ours (10 minutes, in milliseconds) is tolerated. */
const FUTURE_SLACK_MS = 10 * 60 * 1000;

/** The outcome of comparing the monitor with the model: any precaution, and the index to use. */
export interface StationDecision {
  /** Set when the nearby monitor reads worse than the model for the same hour. */
  precaution: StationPrecaution | undefined;
  /** The index the hour-level decisions read: the model's, with the worse level in the covered hours. */
  pm: PmIndex;
}

/**
 * Compares the nearby monitor with the model like for like: the monitor's PM2.5 against the model's
 * PM2.5 for the hour the monitor measured, both through the same hourly level the advice uses. When
 * the monitor reads a worse level, the hours from now to three hours ahead are read at that worse
 * level, so a routine is not sent out into air a monitor says is worse than the forecast. Only a
 * live series and only today: a recording, the smog day and later days never change. The 24-hour
 * AQI is never touched; it stays a model number.
 */
export function stationDecision(args: {
  series: AirSeries;
  pm: PmIndex;
  day: PlanDay;
  now: Date;
}): StationDecision {
  const { series, pm, day, now } = args;
  // Every guard below falls back to this: no precaution and the model's own hours, unchanged.
  const none: StationDecision = { precaution: undefined, pm };
  const { station } = series;
  // Only a live series, and only today's plan, can be compared with a monitor reading.
  if (series.source !== 'open-meteo-cams') return none;
  if (station === undefined || day.relative !== 'today') return none;
  // A missing, broken or negative reading is not used.
  const stationPm = station.pm25;
  if (stationPm === null || !Number.isFinite(stationPm) || stationPm < 0) return none;

  // A reading that is too old, or stamped further ahead than the clock slack, is ignored. An
  // unparseable time gives NaN, which is ignored too.
  const measured = new Date(station.measuredAt);
  const age = now.getTime() - measured.getTime();
  if (Number.isNaN(age) || age > MAX_AGE_MS || age < -FUTURE_SLACK_MS) return none;
  // The model value for the hour the monitor measured, so the two are compared for the same hour.
  const modelPm = pm.get(istParts(measured).hourStamp);
  if (modelPm === undefined) return none;

  const stationLevel = pm25Level(stationPm);
  const modelLevel = pm25Level(modelPm);
  // The monitor never makes the plan more relaxed: it matters only when it reads a worse level.
  if (bandRank(stationLevel) <= bandRank(modelLevel)) return none;

  // The hour of now and the next three, kept to the plan day (stamps begin with their date).
  const fromHour = istParts(now).hourStamp;
  const hours: HourStamp[] = Array.from({ length: PRECAUTION_HOURS_AHEAD + 1 }, (_, i) =>
    addHours(fromHour, i),
  ).filter((hour) => hour.startsWith(day.date));
  // Work on a copy so the caller's index is not changed; hours are only ever raised.
  const raised = new Map(pm);
  for (const hour of hours) {
    const value = raised.get(hour);
    if (value !== undefined) raised.set(hour, Math.max(value, stationPm));
  }
  return {
    precaution: { stationLevel, modelLevel, fromHour, toHour: hours.at(-1) ?? fromHour },
    pm: raised,
  };
}
