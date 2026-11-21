import { z } from 'zod';

import { sourceRefSchema } from '@/core/source';
import naqiJson from '@/data/naqi.json';

export const BANDS = ['good', 'satisfactory', 'moderate', 'poor', 'very_poor', 'severe'] as const;
export type Band = (typeof BANDS)[number];
const bandSchema = z.enum(BANDS);

/** CPCB prints eight pollutants; the app reads air data for six of them. */
export const TABLE_POLLUTANTS = ['pm10', 'pm25', 'no2', 'o3', 'co', 'so2', 'nh3', 'pb'] as const;
export type TablePollutant = (typeof TABLE_POLLUTANTS)[number];

const bandRowSchema = z.object({
  band: bandSchema,
  cLo: z.number().nonnegative(),
  // The printed table has no top for Severe ("430+").
  cHi: z.number().positive().nullable(),
  iLo: z.number().int().nonnegative(),
  iHi: z.number().int().positive(),
});

const decimalsSchema = z.object({
  pm10: z.number().int().min(0).max(3),
  pm25: z.number().int().min(0).max(3),
  no2: z.number().int().min(0).max(3),
  o3: z.number().int().min(0).max(3),
  co: z.number().int().min(0).max(3),
  so2: z.number().int().min(0).max(3),
  nh3: z.number().int().min(0).max(3),
  pb: z.number().int().min(0).max(3),
});

const naqiSchema = z.object({
  breakpoints: z
    .array(
      z.object({
        pollutant: z.enum(TABLE_POLLUTANTS),
        unit: z.enum(['ug/m3', 'mg/m3']),
        averaging: z.enum(['24h', '8h']),
        bands: z.array(bandRowSchema).length(BANDS.length),
        source: sourceRefSchema,
      }),
    )
    .length(TABLE_POLLUTANTS.length),
  bands: z
    .array(
      z.object({
        band: bandSchema,
        label: z.string().min(1),
        indexLo: z.number().int(),
        indexHi: z.number().int(),
        healthStatement: z.string().min(1),
        source: sourceRefSchema,
      }),
    )
    .length(BANDS.length),
  appRules: z.object({
    rounding: z.object({ decimals: decimalsSchema, source: sourceRefSchema }),
    severeTop: z.object({
      factor: z.number().gt(1),
      indexCap: z.number().int().positive(),
      source: sourceRefSchema,
    }),
    coUnit: z.object({ divisor: z.number().positive(), source: sourceRefSchema }),
  }),
});

// Parsed once at load: a typo in the data fails every test instead of mis-scoring a day of air.
export const NAQI = naqiSchema.parse(naqiJson);

export type BandRow = z.infer<typeof bandRowSchema>;

export function breakpointsOf(pollutant: TablePollutant): readonly BandRow[] {
  const row = NAQI.breakpoints.find((entry) => entry.pollutant === pollutant);
  if (!row) throw new Error(`No NAQI breakpoints for ${pollutant}`);
  return row.bands;
}

/** Rounds to the precision CPCB prints for that pollutant, so a value never falls between two printed bands. */
export function roundToTable(pollutant: TablePollutant, concentration: number): number {
  const scale = 10 ** NAQI.appRules.rounding.decimals[pollutant];
  return Math.round(concentration * scale) / scale;
}

/**
 * The band a rounded concentration falls in. Where the table prints one edge in two adjacent bands
 * (CO 10 and 17, NH3 1200, Pb 0.5), the lower band wins; anything above the last printed top is Severe.
 */
export function bandRowFor(rows: readonly BandRow[], rounded: number): BandRow {
  const hit = rows.find((row) => row.cHi !== null && rounded <= row.cHi);
  const row = hit ?? rows[rows.length - 1];
  if (!row) throw new Error('Empty NAQI band list');
  return row;
}
