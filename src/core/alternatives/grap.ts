// The GRAP reminder: which stage of Delhi NCR's Graded Response Action Plan an AQI falls in.
// Layer: core (pure). The stages and their wording are in src/data/grap.json, each with a source.
import { z } from 'zod';

import { fillTemplate } from '@/core/format';
import { sourceRefSchema } from '@/core/source';
import type { AqiToday } from '@/core/aqi';
import type { GrapNote } from '@/core/plan/types';
import type { Place } from '@/core/types';
import grapJson from '@/data/grap.json';

import { DELHI_NCR_ID, cityOf } from '@/core/alternatives/cities';

// The data file: an intro with a {stage} slot, and exactly four stages.
const grapSchema = z.strictObject({
  // The slot is required so every note names the stage it is about.
  intro: z.string().includes('{stage}'),
  stages: z
    .array(
      z.strictObject({
        stage: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
        // The schedule writes stages in Roman numerals, so the note does too.
        roman: z.enum(['I', 'II', 'III', 'IV']),
        // The AQI points, inclusive, at which the schedule lists this stage.
        from: z.number().int(),
        to: z.number().int(),
        line: z.string().min(1),
        // The document that sets the AQI range, and the one behind the measure quoted in `line`.
        trigger: sourceRefSchema,
        source: sourceRefSchema,
      }),
    )
    .length(4),
});

/** The GRAP stages and wording, parsed once at load so a mistake in the data fails the tests. */
export const GRAP = grapSchema.parse(grapJson);

/**
 * A reminder of which GRAP stage the day's AQI falls in, for places in Delhi NCR only. It says what
 * the schedule would apply at this AQI and sends the reader to CAQM for the stage actually in
 * force, because the stage is decided by the Commission from forecasts and not by this number alone.
 * Returns null when there is no AQI for the day, the place is not in Delhi NCR, or the AQI is
 * in no stage's range (for example below Stage I).
 */
export function grapNote(
  place: Pick<Place, 'name' | 'admin1' | 'lat' | 'lon'>,
  aqi: AqiToday,
): GrapNote | null {
  // The day has no AQI number (too few valid hours), so no stage can be named.
  if (aqi.kind !== 'ok') return null;
  // The schedule applies to the NCR only; no other city gets a GRAP note.
  if (cityOf(place)?.id !== DELHI_NCR_ID) return null;
  // Both ends of a range are inclusive. An AQI below the first range matches no stage.
  const row = GRAP.stages.find((s) => aqi.aqi >= s.from && aqi.aqi <= s.to);
  if (!row) return null;
  const intro = fillTemplate(GRAP.intro, { stage: row.roman });
  return { stage: row.stage, text: `${intro} ${row.line}`, source: row.source };
}
