import { afterEach, describe, expect, it, vi } from 'vitest';

import type { AppError } from '@/server/errors';
import * as geo from '@/server/geo/geocode';
import { resolvePlace } from '@/server/geo/geocode';

import { kindOf, recorded, replyWith } from '../helpers/geocode';

afterEach(() => vi.restoreAllMocks());

describe('resolvePlace', () => {
  it('answers a listed name or alias without calling the geocoder', async () => {
    const mock = replyWith({});
    for (const query of ['Andheri', 'Indiranagar', 'Bidhannagar', 'Bombay', 'Delhi']) {
      expect((await resolvePlace(query)).kind).toBe('one');
    }
    expect(mock).not.toHaveBeenCalled();
  });

  it('puts the static place first, labelled static', async () => {
    expect(await resolvePlace('Gurgaon')).toEqual({
      kind: 'one',
      place: { name: 'Gurugram', admin1: 'Haryana', lat: 28.46, lon: 77.03, source: 'static' },
    });
  });

  it('asks the geocoder for India, five results, in English, with a timeout', async () => {
    const mock = replyWith(recorded('mysuru'));
    expect(await resolvePlace('  Mysuru ')).toMatchObject({
      kind: 'one',
      place: { name: 'Mysuru' },
    });
    const [url, init] = mock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      'https://geocoding-api.open-meteo.com/v1/search?name=Mysuru&count=5&language=en&format=json&countryCode=IN',
    );
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it('encodes what the person typed', async () => {
    const mock = replyWith({});
    await resolvePlace('Shivaji Nagar & more');
    expect((mock.mock.calls[0] as [string])[0]).toContain('name=Shivaji%20Nagar%20%26%20more&');
  });

  it('asks the family to choose between places that share a name', async () => {
    replyWith(recorded('rampur'));
    const result = await resolvePlace('Rampur');
    expect(result.kind).toBe('many');
  });

  it('returns none for nothing found, blank text and over-long text without calling out', async () => {
    const mock = replyWith(recorded('sector-62'));
    expect(await resolvePlace('Sector 62')).toEqual({ kind: 'none' });
    expect(mock).toHaveBeenCalledOnce();

    mock.mockClear();
    expect(await resolvePlace('   ')).toEqual({ kind: 'none' });
    expect(await resolvePlace('!!!')).toEqual({ kind: 'none' });
    expect(await resolvePlace('x'.repeat(81))).toEqual({ kind: 'none' });
    expect(mock).not.toHaveBeenCalled();
  });

  it('throws a classified error when the geocoder fails, never returning none', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('fetch failed')));
    expect(await kindOf(resolvePlace('Mysuru'))).toBe('upstream_unavailable');

    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new DOMException('slow', 'TimeoutError')));
    expect(await kindOf(resolvePlace('Mysuru'))).toBe('upstream_timeout');

    replyWith({}, 500);
    expect(await kindOf(resolvePlace('Mysuru'))).toBe('upstream_unavailable');

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('<html>', { status: 200 })));
    expect(await kindOf(resolvePlace('Mysuru'))).toBe('upstream_bad_shape');

    replyWith('not an object');
    expect(await kindOf(resolvePlace('Mysuru'))).toBe('upstream_bad_shape');
  });

  it('does not put the typed text in an error message', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('fetch failed')));
    const error = await resolvePlace('Secretville').catch((e: unknown) => e);
    expect((error as AppError).message).not.toContain('Secretville');
  });
});

describe('exports', () => {
  it('re-exports the list helpers next to resolvePlace', () => {
    expect(geo.INDIA_BOUNDS.minLat).toBe(6);
    expect(geo.nearestStaticPlace(19.07, 72.88)?.name).toBe('Mumbai');
  });
});
