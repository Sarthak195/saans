import { z } from 'zod';

import { sourceRefSchema } from '@/core/source';
import { roundToFive } from '@/core/format';
import { MODES } from '@/core/profile/schema';
import type { Mode } from '@/core/types';
import exposureJson from '@/data/commute-exposure.json';

const exposureSchema = z.strictObject({
  context: z.string().min(1),
  minimumReportedPercent: z.number().positive(),
  exposureNote: z.string().min(1),
  caveat: z.string().min(1),
  carNote: z.string().min(1),
  modes: z
    .array(
      z.strictObject({
        mode: z.enum(MODES),
        ratio: z.number().positive(),
        phrase: z.string().min(1),
        source: sourceRefSchema,
      }),
    )
    .length(MODES.length),
});

export const EXPOSURE = exposureSchema.parse(exposureJson);

type ModeRow = (typeof EXPOSURE.modes)[number];

function exposureRow(mode: Mode): ModeRow {
  const row = EXPOSURE.modes.find((r) => r.mode === mode);
  if (!row) throw new Error(`No commute exposure ratio for ${mode}`);
  return row;
}

/**
 * How much less fine particle air a rider breathes after changing mode, as a share of what they
 * breathed before, from the in-vehicle to ambient ratios measured on one Delhi route. Returns
 * null unless the measured difference is large enough to be worth saying, so a gap that is
 * within the study's noise is never shown as a gain. The share is rounded to the nearest 5.
 */
export function exposureLessPercent(
  from: Mode,
  to: Mode,
): { less: number; fromPhrase: string; toPhrase: string; source: ModeRow['source'] } | null {
  const before = exposureRow(from);
  const after = exposureRow(to);
  const raw = (1 - after.ratio / before.ratio) * 100;
  if (raw < EXPOSURE.minimumReportedPercent) return null;
  return {
    less: roundToFive(raw),
    fromPhrase: before.phrase,
    toPhrase: after.phrase,
    source: after.source,
  };
}
