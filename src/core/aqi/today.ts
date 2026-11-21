import type { AirSeries, HourSample, HourStamp } from '@/core/air/types';
import { bandOfIndex, subIndex } from '@/core/aqi/subindex';
import type { Band } from '@/core/aqi/subindex';
import { addHours } from '@/core/time/ist';

type Gas = 'no2' | 'o3' | 'co' | 'so2';

export type AqiToday =
  | {
      kind: 'ok';
      aqi: number;
      band: Band;
      responsible: 'pm25' | 'pm10';
      /** Mean over the window in ug/m3, or null when fewer than MIN_DAY_HOURS hours were valid. */
      pm25Avg: number | null;
      pm10Avg: number | null;
      /** Valid hours behind the headline: those of the responsible pollutant. */
      validHours: number;
      windowEnd: HourStamp;
      /** Window means in ug/m3 (CO as delivered), present only for gases with enough valid hours. */
      gases: Partial<Record<Gas, number>>;
    }
  | {
      kind: 'insufficient';
      /** The larger of the two particulate counts, so the caller can say how close it was. */
      validHours: number;
      windowEnd: HourStamp;
    };

export const WINDOW_HOURS = 24;
export const MIN_DAY_HOURS = 16;
export const GAS_8H_HOURS = 8;
export const MIN_GAS_8H_HOURS = 6;

interface Mean {
  mean: number;
  valid: number;
}

function meanOf(hours: readonly HourSample[], key: keyof Omit<HourSample, 'hour'>): Mean {
  let sum = 0;
  let valid = 0;
  for (const sample of hours) {
    const value = sample[key];
    // A NaN or infinite reading is a broken sensor value, so it counts as missing like a null does.
    if (value !== null && Number.isFinite(value)) {
      sum += value;
      valid += 1;
    }
  }
  return { mean: valid > 0 ? sum / valid : 0, valid };
}

function oneDecimal(n: number): number {
  return Math.round(n * 10) / 10;
}

function latestHourAtOrBefore(series: AirSeries, nowHour: HourStamp): HourStamp {
  // Stamps are fixed-width ISO text, so string order is time order.
  let latest: HourStamp | undefined;
  for (const sample of series.hours) {
    if (sample.hour <= nowHour && (latest === undefined || sample.hour > latest)) {
      latest = sample.hour;
    }
  }
  return latest ?? nowHour;
}

/**
 * The air quality index for the 24 hours ending at the latest hour of the series that is not after
 * nowHour. Particulates need 16 valid hours each; the headline is the worse of the valid ones.
 * Gases are reported beside it and never change the headline.
 */
export function aqiToday(series: AirSeries, nowHour: HourStamp): AqiToday {
  const windowEnd = latestHourAtOrBefore(series, nowHour);
  const windowStart = addHours(windowEnd, -(WINDOW_HOURS - 1));
  const window = series.hours.filter((s) => s.hour >= windowStart && s.hour <= windowEnd);

  const pm25 = meanOf(window, 'pm25');
  const pm10 = meanOf(window, 'pm10');
  const pm25Ok = pm25.valid >= MIN_DAY_HOURS;
  const pm10Ok = pm10.valid >= MIN_DAY_HOURS;

  if (!pm25Ok && !pm10Ok) {
    return { kind: 'insufficient', validHours: Math.max(pm25.valid, pm10.valid), windowEnd };
  }

  const i25 = pm25Ok ? subIndex('pm25', pm25.mean) : -1;
  const i10 = pm10Ok ? subIndex('pm10', pm10.mean) : -1;
  // A tie goes to PM2.5, the finer particle and the one the health guidance is written around.
  const responsible = i25 >= i10 ? 'pm25' : 'pm10';
  const aqi = Math.max(i25, i10);

  const gases: Partial<Record<Gas, number>> = {};
  const last8 = window.filter((s) => s.hour >= addHours(windowEnd, -(GAS_8H_HOURS - 1)));
  for (const gas of ['no2', 'so2'] as const) {
    const m = meanOf(window, gas);
    if (m.valid >= MIN_DAY_HOURS) gases[gas] = oneDecimal(m.mean);
  }
  for (const gas of ['o3', 'co'] as const) {
    const m = meanOf(last8, gas);
    if (m.valid >= MIN_GAS_8H_HOURS) gases[gas] = oneDecimal(m.mean);
  }

  return {
    kind: 'ok',
    aqi,
    band: bandOfIndex(aqi),
    responsible,
    pm25Avg: pm25Ok ? oneDecimal(pm25.mean) : null,
    pm10Avg: pm10Ok ? oneDecimal(pm10.mean) : null,
    validHours: responsible === 'pm25' ? pm25.valid : pm10.valid,
    windowEnd,
    gases,
  };
}
