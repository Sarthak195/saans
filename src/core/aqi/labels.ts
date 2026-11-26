// Display names and health statements for the six AQI bands. Layer: core (pure).
import { NAQI } from '@/core/aqi/breakpoints';
import type { Band } from '@/core/aqi/breakpoints';
import type { SourceRef } from '@/core/source';

/** The category name for each band, such as Very Poor, from the CPCB data. */
export const BAND_LABEL = Object.fromEntries(
  NAQI.bands.map((entry) => [entry.band, entry.label]),
) as Record<Band, string>;

/** CPCB's own wording for what a category can do to health, with its source. Throws if missing. */
export function healthStatement(b: Band): { text: string; source: SourceRef } {
  // The schema requires six entries, one per band, so a miss is a data error.
  const entry = NAQI.bands.find((row) => row.band === b);
  if (!entry) throw new Error(`No health statement for ${b}`);
  return { text: entry.healthStatement, source: entry.source };
}
