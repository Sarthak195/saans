// The listed places (src/data/places.json) and the ways to find one: by name, by a name inside an
// address, or by the nearest one to a device location. Server layer, with no network and no
// module-scope state that changes: the list is read and checked once, when the module loads.
import { z } from 'zod';

import placesData from '@/data/places.json';
import { oneDecimal } from '@/core/format';
import { INDIA_LAT, INDIA_LON } from '@/core/profile/schema';
import { sourceRefSchema } from '@/core/source';
import type { Place } from '@/core/types';

/**
 * The box around India, in degrees of latitude and longitude, shared with the household schema.
 * The geocoder rows and device locations the app takes are checked against it.
 */
export const INDIA_BOUNDS = {
  minLat: INDIA_LAT.min,
  maxLat: INDIA_LAT.max,
  minLon: INDIA_LON.min,
  maxLon: INDIA_LON.max,
} as const;

/**
 * A place found for a family: its name, its state, and its position in degrees. `source` says
 * whether it came from the listed places ('static') or the geocoder ('geocoder').
 */
export interface PlaceMatch {
  name: string;
  admin1: string;
  lat: number;
  lon: number;
  source: 'static' | 'geocoder';
}

// The shape of one row of src/data/places.json. Strict, so an unexpected field fails at load.
// `kind` decides how close a device location must be to take the place's name.
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

/** The listed places, checked against their schema once when the module loads. */
export const STATIC_PLACES = staticPlacesSchema.parse(placesData);

// A device fix is named after the nearest listed place only when it is plausibly the same place:
// a city within a metro's reach, or a locality within a few streets. Otherwise the caller
// shows coordinates, rather than naming a place the family is not in.
const CITY_RADIUS_KM = 60;
const LOCALITY_RADIUS_KM = 3;

/** Lower case, accents and punctuation removed, single spaces: the key names are compared by. */
export function foldName(text: string): string {
  // Steps in order: split accented letters into letter plus mark (NFKD), drop the marks so a name
  // typed with or without accents compares equal, lower-case, turn any run of characters that
  // are not letters or digits (in any script) into one space ("Lajpat-Nagar" and "lajpat nagar"
  // fold alike), then trim.
  return text
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

/** A listed place as a PlaceMatch, without the fields that only the data file keeps. */
function toMatch(place: (typeof STATIC_PLACES)[number]): PlaceMatch {
  return {
    name: place.name,
    admin1: place.admin1,
    lat: place.lat,
    lon: place.lon,
    source: 'static',
  };
}

/**
 * Exact match on a listed name or alias. "Lajpat Nagar, Delhi" also matches on the part before the
 * comma. A listed place wins over the geocoder, because its position is checked by hand.
 */
export function findStaticPlace(query: string): PlaceMatch | undefined {
  // The whole text is tried first, then the part before the first comma.
  const keys = [query, query.split(',')[0] ?? ''].map(foldName).filter((key) => key !== '');
  for (const key of keys) {
    const hit = STATIC_PLACES.find((p) => [p.name, ...p.aliases].some((n) => foldName(n) === key));
    if (hit) return toMatch(hit);
  }
  return undefined;
}

/**
 * The listed places named anywhere in a typed place, in the order they appear, for an address the
 * geocoder does not know ("Noida Sector 62" names Noida). Names match as whole words, and a name
 * inside a longer one ("Delhi" inside "New Delhi") does not count, so each spot gives one place.
 */
export function listedPlacesIn(text: string): PlaceMatch[] {
  // Folding turns punctuation into single spaces, so padding with spaces makes " name " a
  // whole-word test that also works at the start and the end of the text.
  const folded = ` ${foldName(text)} `;
  // A match is a span of the folded text: `from` is its first character, `to` is just past it.
  const spans: { place: (typeof STATIC_PLACES)[number]; from: number; to: number }[] = [];
  for (const place of STATIC_PLACES) {
    for (const name of [place.name, ...place.aliases]) {
      const key = foldName(name);
      const at = key === '' ? -1 : folded.indexOf(` ${key} `);
      if (at !== -1) spans.push({ place, from: at + 1, to: at + 1 + key.length });
    }
  }
  // Longest names claim their words first, so "New Delhi" wins over the "Delhi" inside it.
  spans.sort((a, b) => b.to - b.from - (a.to - a.from));
  // A span is dropped when it overlaps one already kept; the rest are put back in reading order.
  const kept: typeof spans = [];
  for (const span of spans) {
    if (!kept.some((k) => span.from < k.to && k.from < span.to)) kept.push(span);
  }
  kept.sort((a, b) => a.from - b.from);
  // A place written twice, or by its name and an alias, is still one place.
  return [...new Set(kept.map((k) => k.place))].map(toMatch);
}

/** Great-circle distance in km between two points, by the haversine formula. */
function distanceKm(aLat: number, aLon: number, bLat: number, bLon: number): number {
  // Degrees to radians.
  const rad = Math.PI / 180;
  const dLat = (bLat - aLat) * rad;
  const dLon = (bLon - aLon) * rad;
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(aLat * rad) * Math.cos(bLat * rad) * Math.sin(dLon / 2) ** 2;
  // 6371 km is the mean radius of the Earth.
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

/**
 * True when the point lies inside the latitude and longitude box the app serves (INDIA_BOUNDS).
 * The box is a rectangle, so it is wider than India's actual border.
 */
export function isInIndia(lat: number, lon: number): boolean {
  return (
    lat >= INDIA_BOUNDS.minLat &&
    lat <= INDIA_BOUNDS.maxLat &&
    lon >= INDIA_BOUNDS.minLon &&
    lon <= INDIA_BOUNDS.maxLon
  );
}

/**
 * A place as a household keeps it: name, state and position rounded to one decimal degree (about
 * 11 km). The source of the match is not kept.
 */
export function toPlace(match: Pick<PlaceMatch, 'name' | 'admin1' | 'lat' | 'lon'>): Place {
  return {
    name: match.name,
    admin1: match.admin1,
    lat: oneDecimal(match.lat),
    lon: oneDecimal(match.lon),
  };
}
