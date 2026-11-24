import 'server-only';

import { z } from 'zod';

import type { StationReading } from '@/core/air/types';
import { istIso, roundCoord } from '@/server/air/open-meteo-shape';

// OpenAQ v3 is read with a key in a header and nothing else. A failure of any kind means "no
// station": the page is already complete without one, so nothing here may make it slower or
// turn it into an error.

const BASE = 'https://api.openaq.org/v3';
const TIMEOUT_MS = 2000;
const SEARCH_RADIUS_M = 15_000;
// Results come back unsorted and cut at the limit, so a small limit can drop the nearest one.
const SEARCH_LIMIT = 100;
const LOCATIONS_REVALIDATE_SECONDS = 3 * 60 * 60;
const LATEST_REVALIDATE_SECONDS = 15 * 60;
/** CPCB data trails the clock by two to three hours, so a reading a little under four hours old still counts. */
const FRESH_MS = 4 * 60 * 60 * 1000;
/** A clock a few minutes ahead of ours is tolerated; further ahead is a broken timestamp. */
const FUTURE_SLACK_MS = 10 * 60 * 1000;
/** No real ambient PM reading is below zero or above this, in micrograms per cubic metre. */
const MAX_PLAUSIBLE = 2000;
const EARTH_RADIUS_KM = 6371;

const sensorSchema = z.object({
  id: z.number(),
  parameter: z.object({ name: z.string() }),
});

const locationSchema = z.object({
  id: z.number(),
  name: z.string().min(1),
  distance: z.number().nullish(),
  coordinates: z.object({ latitude: z.number(), longitude: z.number() }).nullish(),
  isMobile: z.boolean().nullish(),
  isMonitor: z.boolean().nullish(),
  datetimeLast: z.object({ utc: z.string() }).nullish(),
  sensors: z.array(sensorSchema).default([]),
});

const locationsBodySchema = z.object({ results: z.array(locationSchema) });

const latestBodySchema = z.object({
  results: z.array(
    z.object({
      sensorsId: z.number(),
      value: z.number().nullish(),
      datetime: z.object({ utc: z.string() }),
    }),
  ),
});

export type OpenAqLocation = z.infer<typeof locationSchema>;
export type OpenAqLatest = z.infer<typeof latestBodySchema>['results'][number];

export interface StationOptions {
  /** The clock, injectable so a test can fix the time. */
  now?: () => Date;
  signal?: AbortSignal;
}

function haversineKm(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const rad = (degrees: number): number => (degrees * Math.PI) / 180;
  const h =
    Math.sin(rad(bLat - aLat) / 2) ** 2 +
    Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(rad(bLon - aLon) / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h));
}

/** True when the timestamp is recent enough to describe the air now, judged against the given clock. */
export function isFresh(utc: string, now: Date): boolean {
  const at = Date.parse(utc);
  if (Number.isNaN(at)) return false;
  const age = now.getTime() - at;
  return age <= FRESH_MS && age >= -FUTURE_SLACK_MS;
}

function sensorIds(location: OpenAqLocation, parameter: 'pm25' | 'pm10'): number[] {
  return location.sensors.filter((s) => s.parameter.name === parameter).map((s) => s.id);
}

function kmFrom(lat: number, lon: number, location: OpenAqLocation): number | null {
  if (location.coordinates) {
    return haversineKm(lat, lon, location.coordinates.latitude, location.coordinates.longitude);
  }
  // The search measures from the rounded point; better than dropping a station with no coordinates.
  return typeof location.distance === 'number' ? location.distance / 1000 : null;
}

/**
 * The nearest fixed monitoring station that reported recently and measures PM2.5, or null.
 * Many listed stations stopped years ago, and results arrive in no particular order.
 */
export function chooseLocation(
  locations: readonly OpenAqLocation[],
  lat: number,
  lon: number,
  now: Date,
): { location: OpenAqLocation; distanceKm: number } | null {
  let best: { location: OpenAqLocation; distanceKm: number } | null = null;
  for (const location of locations) {
    if (location.isMonitor !== true || location.isMobile === true) continue;
    if (sensorIds(location, 'pm25').length === 0) continue;
    if (!location.datetimeLast || !isFresh(location.datetimeLast.utc, now)) continue;
    const distanceKm = kmFrom(lat, lon, location);
    if (distanceKm === null) continue;
    if (best === null || distanceKm < best.distanceKm) best = { location, distanceKm };
  }
  return best;
}

interface Pick {
  value: number;
  at: string;
}

/**
 * The newest plausible reading from this location's own sensors for one pollutant. The latest
 * list mixes live sensors with ones that stopped years ago, so each value is checked for both.
 */
function newest(readings: readonly OpenAqLatest[], ids: readonly number[], now: Date): Pick | null {
  let best: (Pick & { time: number }) | null = null;
  for (const reading of readings) {
    const { value } = reading;
    if (!ids.includes(reading.sensorsId) || typeof value !== 'number') continue;
    if (!Number.isFinite(value) || value < 0 || value > MAX_PLAUSIBLE) continue;
    if (!isFresh(reading.datetime.utc, now)) continue;
    const time = Date.parse(reading.datetime.utc);
    if (best === null || time > best.time) best = { value, at: reading.datetime.utc, time };
  }
  return best === null ? null : { value: best.value, at: best.at };
}

/** Builds the reading for a chosen location, or null when it has no fresh PM2.5. */
export function toStation(
  location: OpenAqLocation,
  distanceKm: number,
  readings: readonly OpenAqLatest[],
  now: Date,
): StationReading | null {
  const pm25 = newest(readings, sensorIds(location, 'pm25'), now);
  if (pm25 === null) return null;
  const pm10 = newest(readings, sensorIds(location, 'pm10'), now);
  return {
    provider: 'openaq',
    name: location.name,
    distanceKm: Math.round(distanceKm * 10) / 10,
    pm25: pm25.value,
    pm10: pm10?.value ?? null,
    measuredAt: istIso(new Date(pm25.at)),
  };
}

export function locationsUrl(lat: number, lon: number): string {
  const point = `${roundCoord(lat).toFixed(1)},${roundCoord(lon).toFixed(1)}`;
  return `${BASE}/locations?coordinates=${point}&radius=${String(SEARCH_RADIUS_M)}&limit=${String(SEARCH_LIMIT)}`;
}

async function getJson(
  url: string,
  apiKey: string,
  revalidate: number,
  signal: AbortSignal,
): Promise<unknown> {
  const response = await fetch(url, {
    headers: { 'X-API-Key': apiKey },
    next: { revalidate },
    signal,
  });
  // Only the status is reported; the request, which carries the key, never appears in a message.
  if (!response.ok) throw new Error(`OpenAQ answered HTTP ${String(response.status)}`);
  return (await response.json()) as unknown;
}

/**
 * The nearest recent station reading for a point, or undefined. With no key it makes no call.
 * Any failure (timeout, 401, 429, odd shape) also gives undefined, because the station is a
 * bonus on top of the model data and never a reason for a slower or broken page.
 */
export async function fetchStation(
  lat: number,
  lon: number,
  apiKey: string | undefined,
  opts: StationOptions = {},
): Promise<StationReading | undefined> {
  if (!apiKey) return undefined;
  try {
    const timeout = AbortSignal.timeout(TIMEOUT_MS);
    const signal = opts.signal ? AbortSignal.any([opts.signal, timeout]) : timeout;
    const now = (opts.now ?? (() => new Date()))();

    const locations = locationsBodySchema.parse(
      await getJson(locationsUrl(lat, lon), apiKey, LOCATIONS_REVALIDATE_SECONDS, signal),
    );
    const chosen = chooseLocation(locations.results, lat, lon, now);
    if (chosen === null) return undefined;

    const latest = latestBodySchema.parse(
      await getJson(
        `${BASE}/locations/${String(chosen.location.id)}/latest`,
        apiKey,
        LATEST_REVALIDATE_SECONDS,
        signal,
      ),
    );
    return toStation(chosen.location, chosen.distanceKm, latest.results, now) ?? undefined;
  } catch {
    return undefined;
  }
}
