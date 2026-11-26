// Picks the protection lines for a trip that has to happen, from the sourced protection rows.
// Layer: core (pure). Children get no mask lines; their rows give shorter, quieter trips.
import type { Band } from '@/core/aqi';
import { PROTECTION } from '@/core/plan/rules-data';
import type { AgeBand, Mode } from '@/core/types';

/**
 * Protection lines for a trip that has to happen. Children never get a mask instruction: respirators
 * are not made in their sizes, so their rows give shorter, quieter trips instead. Mask lines appear
 * only at Poor or worse (the car's windows-up line at any level). A trip with no mode given is
 * treated as an open one (the stricter case).
 */
export function protectionFor(mode: Mode | undefined, ageBand: AgeBand, level: Band): string[] {
  const wanted = mode ?? 'unspecified';
  // A row applies when its mode and age band match and, if it names levels, the level is listed.
  return PROTECTION.filter(
    (row) =>
      row.modes.includes(wanted) &&
      row.ages.includes(ageBand) &&
      (row.levels === undefined || row.levels.includes(level)),
  ).flatMap((row) => [...row.lines]);
}
