import { describe, expect, it } from 'vitest';

import { BAND_LABEL, healthStatement } from '@/core/aqi';
import type { Band } from '@/core/aqi';
import { BANDS, NAQI, TABLE_POLLUTANTS, breakpointsOf } from '@/core/aqi/breakpoints';

describe('naqi data', () => {
  it('has a row for each of the eight CPCB pollutants and six bands each', () => {
    expect(NAQI.breakpoints.map((row) => row.pollutant)).toEqual([...TABLE_POLLUTANTS]);
    for (const row of NAQI.breakpoints) {
      expect(row.bands.map((b) => b.band)).toEqual([...BANDS]);
    }
  });

  it('carries a CPCB source on every breakpoint and band row', () => {
    for (const row of [...NAQI.breakpoints, ...NAQI.bands]) {
      expect(row.source.id).toBe('cpcb-naqi-2014');
      expect(row.source.title).toBe('CPCB National Air Quality Index (2014)');
      expect(row.source.status).toBe('P-READ');
      expect(row.source.url).toMatch(/^https:\/\/web\.archive\.org\//);
    }
  });

  it('marks the three Saans rules as APP with a readable title', () => {
    const { rounding, severeTop, coUnit } = NAQI.appRules;
    for (const rule of [rounding, severeTop, coUnit]) {
      expect(rule.source.status).toBe('APP');
      expect(rule.source.title).toMatch(/^Saans rule: /);
    }
  });

  it('has index ranges that tile 0 to 500 for every pollutant', () => {
    for (const p of TABLE_POLLUTANTS) {
      const rows = breakpointsOf(p);
      expect(rows[0]?.iLo).toBe(0);
      expect(rows.at(-1)?.iHi).toBe(500);
      rows.slice(1).forEach((row, i) => {
        expect(row.iLo).toBe((rows[i]?.iHi ?? 0) + 1);
      });
    }
  });

  it('prints the table values exactly', () => {
    const edges = (p: (typeof TABLE_POLLUTANTS)[number]): (number | null)[] =>
      breakpointsOf(p).map((b) => b.cHi);
    expect(edges('pm10')).toEqual([50, 100, 250, 350, 430, null]);
    expect(edges('pm25')).toEqual([30, 60, 90, 120, 250, null]);
    expect(edges('no2')).toEqual([40, 80, 180, 280, 400, null]);
    expect(edges('o3')).toEqual([50, 100, 168, 208, 748, null]);
    expect(edges('co')).toEqual([1.0, 2.0, 10, 17, 34, null]);
    expect(edges('so2')).toEqual([40, 80, 380, 800, 1600, null]);
    expect(edges('nh3')).toEqual([200, 400, 800, 1200, 1800, null]);
    expect(edges('pb')).toEqual([0.5, 1.0, 2.0, 3.0, 3.5, null]);
  });
});

describe('labels and health statements', () => {
  it('names the six bands as CPCB does', () => {
    expect(BAND_LABEL).toEqual({
      good: 'Good',
      satisfactory: 'Satisfactory',
      moderate: 'Moderately polluted',
      poor: 'Poor',
      very_poor: 'Very Poor',
      severe: 'Severe',
    });
  });

  it('returns the CPCB statement verbatim with its quoted source', () => {
    const good = healthStatement('good');
    expect(good.text).toBe('Minimal Impact');
    expect(good.source.quote).toBe('Minimal Impact');
    expect(healthStatement('satisfactory').text).toBe(
      'May cause minor breathing discomfort to sensitive people',
    );
    expect(healthStatement('severe').text).toBe(
      'May cause respiratory effects even on healthy people and serious health impacts on people with lung/heart diseases. The health impacts may be experienced even during light physical activity',
    );
  });

  it('has a distinct statement quoted in its own source for every band', () => {
    const seen = new Set<string>();
    for (const band of BANDS satisfies readonly Band[]) {
      const { text, source } = healthStatement(band);
      expect(source.quote).toBe(text);
      expect(source.status).toBe('P-READ');
      seen.add(text);
    }
    expect(seen.size).toBe(6);
  });
});
