import { z } from 'zod';

import placesData from '@/data/places.json';
import { INDIA_LAT, INDIA_LON } from '@/core/profile/schema';
import { sourceRefSchema } from '@/core/source';

export const INDIA_BOUNDS = {
  minLat: INDIA_LAT.min,
  maxLat: INDIA_LAT.max,
  minLon: INDIA_LON.min,
  maxLon: INDIA_LON.max,
} as const;

export interface PlaceMatch {
  name: string;
  admin1: string;
  lat: number;
  lon: number;
  source: 'static' | 'geocoder';
}

const staticPlacesSchema = z.array(
  z.strictObject({
    name: z.string().min(1),
    admin1: z.string().min(1),
    lat: z.number(),
    lon: z.number(),
    kind: z.enum(['city', 'locality']),
    aliases: z.array(z.string()),
    retrievedOn: z.string(),
    source: sourceRefSchema,
  }),
);

export const STATIC_PLACES = staticPlacesSchema.parse(placesData);

// A device fix is named after the nearest listed place only when it is plausibly the same place:
// a city within a metro's reach, or a locality within a few streets. Otherwise the caller
// shows coordinates, rather than naming a place the family is not in.
const CITY_RADIUS_KM = 60;
const LOCALITY_RADIUS_KM = 3;

/** Lower case, accents and punctuation removed, single spaces: the key names are compared by. */
export function foldName(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

function toMatch(place: (typeof STATIC_PLACES)[number]): PlaceMatch {
  return {
    name: place.name,
    admin1: place.admin1,
    lat: place.lat,
    lon: place.lon,
    source: 'static',
  };
}

/** Exact match on a listed name or alias. "Lajpat Nagar, Delhi" also matches on the part before the comma. */
export function findStaticPlace(query: string): PlaceMatch | undefined {
  const keys = [query, query.split(',')[0] ?? ''].map(foldName).filter((key) => key !== '');
  for (const key of keys) {
    const hit = STATIC_PLACES.find((p) => [p.name, ...p.aliases].some((n) => foldName(n) === key));
    if (hit) return toMatch(hit);
  }
  return undefined;
}

function distanceKm(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const rad = Math.PI / 180;
  const dLat = (bLat - aLat) * rad;
  const dLon = (bLon - aLon) * rad;
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(aLat * rad) * Math.cos(bLat * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

/** The listed place a device location most likely means, or null when none is close enough. */
export function nearestStaticPlace(lat: number, lon: number): PlaceMatch | null {
  let best: { place: (typeof STATIC_PLACES)[number]; km: number } | undefined;
  for (const place of STATIC_PLACES) {
    const km = distanceKm(lat, lon, place.lat, place.lon);
    const limit = place.kind === 'city' ? CITY_RADIUS_KM : LOCALITY_RADIUS_KM;
    if (km <= limit && (best === undefined || km < best.km)) best = { place, km };
  }
  return best ? toMatch(best.place) : null;
}
