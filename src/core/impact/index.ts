import { z } from 'zod';

import { displayPm25, percentLess } from '@/core/plan/pm25';
import { sourceRefSchema } from '@/core/source';
import type { Impact } from '@/core/plan/types';
import { AGE_BANDS } from '@/core/profile/schema';
import type { SourceRef } from '@/core/source';
import type { AgeBand, Intensity } from '@/core/types';
import inhalationJson from '@/data/inhalation.json';

export { percentLess } from '@/core/plan/pm25';

const rateSchema = z.number().positive();
const inhalationSchema = z.strictObject({
  unit: z.string(),
  source: sourceRefSchema,
  rows: z.array(
    z.strictObject({
      years: z.string(),
      sleep: rateSchema,
      sedentary: rateSchema,
      light: rateSchema,
      moderate: rateSchema,
      high: rateSchema,
      source: sourceRefSchema,
    }),
  ),
  ageBands: z.record(
    z.enum(AGE_BANDS),
    z.strictObject({ row: z.string(), source: sourceRefSchema }),
  ),
});

// Parsed once at load, so a typo in the table fails every test instead of skewing an impact.
export const INHALATION = inhalationSchema.parse(inhalationJson);

export const INDOORS_TEXT = 'Avoids the outdoor air. Indoor air is usually cleaner but not clean.';

/**
 * EPA mean breathing rates for an age band at an intensity and at rest-like light activity, in m3 per
 * minute. `source` is the rule that picks the EPA row for this age band.
 */
export function breathingRate(
  ageBand: AgeBand,
  intensity: Intensity,
): { rate: number; light: number; source: SourceRef } {
  const mapping = INHALATION.ageBands[ageBand];
  const row = INHALATION.rows.find((r) => r.years === mapping.row);
  if (!row) throw new Error(`No inhalation row for ${mapping.row}`);
  const rate =
    intensity === 'vigorous' ? row.high : intensity === 'moderate' ? row.moderate : row.light;
  return { rate, light: row.light, source: mapping.source };
}

/** Nothing changes, so there is nothing to quantify. */
export function noChangeImpact(text: string): Impact {
  return { kind: 'none', text, numbers: [] };
}

export function indoorsImpact(): Impact {
  return { kind: 'indoors', text: INDOORS_TEXT, numbers: [] };
}

/**
 * Same activity, same length, different hour: the breathing rate cancels, so the saving is just the
 * fall in PM2.5. `before` and `after` are unrounded means; the text shows them rounded.
 */
export function timingImpact(before: number, after: number): Impact {
  const percent = percentLess(before, after);
  const [was, now] = [displayPm25(before), displayPm25(after)];
  const shown = [...new Set([now, was])];
  if (percent === 0) {
    return {
      kind: 'timing',
      text: `A little cleaner air during this routine: PM2.5 of about ${String(now)} instead of about ${String(was)}.`,
      numbers: shown,
      percentLess: 0,
    };
  }
  return {
    kind: 'timing',
    text: `About ${String(percent)}% less PM2.5 during this routine: about ${String(now)} instead of about ${String(was)}.`,
    numbers: [...new Set([percent, ...shown])],
    percentLess: percent,
  };
}

/**
 * What easing off buys: the drop in air breathed per minute going from this intensity to light,
 * using EPA mean rates for the member's age band. Our ratio, not an EPA figure.
 */
export function intensityImpact(ageBand: AgeBand, intensity: Intensity): Impact {
  const { rate, light, source } = breathingRate(ageBand, intensity);
  const percent = percentLess(rate, light);
  if (intensity === 'light' || percent === 0) {
    return {
      kind: 'intensity',
      text: 'A shorter, gentler outing means less time breathing the outdoor air.',
      numbers: [],
    };
  }
  const effort = intensity === 'vigorous' ? 'hard effort' : 'steady effort';
  return {
    kind: 'intensity',
    text: `A light pace means breathing in about ${String(percent)}% less air each minute than ${effort}, so less PM2.5 gets in (based on US EPA breathing rates).`,
    numbers: [percent],
    percentLess: percent,
    source,
  };
}
