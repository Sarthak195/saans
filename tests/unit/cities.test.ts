import { describe, expect, it } from 'vitest';

import { TRANSIT, cityOf, transitOptionsFor } from '@/core/alternatives/cities';
import type { Place } from '@/core/types';

import { DELHI, MUMBAI, NOIDA, SMALL_TOWN } from '../helpers/plan-doubles';

const place = (name: string, admin1: string, lat: number, lon: number): Place => ({
  name,
  admin1,
  lat,
  lon,
});

describe('transit matching', () => {
  it('finds Delhi by name, by state and for NCR towns', () => {
    expect(cityOf(DELHI)?.id).toBe('delhi-ncr');
    expect(cityOf(place('Delhi', 'Delhi', 28.6, 77.2))?.id).toBe('delhi-ncr');
    for (const town of ['Noida', 'Gurugram', 'Ghaziabad', 'Faridabad']) {
      expect(cityOf(place(town, 'Haryana', 28.5, 77.2))?.id).toBe('delhi-ncr');
    }
    expect(cityOf(NOIDA)?.id).toBe('delhi-ncr');
  });

  it('lists the Delhi Metro and DTC buses for Delhi and Noida', () => {
    for (const p of [DELHI, NOIDA]) {
      expect(transitOptionsFor(p).options.map((o) => o.name)).toEqual(['Delhi Metro', 'DTC buses']);
    }
  });

  it('lists suburban rail, metro and BEST for Mumbai', () => {
    const kinds = transitOptionsFor(MUMBAI).options.map((o) => o.kind);
    expect(kinds).toEqual(expect.arrayContaining(['rail', 'metro', 'bus']));
  });

  it('finds a locality named without its city by distance', () => {
    expect(cityOf(place('Sector 62', 'Uttar Pradesh', 28.6, 77.4))?.id).toBe('delhi-ncr');
    expect(cityOf(place('Powai', 'Maharashtra', 19.12, 72.9))?.id).toBe('mumbai');
  });

  it('does not borrow a city for a same-named place far away', () => {
    expect(cityOf(place('Gurgaon', 'Maharashtra', 19.3, 77.3))).toBeNull();
  });

  it('falls back to one generic bus for a city with no list', () => {
    const { city, options } = transitOptionsFor(SMALL_TOWN);
    expect(city).toBeNull();
    expect(options).toHaveLength(1);
    expect(options[0]?.kind).toBe('bus');
    expect(options[0]?.source.status).toBe('APP');
  });
});

describe('transit data', () => {
  it('carries the operator URL, a check date and a fetch source on every listed option', () => {
    for (const city of TRANSIT.cities) {
      for (const option of city.options) {
        expect(option.url).toMatch(/^https:\/\//);
        expect(option.source.url).toBe(option.url);
        expect(option.source.status).toBe('P-FETCH');
        expect(option.check).toEqual({ on: '2026-11-21', httpStatus: 200 });
      }
    }
  });

  it('names the transport the brief lists for each large city', () => {
    const names = (id: string): string[] =>
      TRANSIT.cities.find((c) => c.id === id)?.options.map((o) => o.name) ?? [];
    expect(names('kolkata')).toContain('Kolkata Metro');
    expect(names('bengaluru')).toEqual(['Namma Metro', 'BMTC buses']);
    expect(names('chennai')).toEqual(['Chennai Metro', 'MTC buses']);
    expect(names('hyderabad')).toEqual(['Hyderabad Metro']);
    expect(names('pune')).toEqual(['Pune Metro', 'PMPML buses']);
    expect(names('ahmedabad')).toEqual(['Ahmedabad Metro']);
  });
});
