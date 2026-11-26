// The live adapter for Open-Meteo's air-quality API (CAMS model): one request per place with a
// timeout, one retry and a check of the reply. Server layer: I/O only, no module-scope state.
// It throws AppError kinds; the fallback to a recording is chosen in get-air.ts.
import 'server-only';

import type { AirSeries } from '@/core/air/types';
import { airBodySchema, airUrl, istIso, toAirSeries } from '@/server/air/open-meteo-shape';
import { AppError } from '@/server/errors';
import { isInIndia } from '@/server/geo/places';

export { fetchRecordedSeries } from '@/server/air/recorded';

// A request is given up after 3.5 seconds. Replies are cached by the framework for 30 minutes
// (best effort), and a failed request is tried at most twice in all.
const TIMEOUT_MS = 3500;
const REVALIDATE_SECONDS = 1800;
const ATTEMPTS = 2;

/** The options for a live air fetch. */
export interface FetchAirOptions {
  /** Lets the caller cancel the request; a cancelled request is not retried. */
  signal?: AbortSignal;
  /** The clock, injectable so a test can fix the fetch time. */
  now?: () => Date;
}

// The name of an error, or an empty string when the thrown value is not an Error.
function nameOf(error: unknown): string {
  return error instanceof Error ? error.name : '';
}

/** Sorts a failed attempt into the kinds the app can explain; the detail never carries the URL. */
function classify(error: unknown): AppError {
  if (error instanceof AppError) return error;
  const name = nameOf(error);
  // Both names are what fetch throws when the timeout or an outside signal fires.
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

// What one attempt gave: the parsed body, or the failure and whether trying again is worth it.
type Outcome = { body: unknown } | { error: AppError; retry: boolean };

// One request with the timeout. It never throws: a failure comes back as an Outcome.
async function attempt(url: string, signal: AbortSignal | undefined): Promise<Outcome> {
  try {
    const timeout = AbortSignal.timeout(TIMEOUT_MS);
    const response = await fetch(url, {
      next: { revalidate: REVALIDATE_SECONDS },
      // Either the caller's signal or the timeout ends the request, whichever comes first.
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
    // A body that is not JSON would stay so, and a cancelled request must stay cancelled.
    return { error: failure, retry: failure.kind !== 'upstream_bad_shape' && !signal?.aborted };
  }
}

/** One retry, only after a network error, a timeout or a server error. */
async function getJson(url: string, signal: AbortSignal | undefined): Promise<unknown> {
  // A starting value; each failed pass in the loop replaces it.
  let failure = new AppError('upstream_unavailable');
  for (let n = 1; n <= ATTEMPTS; n += 1) {
    const outcome = await attempt(url, signal);
    if ('body' in outcome) return outcome.body;
    failure = outcome.error;
    if (!outcome.retry) break;
  }
  throw failure;
}

/**
 * The hourly air series for a point, from Open-Meteo (CAMS). Coordinates are rounded to 0.1 degree.
 * It throws an AppError: outside_india for a point outside the box, and an upstream kind or
 * no_data when the request fails, the reply has the wrong shape or no hour has a value.
 */
export async function fetchAirSeries(
  lat: number,
  lon: number,
  opts: FetchAirOptions = {},
): Promise<AirSeries> {
  // Refused before any request is made.
  if (!isInIndia(lat, lon)) throw new AppError('outside_india', 'The point is outside India');

  const body = airBodySchema.safeParse(await getJson(airUrl(lat, lon), opts.signal));
  if (!body.success) {
    throw new AppError('upstream_bad_shape', 'Open-Meteo sent data in an unexpected shape');
  }
  // One clock reading serves both the fetch stamp and the 24 h back, 72 h ahead trim.
  const now = (opts.now ?? (() => new Date()))();
  return toAirSeries(body.data, { source: 'open-meteo-cams', fetchedAt: istIso(now), anchor: now });
}
