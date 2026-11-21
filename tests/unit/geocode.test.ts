import { afterEach, describe, expect, it, vi } from 'vitest';

import { AppError } from '@/server/errors';
import { interpretGeocoderBody } from '@/server/geo/geocode';

import { recorded } from '../helpers/geocode';

afterEach(() => vi.restoreAllMocks());

describe('interpretGeocoderBody with real replies', () => {
  it('asks the family to choose for Andheri, with the Mumbai one first', () => {
    const result = interpretGeocoderBody(recorded('andheri'));
    expect(result.kind).toBe('many');
    if (result.kind !== 'many') return;
    expect(result.options.map((o) => o.admin1)).toEqual([
      'Maharashtra',
      'Himachal Pradesh',
      'Haryana',
      'Punjab',
    ]);
    expect(result.options[0]).toEqual({
      name: 'Andheri',
      admin1: 'Maharashtra',
      lat: 19.13,
      lon: 72.85,
      source: 'geocoder',
    });
  });

  it('asks for Indiranagar across spellings, Bengaluru first', () => {
    const result = interpretGeocoderBody(recorded('indiranagar'));
    expect(result.kind).toBe('many');
    if (result.kind !== 'many') return;
    // IndiraNagar, Indirānagar and Indiranagar are one name; the two in Maharashtra count once.
    expect(result.options.map((o) => o.admin1)).toEqual(['Karnataka', 'Maharashtra']);
    expect(result.options[0]?.name).toBe('IndiraNagar');
  });

  it('finds nothing for Sector 62 and Bidhannagar', () => {
    expect(interpretGeocoderBody(recorded('sector-62'))).toEqual({ kind: 'none' });
    expect(interpretGeocoderBody(recorded('bidhannagar'))).toEqual({ kind: 'none' });
  });

  it('returns the single clear match for Mysuru', () => {
    expect(interpretGeocoderBody(recorded('mysuru'))).toEqual({
      kind: 'one',
      place: { name: 'Mysuru', admin1: 'Karnataka', lat: 12.3, lon: 76.64, source: 'geocoder' },
    });
  });

  it('keeps one option per state for Rampur', () => {
    const result = interpretGeocoderBody(recorded('rampur'));
    expect(result.kind).toBe('many');
    if (result.kind !== 'many') return;
    expect(result.options.map((o) => o.admin1)).toEqual([
      'Uttar Pradesh',
      'Odisha',
      'Madhya Pradesh',
    ]);
  });

  it('drops an airport and a differently named village when choosing', () => {
    const result = interpretGeocoderBody(recorded('chennai'));
    expect(result).toMatchObject({ kind: 'one', place: { name: 'Chennai', admin1: 'Tamil Nadu' } });
  });

  it('treats accented duplicates of one name in different states as ambiguous', () => {
    const result = interpretGeocoderBody(recorded('gurgaon'));
    expect(result.kind).toBe('many');
    if (result.kind !== 'many') return;
    expect(result.options.length).toBeLessThanOrEqual(5);
    expect(result.options.map((o) => o.admin1)).toContain('Maharashtra');
  });
});

describe('interpretGeocoderBody rules', () => {
  const row = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
    name: 'Testpur',
    latitude: 22.5,
    longitude: 80.5,
    feature_code: 'PPL',
    country_code: 'IN',
    admin1: 'Madhya Pradesh',
    ...over,
  });

  it('returns none when there are no results or the key is missing', () => {
    expect(interpretGeocoderBody({})).toEqual({ kind: 'none' });
    expect(interpretGeocoderBody({ results: [] })).toEqual({ kind: 'none' });
  });

  it.each(['AIRP', 'PPLH', 'PPLQ', 'PPLW', 'ADM1', 'HLL', 'PPLCH'])(
    'drops a %s feature',
    (feature_code) => {
      expect(interpretGeocoderBody({ results: [row({ feature_code })] })).toEqual({ kind: 'none' });
    },
  );

  it.each([
    'PPL',
    'PPLA',
    'PPLA2',
    'PPLA4',
    'PPLC',
    'PPLG',
    'PPLL',
    'PPLR',
    'PPLS',
    'PPLF',
    'PPLX',
  ])('keeps a %s feature', (feature_code) => {
    expect(interpretGeocoderBody({ results: [row({ feature_code })] }).kind).toBe('one');
  });

  it('drops results outside India bounds or in another country', () => {
    const body = {
      results: [
        row({ latitude: 51.5, longitude: -0.1 }),
        row({ latitude: 5.9, longitude: 80 }),
        row({ latitude: 20, longitude: 98.1 }),
        row({ country_code: 'NP' }),
      ],
    };
    expect(interpretGeocoderBody(body)).toEqual({ kind: 'none' });
  });

  it('drops rows without a state or with unusable fields, and keeps the rest', () => {
    const body = { results: [row({ admin1: undefined }), { nonsense: true }, 'text', row()] };
    expect(interpretGeocoderBody(body)).toMatchObject({ kind: 'one', place: { name: 'Testpur' } });
  });

  it('returns one when the same name repeats within a single state', () => {
    const body = { results: [row(), row({ latitude: 23.1 }), row({ latitude: 23.9 })] };
    expect(interpretGeocoderBody(body)).toMatchObject({ kind: 'one', place: { lat: 22.5 } });
  });

  it('does not call it ambiguous when only a different name is in another state', () => {
    const body = { results: [row(), row({ name: 'Otherpur', admin1: 'Odisha' })] };
    expect(interpretGeocoderBody(body).kind).toBe('one');
  });

  it('offers at most five options with the first result first', () => {
    const states = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];
    const body = { results: states.map((admin1) => row({ admin1 })) };
    const result = interpretGeocoderBody(body);
    expect(result.kind).toBe('many');
    if (result.kind !== 'many') return;
    expect(result.options.map((o) => o.admin1)).toEqual(['A', 'B', 'C', 'D', 'E']);
  });

  it('rounds coordinates to two decimals and shortens the Delhi state name', () => {
    const body = {
      results: [
        row({
          latitude: 28.65432,
          longitude: 77.23456,
          admin1: 'National Capital Territory of Delhi',
        }),
      ],
    };
    expect(interpretGeocoderBody(body)).toMatchObject({
      place: { lat: 28.65, lon: 77.23, admin1: 'Delhi' },
    });
  });

  it('rejects a reply that is not an object with a results list', () => {
    expect(() => interpretGeocoderBody('nope')).toThrow(AppError);
    expect(() => interpretGeocoderBody({ results: 'many' })).toThrow(AppError);
  });
});
