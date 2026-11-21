import { INDOOR } from '@/core/home/data';
import type { Home } from '@/core/types';

export type PurifierFit = 'none' | 'unknown' | 'short' | 'spare' | 'match';

/**
 * The clean air delivery rate (cfm) a room needs for particles: 0.65 cfm for each sq ft, which is
 * the US EPA chart for rooms with 8 ft ceilings. Taller ceilings get a note, not a scaled number,
 * because the EPA gives no formula for them.
 */
export function neededCadr(roomSqft: number): number {
  return Math.round(INDOOR.assumptions.cadrPerSqft.value * roomSqft);
}

export interface PurifierCheck {
  fit: PurifierFit;
  needed?: number;
  have?: number;
  /** Shortfall when short, surplus when spare. */
  gap?: number;
}

export function checkPurifier(home: Pick<Home, 'roomSqft' | 'purifierCadrCfm'>): PurifierCheck {
  if (home.roomSqft === undefined) return { fit: 'unknown' };
  const needed = neededCadr(home.roomSqft);
  const have = home.purifierCadrCfm;
  if (have === undefined) return { fit: 'none', needed };
  if (have < needed) return { fit: 'short', needed, have, gap: needed - have };
  if (have > needed) return { fit: 'spare', needed, have, gap: have - needed };
  return { fit: 'match', needed, have };
}
