import 'server-only';

import { z } from 'zod';

import { AppError } from '@/server/errors';
import {
  findStaticPlace,
  foldName,
  INDIA_BOUNDS,
  nearestStaticPlace,
  type PlaceMatch,
} from '@/server/geo/places';

export { INDIA_BOUNDS, nearestStaticPlace, type PlaceMatch };

export type Resolution =
  { kind: 'one'; place: PlaceMatch } | { kind: 'many'; options: PlaceMatch[] } | { kind: 'none' };

const ENDPOINT = 'https://geocoding-api.open-meteo.com/v1/search';
const TIMEOUT_MS = 3000;
const REVALIDATE_SECONDS = 86_400;
const MAX_QUERY_LENGTH = 80;
const MAX_OPTIONS = 5;

// Towns, villages and city sections. Historical, abandoned and destroyed places (PPLH, PPLQ,
// PPLW), airports and other features are not somewhere a family lives.
const POPULATED_PLACE = /^PPL(?:[ACGLRSFX]\d?)?$/;

const NAME_FOR_ADMIN1: Readonly<Record<string, string>> = {
  'National Capital Territory of Delhi': 'Delhi',
};

const resultSchema = z.object({
  name: z.string().min(1),
  latitude: z.number(),
  longitude: z.number(),
  feature_code: z.string(),
  admin1: z.string().min(1),
  country_code: z.string().optional(),
});
const bodySchema = z.object({ results: z.array(z.unknown()).optional() });

function inIndia(lat: number, lon: number): boolean {
  return (
    lat >= INDIA_BOUNDS.minLat &&
    lat <= INDIA_BOUNDS.maxLat &&
    lon >= INDIA_BOUNDS.minLon &&
    lon <= INDIA_BOUNDS.maxLon
  );
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Turns a geocoder reply into a decision. Rows that are not populated places, are outside India
 * or lack a state are dropped. When the best name also belongs to a place in another state, the
 * family has to choose: air can differ a lot between them, so the app never guesses.
 * The service lists larger places first, and that order is kept.
 */
export function interpretGeocoderBody(body: unknown): Resolution {
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success)
    throw new AppError('upstream_bad_shape', 'Geocoder reply has an unexpected shape');

  const places: { key: string; match: PlaceMatch }[] = [];
  for (const raw of parsed.data.results ?? []) {
    const row = resultSchema.safeParse(raw);
    if (!row.success) continue;
    const r = row.data;
    const keep =
      POPULATED_PLACE.test(r.feature_code) &&
      (r.country_code === undefined || r.country_code === 'IN') &&
      inIndia(r.latitude, r.longitude);
    if (!keep) continue;
    places.push({
      key: foldName(r.name),
      match: {
        name: r.name,
        admin1: NAME_FOR_ADMIN1[r.admin1] ?? r.admin1,
        lat: round2(r.latitude),
        lon: round2(r.longitude),
        source: 'geocoder',
      },
    });
  }

  const best = places[0];
  if (!best) return { kind: 'none' };

  // Same name, spelled with or without accents; one entry per state is enough to choose from.
  const options: PlaceMatch[] = [];
  for (const { key, match } of places) {
    if (key === best.key && !options.some((o) => o.admin1 === match.admin1)) options.push(match);
  }
  return options.length > 1
    ? { kind: 'many', options: options.slice(0, MAX_OPTIONS) }
    : { kind: 'one', place: best.match };
}

function geocoderUrl(query: string): string {
  return `${ENDPOINT}?name=${encodeURIComponent(query)}&count=5&language=en&format=json&countryCode=IN`;
}

async function search(query: string): Promise<unknown> {
  // Failures say what went wrong but never repeat what the person typed.
  let response: Response;
  try {
    response = await fetch(geocoderUrl(query), {
      next: { revalidate: REVALIDATE_SECONDS },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (error) {
    const timedOut = error instanceof Error && ['TimeoutError', 'AbortError'].includes(error.name);
    throw new AppError(
      timedOut ? 'upstream_timeout' : 'upstream_unavailable',
      'The place search could not be reached',
      { cause: error },
    );
  }
  if (!response.ok) {
    throw new AppError(
      'upstream_unavailable',
      `Place search answered HTTP ${String(response.status)}`,
    );
  }
  try {
    return (await response.json()) as unknown;
  } catch (error) {
    throw new AppError('upstream_bad_shape', 'Place search sent a body that is not JSON', {
      cause: error,
    });
  }
}

/**
 * Finds a place from what a person typed: the listed places first, then the geocoder, India only.
 * Throws an AppError when the geocoder cannot be reached; a clean miss is {kind: 'none'}.
 */
export async function resolvePlace(query: string): Promise<Resolution> {
  const text = query.trim();
  if (foldName(text) === '' || text.length > MAX_QUERY_LENGTH) return { kind: 'none' };

  const listed = findStaticPlace(text);
  if (listed) return { kind: 'one', place: listed };

  return interpretGeocoderBody(await search(text));
}
