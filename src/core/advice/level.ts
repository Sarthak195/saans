// Reduces a plan to the single air level that home and community advice is assessed on. Pure: no
// clock, network or environment.
import type { Band } from '@/core/aqi';
import type { Plan } from '@/core/plan/types';

/** A band, or 'unknown' when the plan has no usable air data at all. */
export type PlanLevel = Band | 'unknown';

/**
 * The level that home and community advice is assessed on: the worst 3-hour block of the plan day,
 * because the advice is about that day's air and not about the trailing 24 hours behind the
 * headline AQI. When the day has no block, the AQI band stands in; with neither, 'unknown'.
 */
export function planLevel(plan: Plan): PlanLevel {
  if (plan.glance.worst) return plan.glance.worst.level;
  return plan.air.aqi.kind === 'ok' ? plan.air.aqi.band : 'unknown';
}

/** True for the three worst bands (poor, very poor, severe); false for 'unknown' and the rest. */
export function isPoorOrWorse(level: PlanLevel): boolean {
  return level === 'poor' || level === 'very_poor' || level === 'severe';
}
