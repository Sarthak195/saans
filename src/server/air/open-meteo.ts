import 'server-only';

import type { AirSeries } from '@/core/air/types';
import { airBodySchema, airUrl, istIso, toAirSeries } from '@/server/air/open-meteo-shape';
import { AppError } from '@/server/errors';
import { INDIA_BOUNDS } from '@/server/geo/places';

export { fetchRecordedSeries } from '@/server/air/recorded';

const TIMEOUT_MS = 3500;
const REVALIDATE_SECONDS = 1800;
const ATTEMPTS = 2;

export interface FetchAirOptions {
  signal?: AbortSignal;
  /** The clock, injectable so a test can fix the fetch time. */
  now?: () => Date;
}

function nameOf(error: unknown): string {
  return error instanceof Error ? error.name : '';
}

/** Sorts a failed attempt into the kinds the app can explain; the detail never carries the URL. */
function classify(error: unknown): AppError {
  if (error instanceof AppError) return error;
  const name = nameOf(error);
  if (name === 'TimeoutError' || name === 'AbortError') {
    return new AppError('upstream_timeout', 'Open-Meteo did not answer in time', { cause: error });
  }
  if (error instanceof SyntaxError) {
    return new AppError('upstream_bad_shape', 'Open-Meteo sent a body that is not JSON', {
      cause: error,
    });
  }
  return new AppError('upstream_unavailable', 'Open-Meteo could not be reached', { cause: error });
}

type Outcome = { body: unknown } | { error: AppError; retry: boolean };

async function attempt(url: string, signal: AbortSignal | undefined): Promise<Outcome> {
  try {
    const timeout = AbortSignal.timeout(TIMEOUT_MS);
    const response = await fetch(url, {
      next: { revalidate: REVALIDATE_SECONDS },
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    });
    if (!response.ok) {
      const detail = `Open-Meteo answered HTTP ${String(response.status)}`;
      // A 4xx will not change on a second try; a 5xx often does.
      return { error: new AppError('upstream_unavailable', detail), retry: response.status >= 500 };
    }
    return { body: (await response.json()) as unknown };
  } catch (error) {
    const failure = classify(error);
    return { error: failure, retry: failure.kind !== 'upstream_bad_shape' && !signal?.aborted };
  }
}

/** One retry, only after a network error, a timeout or a server error. */
async function getJson(url: string, signal: AbortSignal | undefined): Promise<unknown> {
  let failure = new AppError('upstream_unavailable');
  for (let n = 1; n <= ATTEMPTS; n += 1) {
    const outcome = await attempt(url, signal);
    if ('body' in outcome) return outcome.body;
    failure = outcome.error;
    if (!outcome.retry) break;
  }
  throw failure;
}

export function isInIndia(lat: number, lon: number): boolean {
  return (
    lat >= INDIA_BOUNDS.minLat &&
    lat <= INDIA_BOUNDS.maxLat &&
    lon >= INDIA_BOUNDS.minLon &&
    lon <= INDIA_BOUNDS.maxLon
  );
}

/** The hourly air series for a point, from Open-Meteo (CAMS). Coordinates are rounded to 0.1 degree. */
export async function fetchAirSeries(
  lat: number,
  lon: number,
  opts: FetchAirOptions = {},
): Promise<AirSeries> {
  if (!isInIndia(lat, lon)) throw new AppError('outside_india', 'The point is outside India');

  const body = airBodySchema.safeParse(await getJson(airUrl(lat, lon), opts.signal));
  if (!body.success) {
    throw new AppError('upstream_bad_shape', 'Open-Meteo sent data in an unexpected shape');
  }
  const now = (opts.now ?? (() => new Date()))();
  return toAirSeries(body.data, { source: 'open-meteo-cams', fetchedAt: istIso(now), anchor: now });
}
