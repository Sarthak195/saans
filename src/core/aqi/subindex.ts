// Turns a pollutant concentration into a CPCB sub-index and a band. Layer: core (pure).
// Concentrations are in micrograms per cubic metre; the tables come from breakpoints.ts.
import { NAQI, bandRowFor, breakpointsOf, roundToTable } from '@/core/aqi/breakpoints';
import type { Band } from '@/core/aqi/breakpoints';

export type { Band } from '@/core/aqi/breakpoints';
/** The pollutants the app reads air data for and can turn into a sub-index. */
export type Pollutant = 'pm25' | 'pm10' | 'no2' | 'o3' | 'co' | 'so2';

/**
 * The concentration as the table sees it: CO arrives in micrograms per cubic metre and CPCB prints
 * it in milligrams. Throws for a value that is not a finite number.
 */
function tableValue(p: Pollutant, concentration: number): number {
  if (!Number.isFinite(concentration)) {
    throw new RangeError(`Concentration must be a finite number: ${String(concentration)}`);
  }
  // Sensor noise can dip below zero; a negative concentration is clean air, not an error.
  const positive = Math.max(0, concentration);
  // CO is divided by 1000 (micrograms to milligrams per cubic metre) before rounding to the table.
  return roundToTable(p, p === 'co' ? positive / NAQI.appRules.coUnit.divisor : positive);
}

/**
 * CPCB sub-index Ip = (IHI - ILO) / (BHI - BLO) * (Cp - BLO) + ILO, rounded to a whole number.
 * Input is micrograms per cubic metre for every pollutant, including CO (as Open-Meteo gives it).
 */
export function subIndex(p: Pollutant, concentration: number): number {
  const value = tableValue(p, concentration);
  const row = bandRowFor(breakpointsOf(p), value);
  // Severe has no printed top: it runs to a multiple of its lower edge, and the index never exceeds the cap.
  const top = row.cHi ?? row.cLo * NAQI.appRules.severeTop.factor;
  // Linear interpolation inside the band row, as in the formula above.
  const ip = ((row.iHi - row.iLo) / (top - row.cLo)) * (value - row.cLo) + row.iLo;
  return Math.min(NAQI.appRules.severeTop.indexCap, Math.round(ip));
}

/** The band of a single hourly PM2.5 value, assessed on the PM2.5 breakpoints as a yardstick. */
export function pm25Level(ugm3: number): Band {
  return bandRowFor(breakpointsOf('pm25'), tableValue('pm25', ugm3)).band;
}

/**
 * The band an index number falls in: up to 50 is Good, 100 Satisfactory, 200 Moderate, 300 Poor,
 * 400 Very Poor, and anything higher Severe.
 */
export function bandOfIndex(index: number): Band {
  if (index <= 50) return 'good';
  if (index <= 100) return 'satisfactory';
  if (index <= 200) return 'moderate';
  if (index <= 300) return 'poor';
  if (index <= 400) return 'very_poor';
  return 'severe';
}
