// Small clock helpers for plan days: hour stamps, weekday names and the day word in a sentence.
// Layer: core (pure). Times are IST; the plan day and the hour come in as parameters.
import type { HourStamp } from '@/core/air/types';
import { toMinutes } from '@/core/format';
import type { PlanDay } from '@/core/time';
import type { Weekday } from '@/core/types';

/** Minutes in a day (1440): a window must end before this to stay on the plan day. */
export const DAY_MINUTES = 24 * 60;

/** Full English weekday names, keyed by the short weekday used in profiles. */
export const WEEKDAY_FULL: Record<Weekday, string> = {
  mon: 'Monday',
  tue: 'Tuesday',
  wed: 'Wednesday',
  thu: 'Thursday',
  fri: 'Friday',
  sat: 'Saturday',
  sun: 'Sunday',
};

/** The hour stamp, such as 2026-11-24T17:00, for a clock hour (0 to 23) of the plan day. */
export function hourOfDay(day: PlanDay, hour: number): HourStamp {
  return `${day.date}T${String(hour).padStart(2, '0')}:00`;
}

/** The hour and minute of a clock time as two numbers, the way the text checker reads '17:30'. */
export function clockNumbers(hhmm: string): number[] {
  return [Math.floor(toMinutes(hhmm) / 60), toMinutes(hhmm) % 60];
}

/** 'today', 'tomorrow' or the weekday name, for a sentence such as "Keep play indoors tomorrow". */
export function dayWord(day: PlanDay): string {
  if (day.relative === 'today') return 'today';
  if (day.relative === 'tomorrow') return 'tomorrow';
  return `on ${WEEKDAY_FULL[day.weekday]}`;
}
