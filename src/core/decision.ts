// The list of decisions the plan can give for a routine, and the type made from it. The rules
// data is checked against this list. Core layer: pure.

/**
 * What the plan advises for one outdoor routine. 'essential' marks a trip that cannot be dropped
 * (a commute or school run), so the advice is protection rather than cancellation.
 */
export const DECISIONS = ['keep', 'lighten', 'move', 'indoors', 'essential'] as const;
/** One of the decisions in DECISIONS. */
export type Decision = (typeof DECISIONS)[number];
