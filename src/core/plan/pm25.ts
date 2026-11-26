// Hourly PM2.5 helpers shared by the plan: the index by hour, means over hours, band ranks and
// percentage cuts. Layer: core (pure). Concentrations are in micrograms per cubic metre.
import type { AirSeries, HourStamp } from '@/core/air/types';
import type { Band } from '@/core/aqi';
import { roundToFive } from '@/core/format';

/** Valid hourly PM2.5 by hour. A missing, broken or non-finite reading is simply absent. */
export type PmIndex = ReadonlyMap<HourStamp, number>;

/** Builds the hourly PM2.5 index (micrograms per cubic metre), skipping bad hours. */
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
 * time is never assessed on a partial picture; without it the mean covers the hours that have data.
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

// The six bands from cleanest to worst; a band's position here is its rank.
const BAND_ORDER: readonly Band[] = [
  'good',
  'satisfactory',
  'moderate',
  'poor',
  'very_poor',
  'severe',
];

/** The position of a band from cleanest (0) to worst (5), so bands can be compared as numbers. */
export function bandRank(band: Band): number {
  return BAND_ORDER.indexOf(band);
}

/** True when the band is the minimum or worse. A null band (no data) never is. */
export function atLeast(band: Band | null, minimum: Band): boolean {
  return band !== null && bandRank(band) >= bandRank(minimum);
}

/**
 * Percent of `before` that `after` removes, clamped to 0 to 100 and rounded to the nearest 5, so a
 * worse `after` shows as 0 rather than a negative cut.
 */
export function percentLess(before: number, after: number): number {
  // Nothing to remove from a zero, negative or broken baseline (the test also catches NaN).
  if (!(before > 0)) return 0;
  const raw = ((before - after) / before) * 100;
  return roundToFive(Math.min(100, Math.max(0, raw)));
}
