// How much fine particle air a rider breathes in each way of travelling, from one measured Delhi
// route. Layer: core (pure). The numbers are in src/data/commute-exposure.json with their sources.
import { z } from 'zod';

import { sourceRefSchema } from '@/core/source';
import { roundToFive } from '@/core/format';
import { MODES } from '@/core/profile/schema';
import type { Mode } from '@/core/types';
import exposureJson from '@/data/commute-exposure.json';

// The data file: the study's context, the smallest gain worth reporting in percent, the fixed
// texts that go with a gain, and one in-vehicle to ambient ratio for every mode.
const exposureSchema = z.strictObject({
  context: z.string().min(1),
  minimumReportedPercent: z.number().positive(),
  exposureNote: z.string().min(1),
  caveat: z.string().min(1),
  carNote: z.string().min(1),
  // As many rows as there are modes, so a mode added to the app fails the load until it has one.
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

/** The exposure data, parsed once at load so a mistake in the file fails the tests. */
export const EXPOSURE = exposureSchema.parse(exposureJson);

// One mode's row: its ratio, the phrase used in the text and its source.
type ModeRow = (typeof EXPOSURE.modes)[number];

// The row for a mode. Throws when the data has none.
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
  // The ratios are each against the ambient air, so their quotient is the change in what is
  // breathed: a ratio that halves is a 50% gain.
  const raw = (1 - after.ratio / before.ratio) * 100;
  // A worse or equal ratio gives a negative or zero raw value, so it is also null here.
  if (raw < EXPOSURE.minimumReportedPercent) return null;
  return {
    less: roundToFive(raw),
    fromPhrase: before.phrase,
    toPhrase: after.phrase,
    // The source cited is the one for the mode travelled to.
    source: after.source,
  };
}
