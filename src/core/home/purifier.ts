// Checks a family's purifier against the size of their room. Core layer, pure arithmetic on the
// household's own numbers, using the sizing figure in the indoor data.
import { INDOOR } from '@/core/home/data';
import type { Home } from '@/core/types';

/**
 * How a purifier compares with the room: 'none' (room known, no purifier), 'unknown' (room size
 * not given), 'short' (rated below the need), 'spare' (above it) or 'match' (exactly the need).
 */
export type PurifierFit = 'none' | 'unknown' | 'short' | 'spare' | 'match';

/** Cubic metres per hour in one cfm; many purifiers sold in India give their CADR in m3/h. */
export const M3H_PER_CFM = 1.699;

/**
 * The clean air delivery rate (cfm) a room needs for particles: 0.65 cfm for each sq ft, which is
 * the US EPA chart for rooms with 8 ft ceilings. Taller ceilings get a note, not a scaled number,
 * because the EPA gives no formula for them.
 */
export function neededCadr(roomSqft: number): number {
  return Math.round(INDOOR.assumptions.cadrPerSqft.value * roomSqft);
}

/** The result of a purifier check. The numbers are in cfm and are left out when unknown. */
export interface PurifierCheck {
  fit: PurifierFit;
  /** The rate the room needs, in cfm. Set when the room size is known. */
  needed?: number;
  /** The purifier's own rate, in cfm. Set when a purifier was given. */
  have?: number;
  /** Shortfall when short, surplus when spare. */
  gap?: number;
}

/**
 * Compares the purifier's rate with what the room needs, both in cfm. Without a room size the fit
 * is 'unknown' and no numbers are returned. Without a purifier it is 'none', with the need only.
 */
export function checkPurifier(home: Pick<Home, 'roomSqft' | 'purifierCadrCfm'>): PurifierCheck {
  if (home.roomSqft === undefined) return { fit: 'unknown' };
  // The need is a whole number of cfm, so a rating equal to it counts as a match.
  const needed = neededCadr(home.roomSqft);
  const have = home.purifierCadrCfm;
  if (have === undefined) return { fit: 'none', needed };
  if (have < needed) return { fit: 'short', needed, have, gap: needed - have };
  if (have > needed) return { fit: 'spare', needed, have, gap: have - needed };
  return { fit: 'match', needed, have };
}
