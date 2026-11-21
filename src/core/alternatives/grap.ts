import { z } from 'zod';

import { fillTemplate } from '@/core/advice/format';
import { sourceRefSchema } from '@/core/source';
import type { AqiToday } from '@/core/aqi';
import type { GrapNote } from '@/core/plan/types';
import type { Place } from '@/core/types';
import grapJson from '@/data/grap.json';

import { DELHI_NCR_ID, cityOf } from '@/core/alternatives/cities';

const grapSchema = z.strictObject({
  intro: z.string().includes('{stage}'),
  stages: z
    .array(
      z.strictObject({
        stage: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
        // The schedule writes stages in Roman numerals, so the note does too.
        roman: z.enum(['I', 'II', 'III', 'IV']),
        from: z.number().int(),
        to: z.number().int(),
        line: z.string().min(1),
        trigger: sourceRefSchema,
        source: sourceRefSchema,
      }),
    )
    .length(4),
});

export const GRAP = grapSchema.parse(grapJson);

/**
 * A reminder of which GRAP stage the day's AQI falls in, for places in Delhi NCR only. It says what
 * the schedule would apply at this AQI and sends the reader to CAQM for the stage actually in
 * force, because the stage is decided by the Commission from forecasts and not by this number alone.
 */
export function grapNote(
  place: Pick<Place, 'name' | 'admin1' | 'lat' | 'lon'>,
  aqi: AqiToday,
): GrapNote | null {
  if (aqi.kind !== 'ok') return null;
  if (cityOf(place)?.id !== DELHI_NCR_ID) return null;
  const row = GRAP.stages.find((s) => aqi.aqi >= s.from && aqi.aqi <= s.to);
  if (!row) return null;
  const intro = fillTemplate(GRAP.intro, { stage: row.roman });
  return { stage: row.stage, text: `${intro} ${row.line}`, source: row.source };
}
