// The cities Saans lists public transport for, and the lookup from a place to its city. Layer: core
// (pure). The data is src/data/transit.json, checked once at load; every row carries a source.
import { z } from 'zod';

import { sourceRefSchema } from '@/core/source';
import transitJson from '@/data/transit.json';
import { normalizeText } from '@/core/text/normalize';
import type { Place } from '@/core/types';

// One public transport option in a city: a metro, a rail line or a bus service.
const optionSchema = z.strictObject({
  id: z.string().min(1),
  kind: z.enum(['metro', 'rail', 'bus']),
  name: z.string().min(1),
  operator: z.string().min(1),
  // Empty for the generic bus of a city Saans has no list for.
  url: z.string(),
  // When the operator's address was last checked, and the HTTP status it gave that day.
  check: z.exactOptional(z.strictObject({ on: z.iso.date(), httpStatus: z.number().int() })),
  source: sourceRefSchema,
});

// A city: the names a place may use, its state names, a centre point, a radius and its options.
const citySchema = z.strictObject({
  id: z.string().min(1),
  name: z.string().min(1),
  names: z.array(z.string().min(1)).min(1),
  admin1: z.array(z.string().min(1)),
  center: z.strictObject({ lat: z.number(), lon: z.number() }),
  radiusKm: z.number().positive(),
  options: z.array(optionSchema).min(1),
});

// The whole transit file: the listed cities, the generic entry for any other place, the sources
// behind the assumptions, the distance bands, and the alternative rules.
const transitSchema = z.strictObject({
  cities: z.array(citySchema).min(1),
  // Used for a place that matches no listed city: one generic bus entry.
  fallback: z.strictObject({
    id: z.string(),
    name: z.string(),
    options: z.array(optionSchema).min(1),
  }),
  assumptions: z.strictObject({
    weeklyKm: z.strictObject({ source: sourceRefSchema }),
    carpoolHalf: z.strictObject({ source: sourceRefSchema }),
  }),
  // A trip shorter than shortBelowKm is "short" and one longer than longAboveKm is "long", in km.
  distanceBands: z.strictObject({
    shortBelowKm: z.number().positive(),
    longAboveKm: z.number().positive(),
    source: sourceRefSchema,
  }),
  // Parsed in rules.ts, where the fact names are known.
  rules: z.array(z.unknown()),
});

/**
 * The transit data, parsed once at load: a typo in the data fails every test instead of
 * misleading a family.
 */
export const TRANSIT = transitSchema.parse(transitJson);

/** One metro, suburban rail or bus option, with the operator's name, address and source. */
export type TransitOption = z.infer<typeof optionSchema>;
/** A listed city with its centre, radius in km, the names it goes by and its transport options. */
export type City = z.infer<typeof citySchema>;

/** The Delhi NCR entry's id, used by the GRAP note, which applies to that region only. */
export const DELHI_NCR_ID = 'delhi-ncr';

// Great-circle distance in km between two points given in degrees (the haversine formula).
function haversineKm(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const rad = (deg: number): number => (deg * Math.PI) / 180;
  const h =
    Math.sin(rad(bLat - aLat) / 2) ** 2 +
    Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(rad(bLon - aLon) / 2) ** 2;
  // 6371 is the Earth's mean radius in km.
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

// True when `name` appears in `text` as whole words. Both are expected to be normalised already.
function mentions(text: string, name: string): boolean {
  // Matches the name between the start, a space or the end: "noida" in "sector 62 noida",
  // but not in "noidatown".
  return new RegExp(`(^| )${name}( |$)`).test(text);
}

// The parts of a place the city lookup needs.
type Located = Pick<Place, 'name' | 'admin1' | 'lat' | 'lon'>;

// A name that matches a city far from where the place actually is (a village that shares the
// name of a town) must not borrow that city's metro, so a name match also has to be nearby.
// "Nearby" for a name match is twice the city's own radius.
const NAME_MATCH_REACH = 2;

// Distance in km from a place to a city's centre.
function distanceKm(place: Located, city: City): number {
  return haversineKm(place.lat, place.lon, city.center.lat, city.center.lon);
}

/**
 * The city whose transport list covers a place, or null when Saans has none. A place matches by
 * the words in its name (so 'Sector 62, Noida' finds Noida), then by its state when that state is
 * one city (Delhi), and finally by distance from a city centre, because a locality such as
 * Powai or Sector 62 is often named without its city.
 */
export function cityOf(place: Located): City | null {
  const name = normalizeText(place.name);
  const admin1 = normalizeText(place.admin1);
  const reach = (city: City): boolean =>
    distanceKm(place, city) <= city.radiusKm * NAME_MATCH_REACH;
  // First choice: the place's name or state points at the city and the place is within reach.
  const byLabel = TRANSIT.cities.find(
    (city) =>
      reach(city) &&
      (city.names.some((n) => mentions(name, n)) ||
        city.admin1.some((s) => normalizeText(s) === admin1)),
  );
  if (byLabel) return byLabel;
  // Second choice: no label matched, so the place counts only if it is inside a city's own radius.
  return TRANSIT.cities.find((city) => distanceKm(place, city) <= city.radiusKm) ?? null;
}

/** What a place can use: its city's operators, or one generic bus entry when the city is not listed. */
export function transitOptionsFor(place: Located): {
  city: City | null;
  options: readonly TransitOption[];
} {
  const city = cityOf(place);
  return { city, options: city ? city.options : TRANSIT.fallback.options };
}
