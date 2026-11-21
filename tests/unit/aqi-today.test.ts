import { describe, expect, it } from 'vitest';

import type { AirSeries, HourSample, HourStamp } from '@/core/air/types';
import { aqiToday } from '@/core/aqi';
import { addHours } from '@/core/time';

const START: HourStamp = '2026-11-22T00:00';
const NOW: HourStamp = '2026-11-22T23:00';

type Values = Partial<Omit<HourSample, 'hour'>>;

const BLANK: Omit<HourSample, 'hour'> = {
  pm25: null,
  pm10: null,
  no2: null,
  o3: null,
  co: null,
  so2: null,
};

/** 48 hourly samples from START; `at` may override single hours, `base` applies to all. */
function series(base: Values, at: (i: number) => Values = () => ({}), count = 48): AirSeries {
  const hours = Array.from({ length: count }, (_, i) => ({
    hour: addHours(START, i),
    ...BLANK,
    ...base,
    ...at(i),
  }));
  return {
    source: 'open-meteo-cams',
    gridLat: 28.6,
    gridLon: 77.2,
    hours,
    fetchedAt: '2026-11-22T23:10:00+05:30',
  };
}

describe('aqiToday: completeness rule', () => {
  // The window ending 23:00 on the 22nd is hours 0..23 of the series.
  it('accepts exactly 16 valid hours', () => {
    const s = series({ pm25: 45, pm10: null }, (i) => (i >= 16 ? { pm25: null } : {}));
    const r = aqiToday(s, NOW);
    expect(r.kind).toBe('ok');
    if (r.kind === 'ok') {
      expect(r.validHours).toBe(16);
      expect(r.aqi).toBe(75);
    }
  });

  it('refuses 15 valid hours', () => {
    const s = series({ pm25: 45 }, (i) => (i >= 15 ? { pm25: null } : {}));
    expect(aqiToday(s, NOW)).toEqual({ kind: 'insufficient', validHours: 15, windowEnd: NOW });
  });

  it('skips nulls instead of counting them as zero', () => {
    // 16 hours at 90 and 8 nulls: the mean is 90, not 60.
    const s = series({ pm25: 90 }, (i) => (i % 3 === 2 ? { pm25: null } : {}));
    const r = aqiToday(s, NOW);
    expect(r.kind).toBe('ok');
    if (r.kind === 'ok') {
      expect(r.pm25Avg).toBe(90);
      expect(r.aqi).toBe(200);
    }
  });

  it('treats a non-finite reading as missing', () => {
    const s = series({ pm25: 45 }, (i) => (i < 9 ? { pm25: Number.NaN } : {}));
    expect(aqiToday(s, NOW).kind).toBe('insufficient');
  });

  it('is insufficient when the series has no particulate data at all', () => {
    expect(aqiToday(series({}), NOW)).toEqual({
      kind: 'insufficient',
      validHours: 0,
      windowEnd: NOW,
    });
  });

  it('only counts hours inside the trailing 24', () => {
    // Valid data in hours 0..23 of the series but the window ends at hour 30 and starts at 7: 17 fall inside it.
    const s = series({ pm25: 45 }, (i) => (i >= 24 ? { pm25: null } : {}));
    const r = aqiToday(s, '2026-11-23T06:00');
    expect(r.kind).toBe('ok');
    if (r.kind === 'ok') expect(r.validHours).toBe(17);
    const late = aqiToday(s, '2026-11-23T10:00');
    expect(late.kind).toBe('insufficient');
  });
});

describe('aqiToday: window end', () => {
  it('ends at the latest hour of the series not after nowHour', () => {
    const r = aqiToday(series({ pm25: 45 }), '2026-11-22T12:30');
    // Only 13 hours of the series precede it, so the result is insufficient but still names the window.
    expect(r).toEqual({ kind: 'insufficient', validHours: 13, windowEnd: '2026-11-22T12:00' });
  });

  it('ignores forecast hours after nowHour', () => {
    // History is clean, the forecast is awful: the headline must not move.
    const s = series({ pm25: 30 }, (i) => (i > 23 ? { pm25: 400 } : {}));
    const r = aqiToday(s, NOW);
    expect(r.kind === 'ok' && r.aqi).toBe(50);
  });

  it('reports nowHour as the window end when the series starts later', () => {
    const r = aqiToday(series({ pm25: 45 }), '2026-11-20T10:00');
    expect(r).toEqual({ kind: 'insufficient', validHours: 0, windowEnd: '2026-11-20T10:00' });
  });
});

describe('aqiToday: headline and responsible pollutant', () => {
  it('takes the worse of the particulate sub-indices', () => {
    // PM2.5 45 gives 75, PM10 200 gives 167.
    const r = aqiToday(series({ pm25: 45, pm10: 200 }), NOW);
    expect(r.kind).toBe('ok');
    if (r.kind === 'ok') {
      expect(r.aqi).toBe(167);
      expect(r.band).toBe('moderate');
      expect(r.responsible).toBe('pm10');
      expect(r.pm25Avg).toBe(45);
      expect(r.pm10Avg).toBe(200);
    }
  });

  it('names PM2.5 when it is the worse one', () => {
    const r = aqiToday(series({ pm25: 150, pm10: 120 }), NOW);
    expect(r.kind === 'ok' && r.responsible).toBe('pm25');
    expect(r.kind === 'ok' && r.band).toBe('very_poor');
  });

  it('names PM2.5 on a tie', () => {
    const r = aqiToday(series({ pm25: 30, pm10: 50 }), NOW);
    expect(r.kind === 'ok' && r.aqi).toBe(50);
    expect(r.kind === 'ok' && r.responsible).toBe('pm25');
  });

  it('uses the one valid particulate when the other has too few hours', () => {
    const s = series({ pm25: 45, pm10: 400 }, (i) => (i >= 10 ? { pm10: null } : {}));
    const r = aqiToday(s, NOW);
    expect(r.kind).toBe('ok');
    if (r.kind === 'ok') {
      expect(r.responsible).toBe('pm25');
      expect(r.aqi).toBe(75);
      expect(r.pm10Avg).toBeNull();
      expect(r.validHours).toBe(24);
    }
  });

  it('uses PM10 alone when PM2.5 is missing', () => {
    const r = aqiToday(series({ pm10: 100 }), NOW);
    expect(r.kind === 'ok' && r.responsible).toBe('pm10');
    expect(r.kind === 'ok' && r.pm25Avg).toBeNull();
  });

  it('rounds the 24 h mean to table precision before the lookup', () => {
    // Mean 30.5 rounds to 31, the first Satisfactory value.
    const r = aqiToday(series({ pm25: 30.5 }), NOW);
    expect(r.kind === 'ok' && r.aqi).toBe(51);
  });
});

describe('aqiToday: gases', () => {
  it('reports 24 h means for NO2 and SO2 and 8 h means for O3 and CO', () => {
    const s = series({ pm25: 45, no2: 60, so2: 20, o3: 80, co: 1200 });
    const r = aqiToday(s, NOW);
    expect(r.kind === 'ok' && r.gases).toEqual({ no2: 60, so2: 20, o3: 80, co: 1200 });
  });

  it('never lets a gas change the headline', () => {
    const s = series({ pm25: 30, no2: 900, so2: 5000, o3: 900, co: 90_000 });
    const r = aqiToday(s, NOW);
    expect(r.kind === 'ok' && r.aqi).toBe(50);
    expect(r.kind === 'ok' && r.responsible).toBe('pm25');
  });

  it('leaves out gases that are absent', () => {
    const r = aqiToday(series({ pm25: 45 }), NOW);
    expect(r.kind === 'ok' && r.gases).toEqual({});
  });

  it('needs 6 valid hours in the last 8 for O3 and CO', () => {
    // Hours 16..23 are the last 8. Nulling 2 of them leaves 6, nulling 3 leaves 5.
    const six = series({ pm25: 45, o3: 80, co: 1000 }, (i) =>
      i === 17 || i === 18 ? { o3: null, co: null } : {},
    );
    expect(aqiToday(six, NOW)).toMatchObject({ gases: { o3: 80, co: 1000 } });

    const five = series({ pm25: 45, o3: 80, co: 1000 }, (i) =>
      i >= 16 && i <= 18 ? { o3: null, co: null } : {},
    );
    expect(aqiToday(five, NOW)).toMatchObject({ gases: {} });
  });

  it('reads O3 and CO from the trailing 8 hours, not the whole day', () => {
    // Hours 0..15 are very high, the last 8 are low: the 8 h mean must ignore the earlier ones.
    const s = series({ pm25: 45, o3: 40, co: 800 }, (i) => (i < 16 ? { o3: 400, co: 9000 } : {}));
    expect(aqiToday(s, NOW)).toMatchObject({ gases: { o3: 40, co: 800 } });
  });

  it('leaves out a 24 h gas with too few hours', () => {
    const sparse = series({ pm25: 45, no2: 60, so2: 20 }, (i) =>
      i % 3 === 0 ? {} : { no2: null, so2: null },
    );
    expect(aqiToday(sparse, NOW)).toMatchObject({ gases: {} });
  });

  it('accepts a 24 h gas at exactly 16 valid hours', () => {
    const at16 = series({ pm25: 45, no2: 50 }, (i) => (i >= 16 ? { no2: null } : {}));
    expect(aqiToday(at16, NOW)).toMatchObject({ gases: { no2: 50 } });
    const at15 = series({ pm25: 45, no2: 50 }, (i) => (i >= 15 ? { no2: null } : {}));
    expect(aqiToday(at15, NOW)).toMatchObject({ gases: {} });
  });
});
