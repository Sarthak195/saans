import { describe, expect, it } from 'vitest';

import { INDIA_LAT, INDIA_LON } from '@/core/profile/schema';
import {
  INDIA_BOUNDS,
  STATIC_PLACES,
  findStaticPlace,
  foldName,
  nearestStaticPlace,
} from '@/server/geo/places';

describe('the static place list', () => {
  it('lists about forty cities and the four sample localities', () => {
    expect(STATIC_PLACES.filter((p) => p.kind === 'city').length).toBeGreaterThanOrEqual(36);
    expect(STATIC_PLACES.filter((p) => p.kind === 'locality').map((p) => p.name)).toEqual([
      'Lajpat Nagar',
      'Andheri',
      'Salt Lake (Bidhannagar)',
      'Indiranagar',
    ]);
  });

  it('gives every row a fetched geocoding source and a retrieval date', () => {
    for (const place of STATIC_PLACES) {
      expect(place.source.title).toBe('Open-Meteo Geocoding (GeoNames)');
      expect(place.source.status).toBe('P-FETCH');
      expect(place.source.url).toContain('geocoding-api.open-meteo.com');
      expect(place.source.id).toMatch(/^geonames-\d+$/);
      expect(place.retrievedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it('keeps coordinates inside India and to two decimals', () => {
    for (const place of STATIC_PLACES) {
      expect(place.lat).toBeGreaterThan(INDIA_BOUNDS.minLat);
      expect(place.lat).toBeLessThan(INDIA_BOUNDS.maxLat);
      expect(place.lon).toBeGreaterThan(INDIA_BOUNDS.minLon);
      expect(place.lon).toBeLessThan(INDIA_BOUNDS.maxLon);
      expect(Math.abs(place.lat * 100 - Math.round(place.lat * 100))).toBeLessThan(1e-6);
      expect(Math.abs(place.lon * 100 - Math.round(place.lon * 100))).toBeLessThan(1e-6);
    }
  });

  it('has no name or alias that two places share', () => {
    const keys = STATIC_PLACES.flatMap((p) => [p.name, ...p.aliases].map(foldName));
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('matches the profile schema bounds', () => {
    expect(INDIA_BOUNDS).toEqual({
      minLat: INDIA_LAT.min,
      maxLat: INDIA_LAT.max,
      minLon: INDIA_LON.min,
      maxLon: INDIA_LON.max,
    });
    expect(INDIA_BOUNDS).toEqual({ minLat: 6, maxLat: 38, minLon: 68, maxLon: 98 });
  });
});

describe('findStaticPlace', () => {
  it.each([
    ['Bombay', 'Mumbai'],
    ['calcutta', 'Kolkata'],
    ['  BANGALORE ', 'Bengaluru'],
    ['Gurgaon', 'Gurugram'],
    ['Bidhannagar', 'Salt Lake (Bidhannagar)'],
    ['Salt Lake', 'Salt Lake (Bidhannagar)'],
    ['bidhan-nagar', 'Salt Lake (Bidhannagar)'],
    ['Andheri', 'Andheri'],
    ['Indira Nagar', 'Indiranagar'],
    ['Lajpat Nagar, Delhi', 'Lajpat Nagar'],
    ['Panjim', 'Panaji'],
    ['Thiruvananthapuram', 'Thiruvananthapuram'],
    ['Vizag', 'Visakhapatnam'],
  ])('finds %s as %s', (query, name) => {
    expect(findStaticPlace(query)?.name).toBe(name);
  });

  it('returns the place in the shape the app uses', () => {
    expect(findStaticPlace('Mumbai')).toEqual({
      name: 'Mumbai',
      admin1: 'Maharashtra',
      lat: 19.07,
      lon: 72.88,
      source: 'static',
    });
  });

  it('names Delhi by its short state name', () => {
    expect(findStaticPlace('Delhi')?.admin1).toBe('Delhi');
  });

  it.each(['', '   ', ',', 'Sector 62', 'Atlantis', 'Mum'])('does not match %j', (query) => {
    expect(findStaticPlace(query)).toBeUndefined();
  });
});

describe('foldName', () => {
  it('ignores case, accents, punctuation and spacing', () => {
    expect(foldName('  Indirānagar ')).toBe('indiranagar');
    expect(foldName('Salt-Lake,  City')).toBe('salt lake city');
  });
});

describe('nearestStaticPlace', () => {
  it('names a point in a sample locality after the locality', () => {
    expect(nearestStaticPlace(28.57, 77.24)?.name).toBe('Lajpat Nagar');
    expect(nearestStaticPlace(12.975, 77.64)?.name).toBe('Indiranagar');
  });

  it('names a point in a metro after the city when no locality is that close', () => {
    expect(nearestStaticPlace(28.7, 77.2)?.name).toBe('Delhi');
    expect(nearestStaticPlace(18.55, 73.9)).toMatchObject({ name: 'Pune', source: 'static' });
  });

  it('returns null far from every listed place', () => {
    expect(nearestStaticPlace(26.0, 70.5)).toBeNull();
    expect(nearestStaticPlace(51.5, -0.1)).toBeNull();
    expect(nearestStaticPlace(Number.NaN, 77)).toBeNull();
  });

  it('does not call a point a few kilometres from a locality by its name', () => {
    // About 8 km from Andheri: Mumbai is the safer name.
    expect(nearestStaticPlace(19.07, 72.88)?.name).toBe('Mumbai');
  });
});
