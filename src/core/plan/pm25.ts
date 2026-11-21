import type { AirSeries, HourStamp } from '@/core/air/types';
import { pm25Level } from '@/core/aqi';
import type { Band } from '@/core/aqi';

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

/**
 * PM2.5 as shown to a person: the nearest 5. Where that would print a number from the next band down
 * (251 is Severe but would print as 250, Very Poor), it steps up one so the number and its label agree.
 * Levels are always taken from the unrounded mean, never from this.
 */
export function displayPm25(mean: number): number {
  const rounded = Math.round(mean / 5) * 5;
  return pm25Level(rounded) === pm25Level(mean) ? rounded : rounded + 5;
}

/** Percent of `before` that `after` removes, clamped to 0 to 100 and rounded to the nearest 5. */
export function percentLess(before: number, after: number): number {
  if (!(before > 0)) return 0;
  const raw = ((before - after) / before) * 100;
  return Math.round(Math.min(100, Math.max(0, raw)) / 5) * 5;
}
