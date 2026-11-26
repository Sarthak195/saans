// Turns what a family typed, or a rounded device location, into a place in India. Listed places
// (src/data/places.json) answer first and need no network; anything else goes to the Open-Meteo
// geocoder. When a name fits places in several states, the family chooses: the app never guesses.
import 'server-only';

import { z } from 'zod';

import { AppError } from '@/server/errors';
import {
  findStaticPlace,
  foldName,
  INDIA_BOUNDS,
  isInIndia,
  listedPlacesIn,
  nearestStaticPlace,
  toPlace,
  type PlaceMatch,
} from '@/server/geo/places';

export { INDIA_BOUNDS, isInIndia, nearestStaticPlace, toPlace, type PlaceMatch };

/** One place, several places that share a name (the family picks), or nothing found. */
export type Resolution =
  { kind: 'one'; place: PlaceMatch } | { kind: 'many'; options: PlaceMatch[] } | { kind: 'none' };

// The Open-Meteo geocoding search, the only network place lookup the app uses.
const ENDPOINT = 'https://geocoding-api.open-meteo.com/v1/search';
// How long one geocoder request may take, in milliseconds, before it counts as a timeout.
const TIMEOUT_MS = 3000;
// Typed place text longer than this many characters is not looked up. It matches the
// 80-character cap the forms put on the place field.
const MAX_QUERY_LENGTH = 80;
// The most places a family is asked to choose between.
const MAX_OPTIONS = 5;
// "Dwarka, Delhi" is looked up as "Dwarka", and the state is picked from the rows. Five rows can all
// be in other states (the recorded "Rampur" reply has five rows from three states), so ask for more.
const STATE_SEARCH_COUNT = 20;

// Towns, villages and city sections. Historical, abandoned and destroyed places (PPLH, PPLQ,
// PPLW), airports and other features are not somewhere a family lives.
const POPULATED_PLACE = /^PPL(?:[ACGLRSFX]\d?)?$/;

// The geocoder's long state name for Delhi, shown as the short "Delhi".
const NAME_FOR_ADMIN1: Readonly<Record<string, string>> = {
  'National Capital Territory of Delhi': 'Delhi',
};

// The fields of one geocoder row that the app relies on. A row missing a required one is skipped.
const resultSchema = z.object({
  name: z.string().min(1),
  latitude: z.number(),
  longitude: z.number(),
  feature_code: z.string(),
  admin1: z.string().min(1),
  country_code: z.string().optional(),
});
// A geocoder reply is an object whose `results` list may be absent when nothing matched.
const bodySchema = z.object({ results: z.array(z.unknown()).optional() });

/** Rounds to two decimals, about a kilometre. */
function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * The rows of a geocoder reply that are populated places in India with a state, in the order the
 * service gave them (larger places first). Rows of an unexpected shape are skipped one by one; a
 * reply that is not the expected object at all is an error.
 */
function populatedPlaces(body: unknown): PlaceMatch[] {
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success)
    throw new AppError('upstream_bad_shape', 'Geocoder reply has an unexpected shape');

  const places: PlaceMatch[] = [];
  for (const raw of parsed.data.results ?? []) {
    const row = resultSchema.safeParse(raw);
    if (!row.success) continue;
    const r = row.data;
    // The search is already limited to India, so the country is checked only when a row gives
    // one. The box test also drops a row whose coordinates are plainly elsewhere.
    const keep =
      POPULATED_PLACE.test(r.feature_code) &&
      (r.country_code === undefined || r.country_code === 'IN') &&
      isInIndia(r.latitude, r.longitude);
    if (!keep) continue;
    places.push({
      name: r.name,
      admin1: NAME_FOR_ADMIN1[r.admin1] ?? r.admin1,
      lat: round2(r.latitude),
      lon: round2(r.longitude),
      source: 'geocoder',
    });
  }
  return places;
}

/**
 * Turns a geocoder reply into a decision. Rows that are not populated places, are outside India
 * or lack a state are dropped. When the best name also belongs to a place in another state, the
 * family has to choose: air can differ a lot between them, so the app never guesses.
 * The service lists larger places first, and that order is kept.
 */
export function interpretGeocoderBody(body: unknown): Resolution {
  const places = populatedPlaces(body);
  const best = places[0];
  if (!best) return { kind: 'none' };

  // Same name, spelled with or without accents; one entry per state is enough to choose from.
  const key = foldName(best.name);
  const options: PlaceMatch[] = [];
  for (const match of places) {
    if (foldName(match.name) === key && !options.some((o) => o.admin1 === match.admin1)) {
      options.push(match);
    }
  }
  return options.length > 1
    ? { kind: 'many', options: options.slice(0, MAX_OPTIONS) }
    : { kind: 'one', place: best };
}

/** The request address for a name and a row count; the name is percent-encoded. */
function geocoderUrl(query: string, count: number): string {
  return `${ENDPOINT}?name=${encodeURIComponent(query)}&count=${String(count)}&language=en&format=json&countryCode=IN`;
}

/** One request to the geocoder, India only, with a short timeout. Throws a classified AppError. */
async function search(query: string, count: number): Promise<unknown> {
  // Failures say what went wrong but never repeat what the person typed.
  let response: Response;
  try {
    response = await fetch(geocoderUrl(query, count), {
      // Typed queries are never repeated by anyone else; keeping each one would only fill the cache.
      cache: 'no-store',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (error) {
    // AbortSignal.timeout rejects with a TimeoutError; an AbortError is read the same way.
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

/** One listed place named in the text, a choice when it names several, or none. */
function namedIn(text: string): Resolution {
  const [first, ...others] = listedPlacesIn(text);
  if (first === undefined) return { kind: 'none' };
  return others.length === 0
    ? { kind: 'one', place: first }
    : { kind: 'many', options: [first, ...others].slice(0, MAX_OPTIONS) };
}

/** The place called `name` in a state written after the comma ("Dwarka, Delhi"), if there is one. */
async function inStateNamed(name: string, after: string): Promise<PlaceMatch | undefined> {
  if (foldName(name) === '') return undefined;
  // "Dwarka, Delhi, India" has several parts after the first comma; any of them may be the state.
  const states = new Set(after.split(',').map(foldName));
  const rows = populatedPlaces(await search(name, STATE_SEARCH_COUNT));
  return rows.find((row) => states.has(foldName(row.admin1)));
}

/**
 * Finds a place from what a person typed: the listed places first, then the geocoder, India only.
 * The geocoder matches names, not addresses, so text with a comma is read as a name and then a
 * larger place: "Dwarka, Delhi" is the Dwarka in Delhi, and "Sector 62, Noida" falls back to
 * Noida. A listed place named inside an address the geocoder does not know ("Noida Sector 62")
 * is used last. Throws an AppError when the geocoder cannot be reached; a clean miss is
 * {kind: 'none'}.
 */
export async function resolvePlace(query: string): Promise<Resolution> {
  return resolveText(query, true);
}

/**
 * resolvePlace's work. Only the first comma splits the text: the part after it is looked up once
 * as a plain name, so one query makes at most two place searches however many commas it has.
 */
async function resolveText(query: string, splitAtComma: boolean): Promise<Resolution> {
  const text = query.trim();
  // Text with no letters or digits, or over-long text, is a clean miss, with no lookup.
  if (foldName(text) === '' || text.length > MAX_QUERY_LENGTH) return { kind: 'none' };

  // A listed place answers first and needs no network.
  const listed = findStaticPlace(text);
  if (listed) return { kind: 'one', place: listed };

  const comma = splitAtComma ? text.indexOf(',') : -1;
  const name = comma === -1 ? text : text.slice(0, comma);
  const after = comma === -1 ? '' : text.slice(comma + 1);
  // No comma, or nothing after it ("Rampur,"): the text is just a name.
  if (foldName(after) === '') {
    const found = interpretGeocoderBody(await search(name, MAX_OPTIONS));
    return found.kind === 'none' ? namedIn(name) : found;
  }

  // Text with a comma: first try the name inside the state written after the comma.
  const inState = await inStateNamed(name, after);
  if (inState) return { kind: 'one', place: inState };
  // The part after the comma is usually the town or city the place is in.
  const larger = await resolveText(after, false);
  return larger.kind === 'none' ? namedIn(name) : larger;
}

/** The name a household gets for a device location that no listed place is close enough to name. */
export const DEVICE_PLACE_NAME = 'Your location';

/** The place fields of a form as sent: typed text, and a device location rounded in the browser. */
export interface PlaceInput {
  typed: string;
  lat: string;
  lon: string;
}

/**
 * What a form says about where the family is: a place, several to choose from, nothing found for
 * the typed text ('none'), a device location outside India, a place search that could not be
 * reached, or nothing given at all.
 */
export type GivenPlace =
  Resolution | { kind: 'outside_india' } | { kind: 'unreachable' } | { kind: 'not_given' };

/**
 * Reads the place fields of a form. Typed text wins over a device location, as the pages promise.
 * A device location is named after the nearest listed place when one is close enough, and is
 * otherwise kept as "Your location" with its rounded coordinates.
 */
export async function placeFromInput(input: PlaceInput): Promise<GivenPlace> {
  if (input.typed !== '') {
    try {
      return await resolvePlace(input.typed);
    } catch (error) {
      // A place search that is down is not the family's mistake: they are told so, not that
      // their place does not exist.
      if (error instanceof AppError) return { kind: 'unreachable' };
      throw error;
    }
  }
  // No typed text: fall back to the device location, which the browser already rounded.
  if (input.lat === '' || input.lon === '') return { kind: 'not_given' };
  const lat = Number(input.lat);
  const lon = Number(input.lon);
  // NaN fails every comparison, so text that is not a number reads as outside India.
  if (!isInIndia(lat, lon)) return { kind: 'outside_india' };
  return {
    kind: 'one',
    // A listed place near the fix names it; otherwise the coordinates are kept as they came.
    place: nearestStaticPlace(lat, lon) ?? {
      name: DEVICE_PLACE_NAME,
      admin1: 'India',
      lat,
      lon,
      source: 'geocoder',
    },
  };
}
