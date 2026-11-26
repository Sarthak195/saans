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

  it('never caches a typed query, so scripted traffic cannot fill the cache', async () => {
    const mock = replyWith(recorded('mysuru'));
    await resolvePlace('Mysuru');
    const [, init] = mock.mock.calls[0] as [string, RequestInit & { next?: unknown }];
    expect(init.cache).toBe('no-store');
    expect(init.next).toBeUndefined();
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

describe('resolvePlace with a state, a larger place or an address', () => {
  it('looks a name up alone and keeps the one in the state written after the comma', async () => {
    const mock = replyWith(recorded('rampur'));
    expect(await resolvePlace('Rampur, Odisha')).toEqual({
      kind: 'one',
      place: { name: 'Rāmpur', admin1: 'Odisha', lat: 21.07, lon: 84.34, source: 'geocoder' },
    });
    // More rows than a plain search, so a state further down the list is still found.
    expect((mock.mock.calls[0] as [string])[0]).toContain('?name=Rampur&count=20&');
  });

  it('plans for the larger place after the comma when the first part is not found', async () => {
    replyWith(recorded('sector-62'));
    expect(await resolvePlace('Sector 62, Noida')).toMatchObject({
      kind: 'one',
      place: { name: 'Noida', source: 'static' },
    });
    // "Name, state" for a place the geocoder knows, in a state it is not in, falls back the same way.
    replyWith(recorded('rampur'));
    expect(await resolvePlace('Rampur, Delhi')).toMatchObject({
      kind: 'one',
      place: { name: 'Delhi', source: 'static' },
    });
  });

  it('reads a listed place named inside an address the geocoder does not know', async () => {
    replyWith(recorded('sector-62'));
    expect(await resolvePlace('Noida Sector 62')).toMatchObject({
      kind: 'one',
      place: { name: 'Noida' },
    });
    expect(await resolvePlace('Gurgaon Sector 56')).toMatchObject({
      kind: 'one',
      place: { name: 'Gurugram' },
    });
    // "Delhi" inside "New Delhi" is not a second place.
    expect(await resolvePlace('New Delhi Block C')).toMatchObject({
      kind: 'one',
      place: { name: 'New Delhi' },
    });
  });

  it('asks the family to choose when an address names two listed places', async () => {
    replyWith(recorded('sector-62'));
    const result = await resolvePlace('Between Noida and Gurgaon');
    expect(result.kind).toBe('many');
    if (result.kind !== 'many') return;
    expect(result.options.map((o) => o.name)).toEqual(['Noida', 'Gurugram']);
  });

  it('finds nothing when no part names a place, and reads a trailing comma as no comma', async () => {
    replyWith(recorded('sector-62'));
    expect(await resolvePlace('Qwerty, Kerala')).toEqual({ kind: 'none' });
    const mock = replyWith(recorded('mysuru'));
    expect(await resolvePlace('Mysuru,')).toMatchObject({ kind: 'one', place: { name: 'Mysuru' } });
    expect((mock.mock.calls[0] as [string])[0]).toContain('?name=Mysuru&count=5&');
  });
});

describe('exports', () => {
  it('re-exports the list helpers next to resolvePlace', () => {
    expect(geo.INDIA_BOUNDS.minLat).toBe(6);
    expect(geo.nearestStaticPlace(19.07, 72.88)?.name).toBe('Mumbai');
  });
});
