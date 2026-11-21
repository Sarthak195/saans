import type { HourStamp } from '@/core/air/types';
import type { Weekday } from '@/core/types';

// India has one zone and no DST, so a fixed offset is exact and never depends on the host's tz data.
const IST_OFFSET_MS = (5 * 60 + 30) * 60_000;
const HOUR_MS = 3_600_000;
const HOUR_STAMP = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):00$/;

// Date.getUTCDay() counts from Sunday.
const WEEKDAY_BY_UTC_DAY: readonly Weekday[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

export interface IstParts {
  date: string;
  hour: number;
  minute: number;
  weekday: Weekday;
  hourStamp: HourStamp;
}

function pad(n: number, width = 2): string {
  return String(n).padStart(width, '0');
}

/** Wall-clock milliseconds: the IST reading of the clock, held in a Date that is only ever read with getUTC*. */
export function formatDate(wallMs: number): string {
  const d = new Date(wallMs);
  return `${pad(d.getUTCFullYear(), 4)}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

export function formatHour(wallMs: number): HourStamp {
  return `${formatDate(wallMs)}T${pad(new Date(wallMs).getUTCHours())}:00`;
}

export function weekdayOf(wallMs: number): Weekday {
  const day = WEEKDAY_BY_UTC_DAY[new Date(wallMs).getUTCDay()];
  if (!day) throw new Error('Weekday index out of range');
  return day;
}

export function parseHour(h: HourStamp): number {
  const m = HOUR_STAMP.exec(h);
  if (!m) throw new RangeError(`Not an hour stamp (YYYY-MM-DDTHH:00): ${h}`);
  const [, y, mo, d, hh] = m;
  const ms = Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(hh));
  // Date.UTC rolls 2026-02-31 over to March, so the stamp must survive a round trip.
  if (formatHour(ms) !== h) throw new RangeError(`Not a real hour: ${h}`);
  return ms;
}

export function istWallMs(now: Date): number {
  return now.getTime() + IST_OFFSET_MS;
}

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

export function addHours(h: HourStamp, n: number): HourStamp {
  return formatHour(parseHour(h) + n * HOUR_MS);
}
