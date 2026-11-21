import { z } from 'zod';

import type { AirSeries, HourSample } from '@/core/air/types';
import { addHours, istParts } from '@/core/time';
import { AppError } from '@/server/errors';

// This file holds everything about the Open-Meteo response that needs no network: the request URL,
// the shape check and the mapping to an AirSeries. The fetching adapter, the recorded-fixture
// loader and the recording script all share it, so a recording is read exactly as a live reply is.

export const AIR_QUALITY_ENDPOINT = 'https://air-quality-api.open-meteo.com/v1/air-quality';
const HOURLY = [
  'pm2_5',
  'pm10',
  'nitrogen_dioxide',
  'ozone',
  'carbon_monoxide',
  'sulphur_dioxide',
] as const;

const PAST_HOURS = 24;
const AHEAD_HOURS = 72;

/** One decimal degree, about 11 km: finer than the 45 km model grid, and never pins down a home. */
export function roundCoord(value: number): number {
  return Math.round(value * 10) / 10;
}

export interface DateWindow {
  startDate: string;
  endDate: string;
}

/** The request for one place. With a window it asks for a past range instead of the live forecast. */
export function airUrl(lat: number, lon: number, window?: DateWindow): string {
  const range = window
    ? `start_date=${window.startDate}&end_date=${window.endDate}`
    : 'past_days=1&forecast_days=4';
  return (
    `${AIR_QUALITY_ENDPOINT}?latitude=${String(roundCoord(lat))}&longitude=${String(roundCoord(lon))}` +
    `&hourly=${HOURLY.join(',')}&${range}&timezone=Asia%2FKolkata`
  );
}

export { istIso } from '@/core/time';

const hourlySeries = z.array(z.number().nullable());

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

export type AirBody = z.infer<typeof airBodySchema>;

/** Where a recording came from, so a reader can tell it from live data and re-record it. */
export interface Provenance {
  url: string;
  /** ISO 8601 with +05:30. */
  retrievedAt: string;
  /** The day the recording stands for, when that is not the day it was fetched. */
  recordedOn?: string;
  note?: string;
}

export interface MapContext {
  source: AirSeries['source'];
  fetchedAt: string;
  /** When set, keep only the hours from 24 h before to 72 h after this instant. */
  anchor?: Date;
  recordedOn?: string;
}

function sampleAt(h: AirBody['hourly'], i: number): HourSample {
  return {
    hour: `${(h.time[i] ?? '').slice(0, 13)}:00`,
    pm25: h.pm2_5[i] ?? null,
    pm10: h.pm10[i] ?? null,
    no2: h.nitrogen_dioxide[i] ?? null,
    o3: h.ozone[i] ?? null,
    co: h.carbon_monoxide[i] ?? null,
    so2: h.sulphur_dioxide[i] ?? null,
  };
}

function hasValue(s: HourSample): boolean {
  return [s.pm25, s.pm10, s.no2, s.o3, s.co, s.so2].some((v) => v !== null);
}

/** Maps a checked reply to an AirSeries. Throws no_data when no hour carries any value. */
export function toAirSeries(body: AirBody, ctx: MapContext): AirSeries {
  let hours = body.hourly.time.map((_, i) => sampleAt(body.hourly, i));
  if (ctx.anchor) {
    const nowHour = istParts(ctx.anchor).hourStamp;
    const from = addHours(nowHour, -PAST_HOURS);
    const to = addHours(nowHour, AHEAD_HOURS);
    // Stamps share one fixed-width format, so text order is time order.
    hours = hours.filter((s) => s.hour >= from && s.hour <= to);
  }
  if (!hours.some(hasValue)) throw new AppError('no_data', 'The air data had no values');
  return {
    source: ctx.source,
    gridLat: Math.round(body.latitude * 100) / 100,
    gridLon: Math.round(body.longitude * 100) / 100,
    hours,
    fetchedAt: ctx.fetchedAt,
    ...(ctx.recordedOn === undefined ? {} : { recordedOn: ctx.recordedOn }),
  };
}
