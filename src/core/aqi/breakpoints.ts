// The CPCB breakpoint tables, parsed and checked once, with the lookups that read them.
// Layer: core (pure). The numbers live in src/data/naqi.json and each row carries its source;
// nothing here depends on the clock, network or environment.
import { z } from 'zod';

import { sourceRefSchema } from '@/core/source';
import naqiJson from '@/data/naqi.json';

/** The six CPCB air quality categories, from cleanest to worst. */
export const BANDS = ['good', 'satisfactory', 'moderate', 'poor', 'very_poor', 'severe'] as const;
/** One of the six category names in BANDS. */
export type Band = (typeof BANDS)[number];
const bandSchema = z.enum(BANDS);

/** CPCB prints eight pollutants; the app reads air data for six of them. */
export const TABLE_POLLUTANTS = ['pm10', 'pm25', 'no2', 'o3', 'co', 'so2', 'nh3', 'pb'] as const;
// A pollutant that has a printed breakpoint table.
type TablePollutant = (typeof TABLE_POLLUTANTS)[number];

// One printed row of a breakpoint table: the concentration range and the index range of a band.
const bandRowSchema = z.object({
  band: bandSchema,
  cLo: z.number().nonnegative(),
  // The printed table has no top for Severe ("430+").
  cHi: z.number().positive().nullable(),
  iLo: z.number().int().nonnegative(),
  iHi: z.number().int().positive(),
});

// Decimal places (0 to 3) the table prints for each pollutant.
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

// The shape of naqi.json: one table per pollutant, the band labels with CPCB's health statements,
// and the few rules the app adds on top of the printed tables.
const naqiSchema = z.object({
  breakpoints: z
    .array(
      z.object({
        pollutant: z.enum(TABLE_POLLUTANTS),
        unit: z.enum(['ug/m3', 'mg/m3']),
        averaging: z.enum(['24h', '8h']),
        // Exactly one row for each of the six bands.
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
  // Rules the app applies that the printed table does not state; each one carries its own source.
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
/** The parsed CPCB index data: breakpoint tables, band labels and the app's rounding rules. */
export const NAQI = naqiSchema.parse(naqiJson);

type BandRow = z.infer<typeof bandRowSchema>;

/** The six band rows for a pollutant, lowest band first. Throws if there is no table for it. */
export function breakpointsOf(pollutant: TablePollutant): readonly BandRow[] {
  const row = NAQI.breakpoints.find((entry) => entry.pollutant === pollutant);
  if (!row) throw new Error(`No NAQI breakpoints for ${pollutant}`);
  return row.bands;
}

/**
 * Rounds to the precision CPCB prints for that pollutant, so a value never falls between two
 * printed bands (PM2.5 is printed as whole numbers, so 30.4 is read as 30).
 */
export function roundToTable(pollutant: TablePollutant, concentration: number): number {
  const scale = 10 ** NAQI.appRules.rounding.decimals[pollutant];
  return Math.round(concentration * scale) / scale;
}

/**
 * The band a rounded concentration falls in. Where the table prints one edge in two adjacent bands
 * (CO 10 and 17, NH3 1200, Pb 0.5), the lower band wins; anything above the last printed top is Severe.
 */
export function bandRowFor(rows: readonly BandRow[], rounded: number): BandRow {
  // Rows run lowest band first, so the first row whose top reaches the value is its band.
  // Severe has no printed top (null) and never matches here, so it is the fallback below.
  const hit = rows.find((row) => row.cHi !== null && rounded <= row.cHi);
  const row = hit ?? rows[rows.length - 1];
  if (!row) throw new Error('Empty NAQI band list');
  return row;
}
