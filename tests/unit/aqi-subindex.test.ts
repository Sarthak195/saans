import { describe, expect, it } from 'vitest';

import { bandOfIndex, pm25Level, subIndex } from '@/core/aqi';
import type { Band } from '@/core/aqi';

describe('subIndex: CPCB published vector', () => {
  it.each([
    [31, 51],
    [45, 75],
    [60, 100],
  ])('PM2.5 %s ug/m3 gives sub-index %s', (concentration, expected) => {
    expect(subIndex('pm25', concentration)).toBe(expected);
  });
});

describe('subIndex: every printed band edge, both sides', () => {
  // [concentration, index, band]: the top of one printed band and the first value of the next.
  const pm25: [number, number, Band][] = [
    [0, 0, 'good'],
    [30, 50, 'good'],
    [31, 51, 'satisfactory'],
    [60, 100, 'satisfactory'],
    [61, 101, 'moderate'],
    [90, 200, 'moderate'],
    [91, 201, 'poor'],
    [120, 300, 'poor'],
    [121, 301, 'very_poor'],
    [250, 400, 'very_poor'],
    [251, 401, 'severe'],
  ];
  const pm10: [number, number, Band][] = [
    [0, 0, 'good'],
    [50, 50, 'good'],
    [51, 51, 'satisfactory'],
    [100, 100, 'satisfactory'],
    [101, 101, 'moderate'],
    [250, 200, 'moderate'],
    [251, 201, 'poor'],
    [350, 300, 'poor'],
    [351, 301, 'very_poor'],
    [430, 400, 'very_poor'],
    [431, 401, 'severe'],
  ];

  it.each(pm25)('PM2.5 %s gives %s in %s', (c, index, band) => {
    expect(subIndex('pm25', c)).toBe(index);
    expect(pm25Level(c)).toBe(band);
    expect(bandOfIndex(index)).toBe(band);
  });

  it.each(pm10)('PM10 %s gives %s in %s', (c, index, band) => {
    expect(subIndex('pm10', c)).toBe(index);
    expect(bandOfIndex(subIndex('pm10', c))).toBe(band);
  });

  it('puts the spec examples in the right bands', () => {
    expect(pm25Level(245)).toBe('very_poor');
    expect(pm25Level(251)).toBe('severe');
    expect(pm25Level(118)).toBe('poor');
  });

  it('interpolates inside a band with the CPCB formula', () => {
    // (200 - 101) / (250 - 101) * (175 - 101) + 101 = 150.2
    expect(subIndex('pm10', 175)).toBe(150);
    // (300 - 201) / (120 - 91) * (105 - 91) + 201 = 248.8
    expect(subIndex('pm25', 105)).toBe(249);
  });
});

describe('subIndex: rounding to the printed table precision', () => {
  it('keeps 30.4 in Good and rounds 30.5 up into Satisfactory', () => {
    expect(subIndex('pm25', 30.4)).toBe(50);
    expect(pm25Level(30.4)).toBe('good');
    expect(subIndex('pm25', 30.5)).toBe(51);
    expect(pm25Level(30.5)).toBe('satisfactory');
  });

  it('rounds at every band boundary the same way', () => {
    expect(pm25Level(60.4)).toBe('satisfactory');
    expect(pm25Level(60.5)).toBe('moderate');
    expect(pm25Level(250.4)).toBe('very_poor');
    expect(pm25Level(250.5)).toBe('severe');
  });

  it('rounds CO to one decimal of mg/m3', () => {
    expect(subIndex('co', 1049)).toBe(50);
    expect(subIndex('co', 1050)).toBe(51);
    expect(subIndex('co', 1100)).toBe(51);
  });
});

describe('subIndex: carbon monoxide unit', () => {
  it('converts ug/m3 to mg/m3 before the lookup', () => {
    expect(subIndex('co', 1000)).toBe(50);
    expect(subIndex('co', 2000)).toBe(100);
    // 1.5 mg/m3: (100 - 51) / (2.0 - 1.1) * (1.5 - 1.1) + 51 = 72.8
    expect(subIndex('co', 1500)).toBe(73);
  });

  it('would be hugely wrong if the value were read as mg/m3 directly', () => {
    expect(subIndex('co', 400)).toBe(20);
    expect(subIndex('co', 400)).toBeLessThan(subIndex('co', 2000));
  });

  it('resolves the doubly printed edge 10 mg/m3 into the lower band', () => {
    expect(subIndex('co', 10_000)).toBe(200);
    expect(subIndex('co', 10_100)).toBe(202);
  });
});

describe('subIndex: gases and the Severe band', () => {
  it('scores each gas on its own breakpoints', () => {
    expect(subIndex('no2', 40)).toBe(50);
    expect(subIndex('no2', 80)).toBe(100);
    expect(subIndex('so2', 380)).toBe(200);
    expect(subIndex('o3', 168)).toBe(200);
    expect(subIndex('o3', 209)).toBe(301);
  });

  it('runs Severe from its printed edge to twice that edge and caps at 500', () => {
    expect(subIndex('pm25', 500)).toBe(500);
    expect(subIndex('pm25', 375)).toBe(451);
    expect(subIndex('pm25', 501)).toBe(500);
    expect(subIndex('pm25', 750)).toBe(500);
    expect(subIndex('pm10', 1_000_000)).toBe(500);
    expect(subIndex('co', 1e12)).toBe(500);
  });

  it('treats a negative reading as clean air', () => {
    expect(subIndex('pm25', -4)).toBe(0);
    expect(subIndex('no2', -0.2)).toBe(0);
  });

  it('refuses values that are not numbers', () => {
    expect(() => subIndex('pm25', Number.NaN)).toThrow(RangeError);
    expect(() => subIndex('pm25', Number.POSITIVE_INFINITY)).toThrow(RangeError);
    expect(() => pm25Level(Number.NaN)).toThrow(RangeError);
  });
});

describe('bandOfIndex', () => {
  it.each([
    [0, 'good'],
    [50, 'good'],
    [51, 'satisfactory'],
    [100, 'satisfactory'],
    [101, 'moderate'],
    [200, 'moderate'],
    [201, 'poor'],
    [300, 'poor'],
    [301, 'very_poor'],
    [400, 'very_poor'],
    [401, 'severe'],
    [500, 'severe'],
  ] as [number, Band][])('index %s is %s', (index, band) => {
    expect(bandOfIndex(index)).toBe(band);
  });
});
