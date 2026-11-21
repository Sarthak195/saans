import type { AirSeries, HourStamp } from '@/core/air/types';
import type { Band } from '@/core/aqi';
import { roundToFive } from '@/core/format';

/** Valid hourly PM2.5 by hour. A missing, broken or non-finite reading is simply absent. */
export type PmIndex = ReadonlyMap<HourStamp, number>;

export function pmIndex(series: AirSeries): PmIndex {
  const index = new Map<HourStamp, number>();
  for (const sample of series.hours) {
    if (sample.pm25 !== null && Number.isFinite(sample.pm25)) {
      // Sensor noise can dip below zero; that is clean air, not a negative concentration.
      index.set(sample.hour, Math.max(0, sample.pm25));
    }
  }
  return index;
}

/**
 * Mean PM2.5 over hours. With `requireAll` an hour without data makes the result null, so a candidate
 * time is never judged on a partial picture; without it the mean covers the hours that have data.
 */
export function meanOver(
  pm: PmIndex,
  hours: readonly HourStamp[],
  requireAll: boolean,
): number | null {
  let sum = 0;
  let count = 0;
  for (const hour of hours) {
    const value = pm.get(hour);
    if (value !== undefined) {
      sum += value;
      count += 1;
    } else if (requireAll) {
      return null;
    }
  }
  return count === 0 ? null : sum / count;
}

const BAND_ORDER: readonly Band[] = [
  'good',
  'satisfactory',
  'moderate',
  'poor',
  'very_poor',
  'severe',
];

export function bandRank(band: Band): number {
  return BAND_ORDER.indexOf(band);
}

export function atLeast(band: Band | null, minimum: Band): boolean {
  return band !== null && bandRank(band) >= bandRank(minimum);
}

/** Percent of `before` that `after` removes, clamped to 0 to 100 and rounded to the nearest 5. */
export function percentLess(before: number, after: number): number {
  if (!(before > 0)) return 0;
  const raw = ((before - after) / before) * 100;
  return roundToFive(Math.min(100, Math.max(0, raw)));
}
