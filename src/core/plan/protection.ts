import { PROTECTION } from '@/core/plan/rules-data';
import type { AgeBand, Mode } from '@/core/types';

/**
 * Protection lines for a trip that has to happen. Children never get a mask instruction: respirators
 * are not made in their sizes, so their rows give shorter, quieter trips instead. A trip with no mode
 * given is treated as an open one (the stricter case).
 */
export function protectionFor(mode: Mode | undefined, ageBand: AgeBand): string[] {
  const wanted = mode ?? 'unspecified';
  return PROTECTION.filter(
    (row) => row.modes.includes(wanted) && row.ages.includes(ageBand),
  ).flatMap((row) => [...row.lines]);
}
