import type { HourStamp } from '@/core/air/types';
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

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** Minutes after midnight for a validated 'HH:MM' string. */
export function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':');
  return Number(h) * 60 + Number(m);
}

export function fromMinutes(minutes: number): string {
  return `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;
}

export function hourOfDay(day: PlanDay, hour: number): HourStamp {
  return `${day.date}T${pad(hour)}:00`;
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

export function capitalise(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
