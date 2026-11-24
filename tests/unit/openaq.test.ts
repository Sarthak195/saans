import { describe, expect, it, vi } from 'vitest';

import { getAirSeries } from '@/server/air/get-air';
import {
  fetchStation,
  isFresh,
  locationsUrl,
  rankLocations,
  type OpenAqLatest,
  type OpenAqLocation,
} from '@/server/air/openaq';

import { airBody, jsonResponse } from '../helpers/air-body';
import fixture from '../fixtures/openaq.json';

// A trimmed copy of real replies for a point near Lajpat Nagar, Delhi. The latest list for
// R K Puram mixes live sensors (17:45 IST today) with ones that stopped in 2018.
const KEY = 'test-key-not-a-secret';
const LOCATIONS = fixture.locations.results as OpenAqLocation[];
const LATEST = fixture.latest['17'].results as OpenAqLatest[];
const POINT = fixture.point;
// 19:55 on the Indian clock, two and a half hours after the newest reading.
const NOW = new Date('2026-11-24T14:25:00Z');
const now = (): Date => NOW;
const chooseLocation = (...args: Parameters<typeof rankLocations>) =>
  rankLocations(...args)[0] ?? null;

const RK_PURAM_PM25 = 12234787;
const RK_PURAM_PM10 = 12234786;

interface Stub {
  fetch: ReturnType<typeof vi.fn>;
  urls: () => string[];
}

function urlOf(input: string | URL | Request): string {
  return typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
}

/** Answers by URL: the locations search, a location's latest list, or Open-Meteo. */
function stubFetch(
  routes: {
    locations?: unknown;
    latest?: unknown;
    air?: unknown;
  } = {},
): Stub {
  const reply = (value: unknown): Promise<Response> => {
    if (value instanceof Error) return Promise.reject(value);
    return Promise.resolve(value instanceof Response ? value : jsonResponse(value));
  };
  const mock = vi.fn((input: string | URL | Request, init?: RequestInit) => {
    if (init?.signal?.aborted) return Promise.reject(init.signal.reason as Error);
    const url = urlOf(input);
    if (url.includes('/locations/')) return reply(routes.latest ?? fixture.latest['17']);
    if (url.includes('/locations?')) return reply(routes.locations ?? fixture.locations);
    return reply(routes.air ?? airBody());
  });
  vi.stubGlobal('fetch', mock);
  return {
    fetch: mock,
    urls: () => mock.mock.calls.map(([input]) => urlOf(input)),
  };
}

const station = (key: string | undefined, lat = POINT.lat, lon = POINT.lon) =>
  fetchStation(lat, lon, key, { now });

const withLatest = (results: OpenAqLatest[]): { results: OpenAqLatest[] } => ({ results });
const changeValue = (sensorsId: number, value: number): OpenAqLatest[] =>
  LATEST.map((r) => (r.sensorsId === sensorsId ? { ...r, value } : r));

describe('fetchStation', () => {
  it('reads the nearest recent station and ignores the sensors that stopped years ago', async () => {
    const stub = stubFetch();
    expect(await station(KEY)).toEqual({
      provider: 'openaq',
      name: 'R K Puram, Delhi - DPCC',
      distanceKm: 5.5,
      pm25: 28,
      pm10: 69,
      measuredAt: '2026-11-24T17:45:00+05:30',
    });
    // The search, then the latest list of each of the nearest recent stations, nearest first.
    expect(stub.urls()).toHaveLength(3);
    expect(stub.urls()[1]).toBe('https://api.openaq.org/v3/locations/17/latest');
  });

  it('moves to the next station when the nearest one has no fresh PM2.5', async () => {
    const answer = vi.fn((input: string | URL | Request) => {
      const url = urlOf(input);
      if (url.includes('/locations/17/')) return Promise.resolve(jsonResponse(withLatest([])));
      if (url.includes('/locations/')) {
        // Another station, reporting the same live values under its own sensor ids.
        const other = LOCATIONS.find((l) => url.includes(`/locations/${String(l.id)}/`));
        const ids = other?.sensors.filter((s) => s.parameter.name === 'pm25').map((s) => s.id);
        const live = LATEST.find((r) => r.sensorsId === RK_PURAM_PM25);
        const results = live && ids?.[0] !== undefined ? [{ ...live, sensorsId: ids[0] }] : [];
        return Promise.resolve(jsonResponse(withLatest(results)));
      }
      return Promise.resolve(jsonResponse(fixture.locations));
    });
    vi.stubGlobal('fetch', answer);
    const result = await station(KEY);
    expect(result?.name).not.toBe('R K Puram, Delhi - DPCC');
    expect(result?.pm25).toBe(28);
  });

  it('puts the key in a header only, and a point rounded to 0.1 degree in the address', async () => {
    const stub = stubFetch();
    await station(KEY);
    for (const [url, init] of stub.fetch.mock.calls as [string, RequestInit][]) {
      expect(url).not.toContain(KEY);
      expect((init.headers as Record<string, string>)['X-API-Key']).toBe(KEY);
    }
    expect(stub.urls()[0]).toContain('coordinates=28.6,77.2&');
    expect(stub.urls()[0]).not.toContain('28.5677');
    expect(locationsUrl(19.076, 72.8777)).toContain('coordinates=19.1,72.9&');
  });

  it('asks the fetch cache for hours on the station list and minutes on the readings', async () => {
    const stub = stubFetch();
    await station(KEY);
    const [first, second] = (
      stub.fetch.mock.calls as [string, { next: { revalidate: number } }][]
    ).map(([, init]) => init.next.revalidate);
    expect(first).toBeGreaterThanOrEqual(3600);
    expect(second).toBeLessThanOrEqual(900);
  });

  it('does not depend on the order the stations arrive in', async () => {
    stubFetch({ locations: { results: [...LOCATIONS].reverse() } });
    expect((await station(KEY))?.name).toBe('R K Puram, Delhi - DPCC');
  });

  it('skips a nearer station that stopped reporting years ago', async () => {
    // Standing at the Income Tax Office, whose last reading is from 2018.
    const stub = stubFetch();
    const result = await station(KEY, 28.6235, 77.2494);
    expect(result?.name).toBe('R K Puram, Delhi - DPCC');
    expect(stub.urls()[1]).toContain('/locations/17/');
  });

  it('skips a mobile unit and anything that is not a monitor', async () => {
    const stub = stubFetch({
      locations: {
        results: LOCATIONS.map((l) => (l.id === 17 ? { ...l, isMobile: true } : l)),
      },
    });
    await station(KEY);
    expect(stub.urls()[1]).toContain('/locations/5598/');

    const second = stubFetch({
      locations: {
        results: LOCATIONS.map((l) => (l.id === 17 ? { ...l, isMonitor: false } : l)),
      },
    });
    await station(KEY);
    expect(second.urls()[1]).toContain('/locations/5598/');
  });

  it('gives nothing when every station nearby has stopped, without a second call', async () => {
    const stub = stubFetch({
      locations: { results: LOCATIONS.filter((l) => [15, 103, 236, 2597].includes(l.id)) },
    });
    expect(await station(KEY)).toBeUndefined();
    expect(stub.urls()).toHaveLength(1);
  });

  it('gives nothing when only the old sensors have values', async () => {
    stubFetch({
      latest: withLatest(LATEST.filter((r) => r.sensorsId === 35 || r.sensorsId === 399)),
    });
    expect(await station(KEY)).toBeUndefined();
  });

  it('ignores readings from sensors that belong to another location', async () => {
    const stranger: OpenAqLatest = {
      sensorsId: 777,
      value: 5,
      datetime: { utc: '2026-11-24T12:15:00Z' },
    };
    stubFetch({
      latest: withLatest([stranger, ...LATEST.filter((r) => r.sensorsId !== RK_PURAM_PM25)]),
    });
    expect(await station(KEY)).toBeUndefined();
  });

  it('drops negative and absurd values', async () => {
    stubFetch({ latest: withLatest(changeValue(RK_PURAM_PM25, -4)) });
    expect(await station(KEY)).toBeUndefined();

    stubFetch({ latest: withLatest(changeValue(RK_PURAM_PM25, 99_999)) });
    expect(await station(KEY)).toBeUndefined();

    stubFetch({ latest: withLatest(changeValue(RK_PURAM_PM10, -1)) });
    expect(await station(KEY)).toMatchObject({ pm25: 28, pm10: null });
  });

  it('keeps PM2.5 when PM10 is missing', async () => {
    stubFetch({ latest: withLatest(LATEST.filter((r) => r.sensorsId !== RK_PURAM_PM10)) });
    expect(await station(KEY)).toMatchObject({ pm25: 28, pm10: null });
  });

  it.each([
    ['a timeout', new DOMException('timed out', 'TimeoutError')],
    ['a network failure', new TypeError('fetch failed')],
    ['an unauthorised key', new Response('', { status: 401 })],
    ['too many requests', new Response('', { status: 429 })],
    ['a server error', new Response('', { status: 503 })],
    ['a body that is not JSON', new Response('<html>', { status: 200 })],
    ['an unexpected shape', jsonResponse({ results: 'none' })],
  ])('gives nothing, quietly, after %s', async (_name, failure) => {
    stubFetch({ locations: failure });
    expect(await station(KEY)).toBeUndefined();
  });

  it('gives nothing when the readings call fails', async () => {
    stubFetch({ latest: new Response('', { status: 429 }) });
    expect(await station(KEY)).toBeUndefined();
  });

  it('gives up on a station service that never answers', async () => {
    const hung = vi.fn(
      (_url: string, init: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => {
            reject(init.signal?.reason as Error);
          });
        }),
    );
    vi.stubGlobal('fetch', hung);
    const started = Date.now();
    expect(await station(KEY)).toBeUndefined();
    expect(Date.now() - started).toBeLessThan(4000);
  });

  it('stops when the caller aborts', async () => {
    stubFetch();
    const controller = new AbortController();
    controller.abort();
    expect(
      await fetchStation(POINT.lat, POINT.lon, KEY, { now, signal: controller.signal }),
    ).toBeUndefined();
  });

  it.each([undefined, ''])('makes no call at all without a key (%j)', async (key) => {
    const stub = stubFetch();
    expect(await station(key)).toBeUndefined();
    expect(stub.fetch).not.toHaveBeenCalled();
  });
});

describe('isFresh', () => {
  it('keeps the two to three hour lag of the national network and drops older readings', () => {
    expect(isFresh('2026-11-24T12:15:00Z', NOW)).toBe(true);
    expect(isFresh('2026-11-24T10:25:00Z', NOW)).toBe(true);
    expect(isFresh('2026-11-24T10:24:00Z', NOW)).toBe(false);
    expect(isFresh('2018-02-22T02:45:00Z', NOW)).toBe(false);
  });

  it('rejects a time in the future and text that is not a time', () => {
    expect(isFresh('2026-11-24T14:30:00Z', NOW)).toBe(true);
    expect(isFresh('2026-11-24T16:00:00Z', NOW)).toBe(false);
    expect(isFresh('yesterday', NOW)).toBe(false);
  });
});

describe('chooseLocation', () => {
  it('measures from the exact point, not the rounded one', () => {
    const chosen = chooseLocation(LOCATIONS, POINT.lat, POINT.lon, NOW);
    expect(chosen?.location.id).toBe(17);
    expect(chosen?.distanceKm).toBeCloseTo(5.5, 0);
  });

  it('works with a station that has no coordinates by using the distance the search gave', () => {
    const bare = LOCATIONS.filter((l) => l.id === 17).map((l) => ({
      ...l,
      coordinates: null,
      distance: 5537,
    }));
    expect(chooseLocation(bare, POINT.lat, POINT.lon, NOW)?.distanceKm).toBe(5.537);
  });

  it('drops a monitor farther than the cap from the exact point', () => {
    const far = LOCATIONS.filter((l) => l.id === 17).map((l) => ({
      ...l,
      coordinates: { latitude: POINT.lat + 0.2, longitude: POINT.lon },
    }));
    expect(chooseLocation(far, POINT.lat, POINT.lon, NOW)).toBeNull();
    const near = LOCATIONS.filter((l) => l.id === 17).map((l) => ({
      ...l,
      coordinates: { latitude: POINT.lat + 0.08, longitude: POINT.lon },
    }));
    expect(chooseLocation(near, POINT.lat, POINT.lon, NOW)?.distanceKm).toBeLessThan(10);
  });

  it('gives nothing for a station that lists no last reading', () => {
    const unknown = LOCATIONS.filter((l) => l.id === 15);
    expect(unknown[0]?.datetimeLast).toBeNull();
    expect(chooseLocation(unknown, POINT.lat, POINT.lon, NOW)).toBeNull();
  });
});

describe('remembering a failed lookup', () => {
  const memory = () => {
    const kept = new Map<string, Promise<unknown>>();
    const remember = <T>(key: string[], produce: () => Promise<T>): Promise<T> => {
      const id = key.join('|');
      const hit = kept.get(id);
      if (hit) return hit as Promise<T>;
      const made = produce();
      kept.set(id, made);
      return made;
    };
    return remember;
  };

  it('asks OpenAQ once for a place that answered 429, however often it is viewed', async () => {
    const stub = stubFetch({ locations: new Response('', { status: 429 }) });
    const remember = memory();
    for (let view = 0; view < 3; view += 1) {
      expect(await fetchStation(POINT.lat, POINT.lon, KEY, { now, remember })).toBeUndefined();
    }
    expect(stub.urls()).toHaveLength(1);
  });

  it('keeps a separate memory for each place', async () => {
    const stub = stubFetch({ locations: new Response('', { status: 429 }) });
    const remember = memory();
    await fetchStation(POINT.lat, POINT.lon, KEY, { now, remember });
    await fetchStation(19.1, 72.9, KEY, { now, remember });
    expect(stub.urls()).toHaveLength(2);
  });
});

describe('getAirSeries with a station', () => {
  it('asks OpenAQ nothing unless the caller wants the station', async () => {
    const stub = stubFetch();
    const series = await getAirSeries(POINT.lat, POINT.lon, { now, openAqKey: KEY });
    expect(series.station).toBeUndefined();
    expect(stub.urls().every((u) => u.includes('open-meteo'))).toBe(true);
  });

  it('asks OpenAQ nothing for a point outside India', async () => {
    const stub = stubFetch();
    await getAirSeries(51.5, -0.1, { now, openAqKey: KEY, station: true }).catch(() => undefined);
    expect(stub.urls().some((u) => u.includes('openaq'))).toBe(false);
  });

  it('attaches the station to a live series, fetching both at the same time', async () => {
    const stub = stubFetch();
    const pending = getAirSeries(POINT.lat, POINT.lon, { now, openAqKey: KEY, station: true });
    // The station lookup starts without waiting for the model data.
    await vi.waitFor(() => {
      expect(stub.urls().some((u) => u.includes('api.openaq.org'))).toBe(true);
    });
    expect(stub.urls().some((u) => u.includes('open-meteo'))).toBe(true);
    const series = await pending;
    expect(series.source).toBe('open-meteo-cams');
    expect(series.station?.name).toBe('R K Puram, Delhi - DPCC');
  });

  it('leaves the series as it was when the station call fails', async () => {
    stubFetch({ locations: new Response('', { status: 401 }) });
    const series = await getAirSeries(POINT.lat, POINT.lon, { now, openAqKey: KEY, station: true });
    expect(series.source).toBe('open-meteo-cams');
    expect(series.station).toBeUndefined();
  });

  it('never puts a station on a recorded series', async () => {
    stubFetch({ air: new Response('', { status: 503 }) });
    const series = await getAirSeries(19.13, 72.85, { now, openAqKey: KEY, station: true });
    expect(series.source).toBe('recorded');
    expect(series.station).toBeUndefined();
  });

  it('asks for no station without a key', async () => {
    const stub = stubFetch();
    const series = await getAirSeries(POINT.lat, POINT.lon, { now, station: true });
    expect(series.station).toBeUndefined();
    expect(stub.urls().every((u) => u.includes('open-meteo'))).toBe(true);
  });
});
