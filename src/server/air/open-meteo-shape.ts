// The Open-Meteo air-quality request URL and the check and mapping of its reply into an
// AirSeries. Server layer, but no network here: the live adapter, the recorded loader and the
// recording script all share it, so a recording is read exactly as a live reply is.
import { z } from 'zod';

import type { AirSeries, HourSample } from '@/core/air/types';
import { addHours, istParts } from '@/core/time';
import { AppError } from '@/server/errors';

// The recorder script and tests write instants through here, beside the URL they were fetched from.
export { istIso } from '@/core/time';

const AIR_QUALITY_ENDPOINT = 'https://air-quality-api.open-meteo.com/v1/air-quality';
// The pollutants asked for, as Open-Meteo names them. The reply schema below must list the same.
const HOURLY = [
  'pm2_5',
  'pm10',
  'nitrogen_dioxide',
  'ozone',
  'carbon_monoxide',
  'sulphur_dioxide',
] as const;

// The live window kept around now: 24 hours back and 72 hours ahead.
const PAST_HOURS = 24;
const AHEAD_HOURS = 72;

/** One decimal degree, about 11 km: finer than the 45 km model grid, and never pins down a home. */
export function roundCoord(value: number): number {
  return Math.round(value * 10) / 10;
}

/** A range of calendar days (YYYY-MM-DD, IST) used to fetch a past day instead of the forecast. */
export interface DateWindow {
  startDate: string;
  endDate: string;
}

/** The request for one place. With a window it asks for a past range, not the live forecast. */
export function airUrl(lat: number, lon: number, window?: DateWindow): string {
  // Live: yesterday plus a four-day forecast, which covers the window kept in toAirSeries.
  const range = window
    ? `start_date=${window.startDate}&end_date=${window.endDate}`
    : 'past_days=1&forecast_days=4';
  // The place is rounded first, and the times come back in India time (Asia/Kolkata).
  return (
    `${AIR_QUALITY_ENDPOINT}?latitude=${String(roundCoord(lat))}&longitude=${String(roundCoord(lon))}` +
    `&hourly=${HOURLY.join(',')}&${range}&timezone=Asia%2FKolkata`
  );
}

// One value per hour; a missing hour is null, not absent.
const hourlySeries = z.array(z.number().nullable());

/**
 * The shape of an Open-Meteo reply that the app accepts. Times look like "2025-12-13T07:00" (IST),
 * and every pollutant must have exactly one value, or null, per time. Anything else is rejected.
 */
export const airBodySchema = z.object({
  latitude: z.number(),
  longitude: z.number(),
  hourly: z
    .object({
      time: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/)),
      pm2_5: hourlySeries,
      pm10: hourlySeries,
      nitrogen_dioxide: hourlySeries,
      ozone: hourlySeries,
      carbon_monoxide: hourlySeries,
      sulphur_dioxide: hourlySeries,
    })
    .refine(
      (h) => HOURLY.every((key) => h[key].length === h.time.length),
      'every pollutant must have one value per hour',
    ),
});

type AirBody = z.infer<typeof airBodySchema>;

/** Where a recording came from, so a reader can tell it from live data and re-record it. */
export interface Provenance {
  url: string;
  /** ISO 8601 with +05:30. */
  retrievedAt: string;
  /** The day the recording stands for, when that is not the day it was fetched. */
  recordedOn?: string;
  note?: string;
}

// What toAirSeries needs besides the reply: the source label, the fetch time, an optional
// anchor instant that trims the hours around it, and the recorded day if any.
interface MapContext {
  source: AirSeries['source'];
  fetchedAt: string;
  /** When set, keep only the hours from 24 h before to 72 h after this instant. */
  anchor?: Date;
  recordedOn?: string;
}

// The sample for hour i of the reply, with a missing value as null.
function sampleAt(h: AirBody['hourly'], i: number): HourSample {
  return {
    // The slice keeps the date and hour ("2025-12-13T07") and sets the minutes to ":00".
    hour: `${(h.time[i] ?? '').slice(0, 13)}:00`,
    pm25: h.pm2_5[i] ?? null,
    pm10: h.pm10[i] ?? null,
    no2: h.nitrogen_dioxide[i] ?? null,
    o3: h.ozone[i] ?? null,
    co: h.carbon_monoxide[i] ?? null,
    so2: h.sulphur_dioxide[i] ?? null,
  };
}

// True when at least one pollutant has a number for this hour.
function hasValue(s: HourSample): boolean {
  return [s.pm25, s.pm10, s.no2, s.o3, s.co, s.so2].some((v) => v !== null);
}

/** Maps a checked reply to an AirSeries. Throws no_data when no hour carries any value. */
export function toAirSeries(body: AirBody, ctx: MapContext): AirSeries {
  let hours = body.hourly.time.map((_, i) => sampleAt(body.hourly, i));
  if (ctx.anchor) {
    // The anchor is cut to the hour in India time; hours from 24 before it to 72 after it stay.
    const nowHour = istParts(ctx.anchor).hourStamp;
    const from = addHours(nowHour, -PAST_HOURS);
    const to = addHours(nowHour, AHEAD_HOURS);
    // Stamps share one fixed-width format, so text order is time order.
    hours = hours.filter((s) => s.hour >= from && s.hour <= to);
  }
  if (!hours.some(hasValue)) throw new AppError('no_data', 'The air data had no values');
  return {
    source: ctx.source,
    // The grid point the model answered for, to two decimals, which can differ from the request.
    gridLat: Math.round(body.latitude * 100) / 100,
    gridLon: Math.round(body.longitude * 100) / 100,
    hours,
    fetchedAt: ctx.fetchedAt,
    ...(ctx.recordedOn === undefined ? {} : { recordedOn: ctx.recordedOn }),
  };
}
