// Loads the saved Open-Meteo replies in src/data/recorded and maps them to an AirSeries the same
// way a live reply is. Server layer: no network and no module-scope mutable state; the files
// are imported at build time, so no request can choose which file is read.
import { z } from 'zod';

import type { AirSeries } from '@/core/air/types';
import bengaluruIndiranagar from '@/data/recorded/bengaluru-indiranagar.json';
import delhiLajpatNagar from '@/data/recorded/delhi-lajpat-nagar.json';
import delhiSmogDay from '@/data/recorded/delhi-smog-2025-12-13.json';
import kolkataSaltLake from '@/data/recorded/kolkata-salt-lake.json';
import mumbaiAndheri from '@/data/recorded/mumbai-andheri.json';
import noida from '@/data/recorded/noida.json';
import { airBodySchema, roundCoord, toAirSeries } from '@/server/air/open-meteo-shape';
import { SMOG_DAY_ID, SNAPSHOT_TARGETS } from '@/server/air/recorded-targets';
import { AppError } from '@/server/errors';

// A recording is a live reply plus a provenance block saying where and when it was fetched.
const recordingSchema = airBodySchema.extend({
  provenance: z.object({
    url: z.string(),
    retrievedAt: z.string(),
    recordedOn: z.string().optional(),
    note: z.string().optional(),
  }),
});

// Fixed at build time, so no request can name a file: an unknown id is simply not found.
const RECORDINGS: Readonly<Record<string, unknown>> = {
  'delhi-lajpat-nagar': delhiLajpatNagar,
  'mumbai-andheri': mumbaiAndheri,
  'kolkata-salt-lake': kolkataSaltLake,
  'bengaluru-indiranagar': bengaluruIndiranagar,
  noida,
  [SMOG_DAY_ID]: delhiSmogDay,
};

/** The ids of every recording the app holds: the five sample places and the smog day. */
export const RECORDED_IDS: readonly string[] = Object.keys(RECORDINGS);

/** The snapshot id for a point, if it is one of the sample places (compared at 0.1 degree). */
export function recordedIdForPoint(lat: number, lon: number): string | undefined {
  const [la, lo] = [roundCoord(lat), roundCoord(lon)];
  return SNAPSHOT_TARGETS.find((t) => roundCoord(t.lat) === la && roundCoord(t.lon) === lo)?.id;
}

// Reads one recording and maps it to a series. Throws no_data for an unknown id and
// upstream_bad_shape when the saved file does not match the schema.
function load(id: string): AirSeries {
  // Only the table's own keys count, not inherited ones such as "constructor".
  const raw = Object.hasOwn(RECORDINGS, id) ? RECORDINGS[id] : undefined;
  if (raw === undefined) throw new AppError('no_data', `No recording named ${id}`);
  const parsed = recordingSchema.safeParse(raw);
  if (!parsed.success) throw new AppError('upstream_bad_shape', `Recording ${id} is malformed`);
  const { provenance, ...body } = parsed.data;
  return toAirSeries(body, {
    source: 'recorded',
    fetchedAt: provenance.retrievedAt,
    // The first ten characters of the fetch time are its date, for a snapshot with no recordedOn.
    recordedOn: provenance.recordedOn ?? provenance.retrievedAt.slice(0, 10),
    // A snapshot keeps the same window a live reply would have; a dated smog day keeps all its hours.
    ...(provenance.recordedOn === undefined ? { anchor: new Date(provenance.retrievedAt) } : {}),
  });
}

/** Sample-place snapshots and the recorded smog day, read exactly as a live reply is. */
export function fetchRecordedSeries(id: string): Promise<AirSeries> {
  // Always returns a promise, so a thrown AppError becomes a rejection like a live failure.
  try {
    return Promise.resolve(load(id));
  } catch (error) {
    return Promise.reject(error instanceof Error ? error : new Error(String(error)));
  }
}
