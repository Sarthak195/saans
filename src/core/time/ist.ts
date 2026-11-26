// Indian Standard Time (IST) helpers: turn an instant into the date, hour and weekday on the
// Indian clock, and move hour stamps ('YYYY-MM-DDTHH:00') forward or back.
// Core layer: pure. The current time is always passed in, never read here.

import type { HourStamp } from '@/core/air/types';
import type { Weekday } from '@/core/types';

// India has one zone and no DST, so a fixed offset is exact and never depends on the host's
// tz data. The offset is 5 hours 30 minutes, in milliseconds.
const IST_OFFSET_MS = (5 * 60 + 30) * 60_000;
// Milliseconds in one hour.
const HOUR_MS = 3_600_000;
// An hour stamp such as '2026-11-21T22:00': date, then the hour, with minutes always 00.
const HOUR_STAMP = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):00$/;

// Date.getUTCDay() counts from Sunday.
const WEEKDAY_BY_UTC_DAY: readonly Weekday[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

/** The Indian-clock reading of an instant: date, hour, minute, weekday and hour stamp. */
export interface IstParts {
  date: string;
  hour: number;
  minute: number;
  weekday: Weekday;
  hourStamp: HourStamp;
}

// A number as at least `width` digits, padded with zeros: 7 gives "07".
function pad(n: number, width = 2): string {
  return String(n).padStart(width, '0');
}

/**
 * The date 'YYYY-MM-DD' of a wall-clock millisecond value. Wall-clock milliseconds are the IST
 * reading of the clock, held in a Date that is only ever read with getUTC*.
 */
export function formatDate(wallMs: number): string {
  const d = new Date(wallMs);
  return `${pad(d.getUTCFullYear(), 4)}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

/** The hour stamp 'YYYY-MM-DDTHH:00' of a wall-clock millisecond value. */
export function formatHour(wallMs: number): HourStamp {
  return `${formatDate(wallMs)}T${pad(new Date(wallMs).getUTCHours())}:00`;
}

/** The weekday of a wall-clock millisecond value. */
export function weekdayOf(wallMs: number): Weekday {
  const day = WEEKDAY_BY_UTC_DAY[new Date(wallMs).getUTCDay()];
  // Cannot happen for a valid Date; the check satisfies the type of the lookup.
  if (!day) throw new Error('Weekday index out of range');
  return day;
}

// An hour stamp as wall-clock milliseconds. Throws a RangeError for a stamp that is malformed or
// not a real date and hour.
function parseHour(h: HourStamp): number {
  const m = HOUR_STAMP.exec(h);
  if (!m) throw new RangeError(`Not an hour stamp (YYYY-MM-DDTHH:00): ${h}`);
  const [, y, mo, d, hh] = m;
  const ms = Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(hh));
  // Date.UTC rolls 2026-02-31 over to March, so the stamp must survive a round trip.
  if (formatHour(ms) !== h) throw new RangeError(`Not a real hour: ${h}`);
  return ms;
}

/** An instant as wall-clock milliseconds: the real time moved forward by the IST offset. */
export function istWallMs(now: Date): number {
  return now.getTime() + IST_OFFSET_MS;
}

/** ISO 8601 on the Indian clock, e.g. '2026-11-21T22:05:00+05:30'. */
export function istIso(at: Date): string {
  return `${new Date(istWallMs(at)).toISOString().slice(0, 19)}+05:30`;
}

/** The date, hour, minute, weekday and hour stamp of an instant on the Indian clock. */
export function istParts(now: Date): IstParts {
  const wall = istWallMs(now);
  const d = new Date(wall);
  return {
    date: formatDate(wall),
    hour: d.getUTCHours(),
    minute: d.getUTCMinutes(),
    weekday: weekdayOf(wall),
    hourStamp: formatHour(wall),
  };
}

/** An hour stamp moved by `n` whole hours (negative goes back). Throws a RangeError if bad. */
export function addHours(h: HourStamp, n: number): HourStamp {
  return formatHour(parseHour(h) + n * HOUR_MS);
}
