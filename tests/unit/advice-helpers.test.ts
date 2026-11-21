import { describe, expect, it } from 'vitest';

import { clockOf, fillImpact, fillTemplate, oneDecimal, roundToFive } from '@/core/advice/format';
import { isPoorOrWorse, planLevel } from '@/core/advice/level';
import { sourceRefSchema } from '@/core/advice/source-schema';

import { INSUFFICIENT, aqiOk, makePlan, windowOf } from '../helpers/plan-doubles';

describe('format helpers', () => {
  it('rounds concentrations to the nearest 5', () => {
    expect([0, 2, 3, 112, 163, 247].map(roundToFive)).toEqual([0, 0, 5, 110, 165, 245]);
  });

  it('keeps at most one decimal', () => {
    expect(oneDecimal(4.56)).toBe(4.6);
    expect(oneDecimal(60)).toBe(60);
  });

  it('reads a clock time from an hour stamp or a clock time', () => {
    expect(clockOf('2026-11-24T14:00')).toBe('14:00');
    expect(clockOf('09:30')).toBe('09:30');
    expect(clockOf('noon')).toBe('noon');
  });

  it('fills placeholders and refuses a missing one', () => {
    expect(fillTemplate('{a} to {b}', { a: '08:00', b: 9 })).toBe('08:00 to 9');
    expect(() => fillTemplate('{a} and {missing}', { a: 1 })).toThrow('{missing}');
  });

  it('builds an impact whose numbers follow the names in the data', () => {
    const impact = fillImpact(
      { kind: 'distance', text: '{x} km and {y} km', numbers: ['x', 7] },
      { x: 3, y: 7 },
    );
    expect(impact).toEqual({ kind: 'distance', text: '3 km and 7 km', numbers: [3, 7] });
    expect(() => fillImpact({ kind: 'none', text: 'x', numbers: ['absent'] }, {})).toThrow(
      'absent',
    );
    expect(() =>
      fillImpact({ kind: 'none', text: 'x', numbers: ['word'] }, { word: 'text' }),
    ).toThrow('word');
  });
});

describe('plan level', () => {
  it('is the worst block of the plan day when there is one', () => {
    expect(planLevel(makePlan({ aqi: aqiOk(40), worst: windowOf('severe', 300) }))).toBe('severe');
  });

  it('falls back to the AQI band, then to unknown', () => {
    expect(planLevel(makePlan({ aqi: aqiOk(250), worst: null }))).toBe('poor');
    expect(planLevel(makePlan({ aqi: INSUFFICIENT, worst: null }))).toBe('unknown');
  });

  it('counts poor, very poor and severe as poor or worse', () => {
    expect(['good', 'moderate', 'unknown'].some((l) => isPoorOrWorse(l as 'good'))).toBe(false);
    expect(['poor', 'very_poor', 'severe'].every((l) => isPoorOrWorse(l as 'poor'))).toBe(true);
  });
});

describe('source schema', () => {
  const base = { id: 'x', title: 'A document', url: 'https://example.org', status: 'P-FETCH' };

  it('accepts a fetched page with no quote and a read document with one', () => {
    expect(sourceRefSchema.safeParse(base).success).toBe(true);
    expect(
      sourceRefSchema.safeParse({ ...base, status: 'P-READ', quote: 'exact words' }).success,
    ).toBe(true);
  });

  it('rejects a read document with no quote, a sourced row with no https URL, and an unlabelled app rule', () => {
    expect(sourceRefSchema.safeParse({ ...base, status: 'P-READ' }).success).toBe(false);
    expect(sourceRefSchema.safeParse({ ...base, url: '' }).success).toBe(false);
    expect(sourceRefSchema.safeParse({ ...base, status: 'APP', url: '' }).success).toBe(false);
    expect(
      sourceRefSchema.safeParse({ ...base, status: 'APP', url: '', title: 'Saans rule: a choice' })
        .success,
    ).toBe(true);
  });
});
