// Public entry point of the time module: Indian clock helpers and the plan's three days.
// Core layer: pure. Where the current time matters it is passed in, and no clock is read.

export { addHours, istIso, istParts } from '@/core/time/ist';
export type { IstParts } from '@/core/time/ist';
export { defaultPlanDay, hoursOf, planDays } from '@/core/time/plan-day';
export type { PlanDay } from '@/core/time/plan-day';
