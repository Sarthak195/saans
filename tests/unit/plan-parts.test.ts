import { describe, expect, it } from 'vitest';

import { BAND_LABEL, pm25Level } from '@/core/aqi';
import { displayPm25, fillTemplate } from '@/core/format';
import {
  INDOORS_TEXT,
  breathingRate,
  indoorsImpact,
  intensityImpact,
  noChangeImpact,
  percentLess,
  timingImpact,
} from '@/core/impact';
import { meanOver, pmIndex } from '@/core/plan/pm25';
import { protectionFor } from '@/core/plan/protection';
import { sensitivityOf } from '@/core/plan/sensitivity';
import { numbersIn } from '@/core/plan/words';
import { AGE_BANDS, CONDITIONS } from '@/core/profile/schema';
import type { Member } from '@/core/types';
import { flatSeries, member } from '../helpers/plan';

describe('sensitivityOf', () => {
  it.each([
    ['infant', [], 'high'],
    ['under5', [], 'high'],
    ['older', [], 'high'],
    ['child', [], 'raised'],
    ['teen', [], 'raised'],
    ['adult', [], 'general'],
    ['adult', ['asthma_copd'], 'high'],
    ['adult', ['pregnancy'], 'high'],
    ['child', ['heart'], 'high'],
  ] as const)('%s with %j is %s', (ageBand, conditions, expected) => {
    expect(sensitivityOf(member('m', ageBand, [...conditions]))).toBe(expected);
  });

  it('is high for any age band when any condition is listed', () => {
    for (const ageBand of AGE_BANDS) {
      for (const condition of CONDITIONS) {
        const m: Member = member('m', ageBand, [condition]);
        expect(sensitivityOf(m)).toBe('high');
      }
    }
  });
});

describe('PM2.5 display and labels', () => {
  it('shows 245 as Very Poor and 251 as Severe', () => {
    expect(displayPm25(245)).toBe(245);
    expect(BAND_LABEL[pm25Level(245)]).toBe('Very Poor');
    // 251 rounds to 250, which is Very Poor, so the shown number steps up to stay in its band.
    expect(displayPm25(251)).toBe(255);
    expect(BAND_LABEL[pm25Level(displayPm25(251))]).toBe('Severe');
    expect(BAND_LABEL[pm25Level(118)]).toBe('Poor');
  });

  it('never prints a number from a different band than the reading', () => {
    for (let tenths = 0; tenths <= 4000; tenths += 1) {
      const mean = tenths / 10;
      expect(pm25Level(displayPm25(mean))).toBe(pm25Level(mean));
      expect(Math.abs(displayPm25(mean) - mean)).toBeLessThanOrEqual(5);
      expect(displayPm25(mean) % 5).toBe(0);
    }
  });

  it('averages hours and treats gaps as the caller asks', () => {
    const pm = pmIndex({
      ...flatSeries(50),
      hours: [
        {
          hour: '2026-11-21T10:00',
          pm25: 40,
          pm10: null,
          no2: null,
          o3: null,
          co: null,
          so2: null,
        },
        {
          hour: '2026-11-21T11:00',
          pm25: null,
          pm10: null,
          no2: null,
          o3: null,
          co: null,
          so2: null,
        },
        {
          hour: '2026-11-21T12:00',
          pm25: 60,
          pm10: null,
          no2: null,
          o3: null,
          co: null,
          so2: null,
        },
        {
          hour: '2026-11-21T13:00',
          pm25: Number.NaN,
          pm10: null,
          no2: null,
          o3: null,
          co: null,
          so2: null,
        },
        {
          hour: '2026-11-21T14:00',
          pm25: -3,
          pm10: null,
          no2: null,
          o3: null,
          co: null,
          so2: null,
        },
      ],
    });
    const hours = ['2026-11-21T10:00', '2026-11-21T11:00', '2026-11-21T12:00'];
    expect(meanOver(pm, hours, false)).toBe(50);
    expect(meanOver(pm, hours, true)).toBeNull();
    expect(meanOver(pm, ['2026-11-21T11:00'], false)).toBeNull();
    expect(meanOver(pm, ['2026-11-21T13:00'], false)).toBeNull();
    // A reading below zero is clean air, not a negative amount.
    expect(meanOver(pm, ['2026-11-21T14:00'], false)).toBe(0);
  });
});

describe('impact', () => {
  it('states the percent less, rounded to 5, and lists every number it shows', () => {
    const impact = timingImpact(245, 140);
    expect(impact.kind).toBe('timing');
    expect(impact.percentLess).toBe(45);
    expect(impact.text).toBe(
      'About 45% less PM2.5 during this routine: about 140 instead of about 245.',
    );
    expect(impact.numbers).toEqual([45, 140, 245]);
  });

  it('keeps the percent between 0 and 100', () => {
    expect(percentLess(100, 150)).toBe(0);
    expect(percentLess(0, 0)).toBe(0);
    expect(percentLess(Number.NaN, 5)).toBe(0);
    expect(percentLess(100, 0)).toBe(100);
    expect(percentLess(100, -50)).toBe(100);
    expect(percentLess(100, 61)).toBe(40);
  });

  it('uses the EPA rates for the age band and marks stand-in rows as our rule', () => {
    expect(intensityImpact('child', 'vigorous').percentLess).toBe(75);
    expect(intensityImpact('child', 'moderate').percentLess).toBe(50);
    expect(intensityImpact('adult', 'vigorous').percentLess).toBe(75);
    expect(intensityImpact('adult', 'moderate').percentLess).toBe(55);
    expect(intensityImpact('older', 'moderate').source?.status).toBe('APP');
    expect(breathingRate('infant', 'vigorous').source.id).toBe('saans-inhalation-small');
    expect(breathingRate('teen', 'light').source.id).toBe('saans-inhalation-teen');
    expect(intensityImpact('adult', 'vigorous').numbers).toEqual([75]);
    expect(intensityImpact('adult', 'vigorous').text).toContain('based on US EPA breathing rates');
  });

  it('gives a light routine a plain note with no numbers', () => {
    const impact = intensityImpact('adult', 'light');
    expect(impact.numbers).toEqual([]);
    expect(impact.percentLess).toBeUndefined();
  });

  it('gives indoors no percentage and the fixed wording', () => {
    const impact = indoorsImpact();
    expect(impact.text).toBe(
      'Avoids the outdoor air. Indoor air is usually cleaner but not clean.',
    );
    expect(impact.text).toBe(INDOORS_TEXT);
    expect(impact.percentLess).toBeUndefined();
    expect(impact.numbers).toEqual([]);
    expect(noChangeImpact('No change.').kind).toBe('none');
  });
});

describe('protection for trips that stay', () => {
  it('gives a car windows up and recirculation', () => {
    expect(protectionFor('car', 'adult')).toEqual([
      'Keep the car windows up and set the air conditioning to recirculate.',
    ]);
    expect(protectionFor('car', 'child')).toHaveLength(1);
  });

  it.each(['two_wheeler', 'cycle', 'walk', 'auto'] as const)(
    'gives an adult on a %s trip a fitted N95',
    (mode) => {
      expect(protectionFor(mode, 'adult').join(' ')).toContain('well-fitted N95');
      expect(protectionFor(mode, 'teen').join(' ')).toContain('N95');
    },
  );

  it.each(['bus', 'metro_rail'] as const)(
    'tells an adult on %s to mask while waiting outside',
    (mode) => {
      expect(protectionFor(mode, 'older').join(' ')).toContain('while you wait outside');
    },
  );

  it.each(['infant', 'under5', 'child'] as const)('never tells a %s to wear an N95', (band) => {
    for (const mode of [undefined, 'walk', 'two_wheeler', 'auto', 'bus', 'metro_rail'] as const) {
      const lines = protectionFor(mode, band).join(' ');
      expect(lines).not.toMatch(/N95/i);
      expect(lines).toContain('not made in small children');
    }
  });

  it('treats a trip with no mode as an open one', () => {
    expect(protectionFor(undefined, 'adult').join(' ')).toContain('N95');
  });
});

describe('wording helpers', () => {
  it('fills placeholders and refuses an unknown one', () => {
    expect(fillTemplate('The air is {level}.', { level: 'Poor' })).toBe('The air is Poor.');
    expect(() => fillTemplate('Hello {who}', {})).toThrow('{who}');
  });

  it('reads the numbers in a sentence but not the 2.5 in PM2.5', () => {
    expect(numbersIn('PM2.5 around 17:30 is about 245 (Very Poor), about 40% less.')).toEqual([
      17, 30, 245, 40,
    ]);
  });
});
