import 'server-only';

import type { AirSeries } from '@/core/air/types';
import { fetchAirSeries, type FetchAirOptions } from '@/server/air/open-meteo';
import { fetchRecordedSeries, recordedIdForPoint } from '@/server/air/recorded';
import { AppError } from '@/server/errors';

/**
 * Air data for a point: live if Open-Meteo answers; otherwise, for the sample places only, the
 * dated recording (its `source` says 'recorded' so the page can label it); otherwise an error
 * the caller turns into a plain message. A point outside India is refused, not papered over.
 */
export async function getAirSeries(
  lat: number,
  lon: number,
  opts: FetchAirOptions = {},
): Promise<AirSeries> {
  try {
    return await fetchAirSeries(lat, lon, opts);
  } catch (error) {
    if (error instanceof AppError && error.kind === 'outside_india') throw error;
    const recorded = recordedIdForPoint(lat, lon);
    if (recorded !== undefined) return fetchRecordedSeries(recorded);
    // The specific cause stays attached for logs; the family sees one message for all of them.
    throw new AppError('upstream_unavailable', 'Live air data is not available', { cause: error });
  }
}
