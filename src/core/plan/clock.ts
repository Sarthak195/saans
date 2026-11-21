import type { HourStamp } from '@/core/air/types';
import { toMinutes } from '@/core/format';
import type { PlanDay } from '@/core/time';
import type { Weekday } from '@/core/types';

export const DAY_MINUTES = 24 * 60;

export const WEEKDAY_FULL: Record<Weekday, string> = {
  mon: 'Monday',
  tue: 'Tuesday',
  wed: 'Wednesday',
  thu: 'Thursday',
  fri: 'Friday',
  sat: 'Saturday',
  sun: 'Sunday',
};

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
