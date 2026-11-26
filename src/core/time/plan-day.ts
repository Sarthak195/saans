// The days a plan can cover (today, tomorrow, the day after, all on the Indian clock) and the
// clock hours an activity touches. Core layer: pure; the current time is passed in, never read.

import type { HourStamp } from '@/core/air/types';
import { formatDate, formatHour, istParts, istWallMs, weekdayOf } from '@/core/time/ist';
import type { Weekday } from '@/core/types';

/** One day the plan can cover: its IST date, weekday, place in the three days, and a label. */
export interface PlanDay {
  date: string;
  weekday: Weekday;
  relative: 'today' | 'tomorrow' | 'day_after';
  /** Short form such as 'Tue 24 Nov'. */
  label: string;
}

// Milliseconds in one day.
const DAY_MS = 86_400_000;
// The three days of a plan, in order from today.
const RELATIVE = ['today', 'tomorrow', 'day_after'] as const;
// Written out so the label never depends on the host's locale data.
const WEEKDAY_NAME: Record<Weekday, string> = {
  mon: 'Mon',
  tue: 'Tue',
  wed: 'Wed',
  thu: 'Thu',
  fri: 'Fri',
  sat: 'Sat',
  sun: 'Sun',
};
// Month names written out for the same reason as the weekday names.
const MONTH_NAME = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];
// From this IST hour on, the rest of today is too short to plan around, so the plan opens on
// tomorrow.
const TOMORROW_FROM_HOUR = 17;
// A 24-hour 'HH:MM' time: hour 00 to 23, minute 00 to 59.
const CLOCK = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** Today, tomorrow and the day after on the Indian clock, in that order, for the instant `now`. */
export function planDays(now: Date): PlanDay[] {
  // Round down to midnight IST: the wall-clock time cut back to a whole number of days.
  const todayMs = Math.floor(istWallMs(now) / DAY_MS) * DAY_MS;
  return RELATIVE.map((relative, offset) => {
    const ms = todayMs + offset * DAY_MS;
    const weekday = weekdayOf(ms);
    const d = new Date(ms);
    const month = MONTH_NAME[d.getUTCMonth()] ?? '';
    return {
      date: formatDate(ms),
      weekday,
      relative,
      label: `${WEEKDAY_NAME[weekday]} ${String(d.getUTCDate())} ${month}`,
    };
  });
}

/** The day the plan opens on: today before 17:00 IST, otherwise tomorrow. */
export function defaultPlanDay(now: Date): PlanDay {
  // planDays always gives three days; the check satisfies the type of the destructuring.
  const [today, tomorrow] = planDays(now);
  if (!today || !tomorrow) throw new Error('planDays returned fewer than two days');
  return istParts(now).hour < TOMORROW_FROM_HOUR ? today : tomorrow;
}

/**
 * Every clock hour an activity touches: 17:30 for 60 minutes covers 17 and 18, 17:00 for 60
 * covers 17 only. Throws a RangeError when the start is not 'HH:MM' or minutes is not finite.
 */
export function hoursOf(day: PlanDay, startHHMM: string, minutes: number): HourStamp[] {
  const m = CLOCK.exec(startHHMM);
  if (!m) throw new RangeError(`Not a HH:MM time: ${startHHMM}`);
  if (!Number.isFinite(minutes))
    throw new RangeError(`Minutes must be a finite number: ${String(minutes)}`);
  const [y, mo, d] = day.date.split('-').map(Number);
  const startMs = Date.UTC(y ?? 0, (mo ?? 1) - 1, d ?? 1, Number(m[1]), Number(m[2]));
  // The end is exclusive, and an activity always touches at least the hour it starts in.
  const endMs = startMs + Math.max(minutes, 1) * 60_000;
  // Whole hours since the epoch, in wall-clock time. The last hour holds the final minute.
  const first = Math.floor(startMs / 3_600_000);
  const last = Math.floor((endMs - 1) / 3_600_000);
  const hours: HourStamp[] = [];
  for (let h = first; h <= last; h += 1) hours.push(formatHour(h * 3_600_000));
  return hours;
}
