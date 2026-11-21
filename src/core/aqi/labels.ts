import { NAQI } from '@/core/aqi/breakpoints';
import type { Band } from '@/core/aqi/breakpoints';
import type { SourceRef } from '@/core/source';

export const BAND_LABEL = Object.fromEntries(
  NAQI.bands.map((entry) => [entry.band, entry.label]),
) as Record<Band, string>;

/** CPCB's own wording for what each category can do to health. */
export function healthStatement(b: Band): { text: string; source: SourceRef } {
  const entry = NAQI.bands.find((row) => row.band === b);
  if (!entry) throw new Error(`No health statement for ${b}`);
  return { text: entry.healthStatement, source: entry.source };
}
