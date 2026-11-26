// Finds the nearest recent reading from a fixed air-quality monitor through OpenAQ v3, as an
// optional extra beside the model data. Server layer: I/O only, no module-scope mutable state.
// The key goes in a header and nowhere else, and any failure means "no station", never an error.
import 'server-only';

import { unstable_cache } from 'next/cache';
import { z } from 'zod';

import type { StationReading } from '@/core/air/types';
import { istIso, roundCoord } from '@/server/air/open-meteo-shape';

// OpenAQ v3 is read with a key in a header and nothing else. A failure of any kind means "no
// station": the page is already complete without one, so nothing here may make it slower or
// turn it into an error.

const BASE = 'https://api.openaq.org/v3';
const TIMEOUT_MS = 2000;
/** A monitor farther than this from the household's own point is a different part of the city. */
export const MAX_STATION_KM = 10;
// The search is centred on the point rounded to 0.1 degree, which can sit about 8 km from the true
// point, so the search reaches that much past the cap and nothing inside the cap is missed.
const SEARCH_RADIUS_M = 18_000;
/** After a failed lookup (a rate limit, a timeout) the same place is not asked again for this long. */
const FAILURE_PAUSE_SECONDS = 60;
// Results come back unsorted and cut at the limit, so a small limit can drop the nearest one.
const SEARCH_LIMIT = 100;
// How many of the nearest stations are read, so one with a stopped PM2.5 sensor does not hide the rest.
const CANDIDATES = 3;
// The monitor list is kept in the framework cache for 3 hours, latest values for 15 minutes.
const LOCATIONS_REVALIDATE_SECONDS = 3 * 60 * 60;
const LATEST_REVALIDATE_SECONDS = 15 * 60;
/** CPCB data trails the clock by two to three hours, so a reading a little under four hours old still counts. */
const FRESH_MS = 4 * 60 * 60 * 1000;
/** A clock a few minutes ahead of ours is tolerated; further ahead is a broken timestamp. */
const FUTURE_SLACK_MS = 10 * 60 * 1000;
/** No real ambient PM reading is below zero or above this, in micrograms per cubic metre. */
const MAX_PLAUSIBLE = 2000;
// Mean radius of the Earth, used for the distance between two points.
const EARTH_RADIUS_KM = 6371;

// The parts of an OpenAQ reply that are read. Fields the API may leave out or set to null are
// optional here, so an odd monitor is skipped later instead of failing the whole reply.
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

/** One monitoring location in an OpenAQ locations reply. */
export type OpenAqLocation = z.infer<typeof locationSchema>;
/** One latest value from one sensor in an OpenAQ latest reply. */
export type OpenAqLatest = z.infer<typeof latestBodySchema>['results'][number];

/** The options for a station lookup; all are for tests or for cancelling a request. */
export interface StationOptions {
  /** The clock, injectable so a test can fix the time. */
  now?: () => Date;
  signal?: AbortSignal;
  /** Remembers the outcome of a lookup for a short time; injectable so a test can see it. */
  remember?: Remember;
}

/** Runs `produce` once per key and reuses its outcome for a short time. */
export type Remember = <T>(key: string[], produce: () => Promise<T>) => Promise<T>;

/**
 * The framework's data cache for one minute, so a failed lookup is not repeated on every page
 * view, and one lookup stands in for the several views of a place within the minute. Outside the
 * framework (a script, a test) it is not there, and the lookup simply runs; `produce` never throws.
 */
const rememberBriefly: Remember = async (key, produce) => {
  try {
    return await unstable_cache(produce, key, { revalidate: FAILURE_PAUSE_SECONDS })();
  } catch {
    return produce();
  }
};

// The great-circle distance in kilometres between two points (haversine formula).
function haversineKm(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const rad = (degrees: number): number => (degrees * Math.PI) / 180;
  const h =
    Math.sin(rad(bLat - aLat) / 2) ** 2 +
    Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(rad(bLon - aLon) / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h));
}

/** True when the timestamp is recent enough to describe the air now, assessed against the given clock. */
export function isFresh(utc: string, now: Date): boolean {
  const at = Date.parse(utc);
  // An unreadable timestamp is not fresh.
  if (Number.isNaN(at)) return false;
  const age = now.getTime() - at;
  return age <= FRESH_MS && age >= -FUTURE_SLACK_MS;
}

// The ids of this location's sensors that measure the given pollutant.
function sensorIds(location: OpenAqLocation, parameter: 'pm25' | 'pm10'): number[] {
  return location.sensors.filter((s) => s.parameter.name === parameter).map((s) => s.id);
}

// Kilometres from the household's point to a location, or null when it cannot be told.
function kmFrom(lat: number, lon: number, location: OpenAqLocation): number | null {
  if (location.coordinates) {
    return haversineKm(lat, lon, location.coordinates.latitude, location.coordinates.longitude);
  }
  // The search measures from the rounded point; better than dropping a station with no coordinates.
  // OpenAQ gives that distance in metres.
  return typeof location.distance === 'number' ? location.distance / 1000 : null;
}

/**
 * Fixed monitoring stations that reported recently and measure PM2.5, nearest first. Many listed
 * stations stopped years ago, and results arrive in no particular order.
 */
export function rankLocations(
  locations: readonly OpenAqLocation[],
  lat: number,
  lon: number,
  now: Date,
): { location: OpenAqLocation; distanceKm: number }[] {
  const ranked: { location: OpenAqLocation; distanceKm: number }[] = [];
  for (const location of locations) {
    // Only fixed monitors count: a listing must be marked as a monitor and not as mobile.
    if (location.isMonitor !== true || location.isMobile === true) continue;
    if (sensorIds(location, 'pm25').length === 0) continue;
    if (!location.datetimeLast || !isFresh(location.datetimeLast.utc, now)) continue;
    const distanceKm = kmFrom(lat, lon, location);
    if (distanceKm === null || distanceKm > MAX_STATION_KM) continue;
    ranked.push({ location, distanceKm });
  }
  return ranked.sort((a, b) => a.distanceKm - b.distanceKm);
}

// A chosen reading: its value in micrograms per cubic metre and its UTC timestamp.
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
    // Only this location's own sensors, and only a real number in the plausible range.
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
  // PM10 is an extra: without a fresh PM2.5 there is no reading, without PM10 it is null.
  if (pm25 === null) return null;
  const pm10 = newest(readings, sensorIds(location, 'pm10'), now);
  return {
    provider: 'openaq',
    name: location.name,
    // Distance to one decimal place, in kilometres.
    distanceKm: Math.round(distanceKm * 10) / 10,
    pm25: pm25.value,
    pm10: pm10?.value ?? null,
    // The time of the PM2.5 value, written in India time.
    measuredAt: istIso(new Date(pm25.at)),
  };
}

/** The search request for monitors around a point: the point rounded to 0.1 degree, as "lat,lon". */
export function locationsUrl(lat: number, lon: number): string {
  const point = `${roundCoord(lat).toFixed(1)},${roundCoord(lon).toFixed(1)}`;
  return `${BASE}/locations?coordinates=${point}&radius=${String(SEARCH_RADIUS_M)}&limit=${String(SEARCH_LIMIT)}`;
}

// One authenticated GET that returns the parsed JSON, kept in the framework cache for the
// given seconds. Throws on a non-2xx status.
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

// The full lookup: list monitors, read the nearest few, return the nearest with fresh PM2.5.
// It never throws; every failure gives null.
async function lookUp(
  lat: number,
  lon: number,
  apiKey: string,
  opts: StationOptions,
): Promise<StationReading | null> {
  try {
    // One 2 second timeout covers the list request and all the latest requests together.
    const timeout = AbortSignal.timeout(TIMEOUT_MS);
    const signal = opts.signal ? AbortSignal.any([opts.signal, timeout]) : timeout;
    const now = (opts.now ?? (() => new Date()))();

    const locations = locationsBodySchema.parse(
      await getJson(locationsUrl(lat, lon), apiKey, LOCATIONS_REVALIDATE_SECONDS, signal),
    );
    // A station can report recently while its PM2.5 sensor has stopped, so the nearest few are
    // read together and the nearest one with a fresh PM2.5 value wins.
    const candidates = rankLocations(locations.results, lat, lon, now).slice(0, CANDIDATES);
    const readings = await Promise.all(
      candidates.map(async ({ location, distanceKm }) => {
        try {
          const latest = latestBodySchema.parse(
            await getJson(
              `${BASE}/locations/${String(location.id)}/latest`,
              apiKey,
              LATEST_REVALIDATE_SECONDS,
              signal,
            ),
          );
          return toStation(location, distanceKm, latest.results, now);
        } catch {
          // One station failing leaves the others in play.
          return null;
        }
      }),
    );
    // The candidates are in nearest-first order, so the first non-null reading is the nearest.
    return readings.find((reading) => reading !== null) ?? null;
  } catch {
    return null;
  }
}

/**
 * The nearest recent station reading for a point, or undefined. With no key it makes no call.
 * Any failure (timeout, 401, 429, odd shape) also gives undefined, because the station is a
 * bonus on top of the model data and never a reason for a slower or broken page. The outcome,
 * a failure included, is remembered for a minute per place, so a rate limit is not hit again by
 * every page view.
 */
export async function fetchStation(
  lat: number,
  lon: number,
  apiKey: string | undefined,
  opts: StationOptions = {},
): Promise<StationReading | undefined> {
  if (!apiKey) return undefined;
  // The cache key is the search URL, which holds the rounded point and not the API key.
  const key = ['saans-openaq-station', locationsUrl(lat, lon)];
  const found = await (opts.remember ?? rememberBriefly)(key, () => lookUp(lat, lon, apiKey, opts));
  return found ?? undefined;
}
