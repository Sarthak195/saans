/**
 * What the plan advises for one outdoor routine. 'essential' marks a trip that cannot be dropped
 * (a commute or school run), so the advice is protection rather than cancellation.
 */
export const DECISIONS = ['keep', 'lighten', 'move', 'indoors', 'essential'] as const;
export type Decision = (typeof DECISIONS)[number];
