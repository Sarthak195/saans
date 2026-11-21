import { afterEach, describe, expect, it, vi } from 'vitest';

import { fetchAirSeries } from '@/server/air/open-meteo';
import { airUrl, roundCoord } from '@/server/air/open-meteo-shape';
import { AppError, type AppErrorKind } from '@/server/errors';

import { airBody, jsonResponse, type AirBodyShape } from '../helpers/air-body';

// 22:05 on the Indian clock.
const NOW = new Date('2026-11-21T16:35:00Z');
const now = (): Date => NOW;

function stubFetch(...replies: (Response | Error)[]): ReturnType<typeof vi.fn> {
  const mock = vi.fn();
  for (const reply of replies) {
    if (reply instanceof Error) mock.mockRejectedValueOnce(reply);
    else mock.mockResolvedValueOnce(reply);
  }
  vi.stubGlobal('fetch', mock);
  return mock;
}

async function kindOf(promise: Promise<unknown>): Promise<AppErrorKind | 'resolved'> {
  try {
    await promise;
    return 'resolved';
  } catch (error) {
    if (error instanceof AppError) return error.kind;
    throw error;
  }
}

const timeoutError = (): DOMException => new DOMException('timed out', 'TimeoutError');

const omit = (value: object, key: string): object =>
  Object.fromEntries(Object.entries(value).filter(([k]) => k !== key));

const DAMAGED: [string, (b: AirBodyShape) => unknown][] = [
  ['a missing pollutant', (b) => ({ ...b, hourly: omit(b.hourly, 'ozone') })],
  ['a text value', (b) => ({ ...b, hourly: { ...b.hourly, pm10: ['high', ...b.hourly.pm10] } })],
  ['a short column', (b) => ({ ...b, hourly: { ...b.hourly, pm2_5: b.hourly.pm2_5.slice(1) } })],
  ['a malformed hour', (b) => ({ ...b, hourly: { ...b.hourly, time: ['yesterday'] } })],
  ['no hourly block', (b) => omit(b, 'hourly')],
];

afterEach(() => vi.restoreAllMocks());

describe('airUrl', () => {
  it('asks for the six pollutants, one past day and four forecast days on the Indian clock', () => {
    expect(airUrl(28.64, 77.23)).toBe(
      'https://air-quality-api.open-meteo.com/v1/air-quality?latitude=28.6&longitude=77.2' +
        '&hourly=pm2_5,pm10,nitrogen_dioxide,ozone,carbon_monoxide,sulphur_dioxide' +
        '&past_days=1&forecast_days=4&timezone=Asia%2FKolkata',
    );
  });

  it('asks for a date range when given a window', () => {
    const url = airUrl(28.6, 77.2, { startDate: '2025-12-12', endDate: '2025-12-14' });
    expect(url).toContain('&start_date=2025-12-12&end_date=2025-12-14&');
    expect(url).not.toContain('past_days');
  });

  it('rounds to one decimal, taking a half upward', () => {
    expect(roundCoord(72.85)).toBe(72.9);
    expect(roundCoord(12.97)).toBe(13);
    expect(roundCoord(28.649)).toBe(28.6);
  });
});

describe('fetchAirSeries', () => {
  it('maps a reply to an AirSeries with the grid point and an IST fetch time', async () => {
    const mock = stubFetch(jsonResponse(airBody()));
    const series = await fetchAirSeries(28.64, 77.23, { now });

    expect(series.source).toBe('open-meteo-cams');
    expect(series.gridLat).toBe(28.6);
    expect(series.gridLon).toBe(77.2);
    expect(series.fetchedAt).toBe('2026-11-21T22:05:00+05:30');
    expect(series.recordedOn).toBeUndefined();
    expect(series.hours[0]).toEqual({
      hour: '2026-11-20T22:00',
      pm25: 122,
      pm10: 222,
      no2: 30,
      o3: 20,
      co: 500,
      so2: 10,
    });
    expect(mock).toHaveBeenCalledOnce();
  });

  it('keeps the past 24 hours and the next 72, one entry per hour', async () => {
    stubFetch(jsonResponse(airBody()));
    const { hours } = await fetchAirSeries(28.6, 77.2, { now });
    expect(hours[0]?.hour).toBe('2026-11-20T22:00');
    expect(hours.at(-1)?.hour).toBe('2026-11-24T22:00');
    expect(hours).toHaveLength(24 + 72 + 1);
  });

  it('asks the fetch cache for a 30 minute window and sets a timeout signal', async () => {
    const mock = stubFetch(jsonResponse(airBody()));
    await fetchAirSeries(28.6, 77.2, { now });
    const [url, init] = mock.mock.calls[0] as [
      string,
      RequestInit & { next: { revalidate: number } },
    ];
    expect(url).toBe(airUrl(28.6, 77.2));
    expect(init.next).toEqual({ revalidate: 1800 });
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it('uses the real clock when none is injected', async () => {
    stubFetch(jsonResponse(airBody({ start: '2020-01-01T00:00', hours: 3 })));
    // The reply is long past, so every hour is outside the window: no data, but the call was made.
    expect(await kindOf(fetchAirSeries(28.6, 77.2))).toBe('no_data');
  });

  it('keeps null readings as null', async () => {
    stubFetch(jsonResponse(airBody({ pm25: (i) => (i % 2 === 0 ? null : 80) })));
    const { hours } = await fetchAirSeries(28.6, 77.2, { now });
    expect(hours.some((h) => h.pm25 === null)).toBe(true);
    expect(hours.some((h) => h.pm25 === 80)).toBe(true);
  });

  it('refuses a point outside India without calling out', async () => {
    const mock = stubFetch();
    expect(await kindOf(fetchAirSeries(51.5, -0.1))).toBe('outside_india');
    expect(await kindOf(fetchAirSeries(Number.NaN, 77))).toBe('outside_india');
    expect(mock).not.toHaveBeenCalled();
  });

  it('retries once after a server error and then succeeds', async () => {
    const mock = stubFetch(new Response('down', { status: 503 }), jsonResponse(airBody()));
    const series = await fetchAirSeries(28.6, 77.2, { now });
    expect(series.hours.length).toBeGreaterThan(0);
    expect(mock).toHaveBeenCalledTimes(2);
  });

  it('retries once after a network error', async () => {
    const mock = stubFetch(new TypeError('fetch failed'), jsonResponse(airBody()));
    await fetchAirSeries(28.6, 77.2, { now });
    expect(mock).toHaveBeenCalledTimes(2);
  });

  it('gives up after two server errors as unavailable', async () => {
    const mock = stubFetch(new Response('', { status: 500 }), new Response('', { status: 502 }));
    expect(await kindOf(fetchAirSeries(28.6, 77.2, { now }))).toBe('upstream_unavailable');
    expect(mock).toHaveBeenCalledTimes(2);
  });

  it('does not retry a client error', async () => {
    const mock = stubFetch(new Response('', { status: 429 }));
    expect(await kindOf(fetchAirSeries(28.6, 77.2, { now }))).toBe('upstream_unavailable');
    expect(mock).toHaveBeenCalledOnce();
  });

  it('classifies two timeouts as a timeout', async () => {
    const mock = stubFetch(timeoutError(), timeoutError());
    expect(await kindOf(fetchAirSeries(28.6, 77.2, { now }))).toBe('upstream_timeout');
    expect(mock).toHaveBeenCalledTimes(2);
  });

  it('does not retry once the caller has cancelled', async () => {
    const controller = new AbortController();
    controller.abort();
    const mock = stubFetch(new DOMException('aborted', 'AbortError'));
    expect(await kindOf(fetchAirSeries(28.6, 77.2, { now, signal: controller.signal }))).toBe(
      'upstream_timeout',
    );
    expect(mock).toHaveBeenCalledOnce();
  });

  it('classifies a body that is not JSON as a bad shape and does not retry', async () => {
    const mock = stubFetch(new Response('<html>oops</html>', { status: 200 }));
    expect(await kindOf(fetchAirSeries(28.6, 77.2, { now }))).toBe('upstream_bad_shape');
    expect(mock).toHaveBeenCalledOnce();
  });

  it.each(DAMAGED)('classifies %s as a bad shape', async (_label, damage) => {
    stubFetch(jsonResponse(damage(airBody())));
    expect(await kindOf(fetchAirSeries(28.6, 77.2, { now }))).toBe('upstream_bad_shape');
  });

  it('reports no data when every value is null', async () => {
    const body = airBody();
    const blank = (column: (number | null)[]): null[] => column.map(() => null);
    const { hourly } = body;
    stubFetch(
      jsonResponse({
        ...body,
        hourly: {
          time: hourly.time,
          pm2_5: blank(hourly.pm2_5),
          pm10: blank(hourly.pm10),
          nitrogen_dioxide: blank(hourly.nitrogen_dioxide),
          ozone: blank(hourly.ozone),
          carbon_monoxide: blank(hourly.carbon_monoxide),
          sulphur_dioxide: blank(hourly.sulphur_dioxide),
        },
      }),
    );
    expect(await kindOf(fetchAirSeries(28.6, 77.2, { now }))).toBe('no_data');
  });

  it('never puts the request URL in an error message', async () => {
    stubFetch(new TypeError('fetch failed'), new TypeError('fetch failed'));
    const error = await fetchAirSeries(19.07, 72.88, { now }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).message).not.toMatch(/https?:|latitude|19\.|72\./);
  });
});
