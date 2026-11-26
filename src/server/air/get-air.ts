// Picks the air data for a point, applying the failure ladder: live Open-Meteo, then a dated
// recording for the sample places, then an error. Server layer: I/O only, no module-scope state.
import 'server-only';

import type { AirSeries } from '@/core/air/types';
import { fetchAirSeries, type FetchAirOptions } from '@/server/air/open-meteo';
import { fetchStation } from '@/server/air/openaq';
import { fetchRecordedSeries, recordedIdForPoint } from '@/server/air/recorded';
import { getEnv } from '@/server/env';
import { isInIndia } from '@/server/geo/places';
import { AppError } from '@/server/errors';

/** The options for getAirSeries: those of the live fetch, plus the station key and switch. */
export interface GetAirOptions extends FetchAirOptions {
  /** The OpenAQ key, injectable for tests; by default it comes from the environment. */
  openAqKey?: string;
  /**
   * Also look for a nearby monitoring station. Only today's plan reads it, so every other caller
   * leaves it off and no OpenAQ request is made for data that would be thrown away.
   */
  station?: boolean;
}

/** The key if the environment is set up and has one. A broken environment is reported elsewhere. */
function envOpenAqKey(): string | undefined {
  try {
    return getEnv().OPENAQ_API_KEY;
  } catch {
    return undefined;
  }
}

/**
 * Air data for a point: live if Open-Meteo answers; otherwise, for the sample places only, the
 * dated recording (its `source` says 'recorded' so the page can label it); otherwise an error
 * the caller turns into a plain message. A point outside India is refused, not papered over.
 * A live series also carries the nearest recent monitoring-station reading when one is found;
 * it is fetched alongside the model data, and its absence changes nothing else.
 */
export async function getAirSeries(
  lat: number,
  lon: number,
  opts: GetAirOptions = {},
): Promise<AirSeries> {
  const { openAqKey, station: wantStation = false, ...airOpts } = opts;
  // Started first so both requests run together; fetchStation never rejects, so a failed
  // series leaves nothing unhandled behind it. A point outside India is refused below, so it asks nothing.
  const station =
    wantStation && isInIndia(lat, lon)
      ? fetchStation(lat, lon, openAqKey ?? envOpenAqKey(), airOpts)
      : Promise.resolve(undefined);
  try {
    const series = await fetchAirSeries(lat, lon, airOpts);
    const reading = await station;
    return reading ? { ...series, station: reading } : series;
  } catch (error) {
    // No recording stands in for a point outside India, so that error goes straight up.
    if (error instanceof AppError && error.kind === 'outside_india') throw error;
    // Any other failure falls back to the recording, but only for the sample places.
    const recorded = recordedIdForPoint(lat, lon);
    if (recorded !== undefined) return fetchRecordedSeries(recorded);
    // The specific cause stays attached for logs; the family sees one message for all of them.
    throw new AppError('upstream_unavailable', 'Live air data is not available', { cause: error });
  }
}
