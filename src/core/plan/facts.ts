import { clockNumbers } from '@/core/plan/clock';
import { displayPm25 } from '@/core/plan/pm25';
import type {
  Alternative,
  CommunityPlan,
  HomeAdvice,
  Impact,
  Plan,
  Reason,
  Window,
} from '@/core/plan/types';
import { PM25_NAME_NUMBER } from '@/core/plan/words';
import { extractNumbers } from '@/core/text';

export interface PlanExtras {
  home?: HomeAdvice[];
  alternatives?: Alternative[];
  community?: CommunityPlan;
}

/**
 * Every number a person can see in the plan and its extras: readings, times, minutes, percentages,
 * counts and the numbers inside each generated sentence. A briefing may state only these (anything
 * else is a number the model made up), so the list is the allowed set for the Gemini number check.
 */
export function planFacts(plan: Plan, extras: PlanExtras = {}): number[] {
  const found = new Set<number>([PM25_NAME_NUMBER]);
  const add = (...values: number[]): void => {
    for (const value of values) found.add(value);
  };
  const text = (sentence: string): void => {
    add(...extractNumbers(sentence));
  };
  const clock = (hhmm: string): void => {
    add(...clockNumbers(hhmm));
  };
  // 'YYYY-MM-DDTHH:MM' stamps show their time of day.
  const stamp = (value: string): void => {
    clock(value.slice(11, 16));
  };
  const span = (w: Window | null): void => {
    if (w === null) return;
    clock(w.start);
    clock(w.end);
    add(w.pm25);
  };
  const impact = (i: Impact | undefined): void => {
    if (i === undefined) return;
    add(...i.numbers);
    text(i.text);
  };
  const reason = (r: Reason): void => {
    text(r.text);
  };

  for (const day of [plan.day, ...plan.days]) text(day.label);
  for (let n = 1; n <= Math.max(plan.routines.length, plan.members.length); n += 1) add(n);

  const { air } = plan;
  stamp(air.dataHour);
  stamp(air.fetchedAt);
  if (air.staleSince !== undefined) stamp(air.staleSince);
  if (air.recordedOn !== undefined) text(air.recordedOn);
  add(air.gridLat, air.gridLon, air.aqi.validHours);
  if (air.aqi.kind === 'ok') {
    add(air.aqi.aqi);
    if (air.aqi.pm25Avg !== null) add(displayPm25(air.aqi.pm25Avg));
    if (air.aqi.pm10Avg !== null) add(Math.round(air.aqi.pm10Avg / 5) * 5);
  }
  for (const hour of air.hourly) {
    stamp(hour.hour);
    if (hour.pm25 !== null) add(hour.pm25);
  }

  span(plan.glance.best);
  span(plan.glance.worst);
  const { airing } = plan.glance;
  if (airing.kind === 'window') {
    clock(airing.start);
    clock(airing.end);
    add(airing.pm25);
  } else if (airing.kind === 'keep_shut') {
    stamp(airing.leastBadHour);
    add(airing.pm25);
  }
  text(plan.glance.topAction);

  for (const routine of plan.routines) {
    clock(routine.start);
    add(routine.minutes);
    if (routine.pm25 !== null) add(routine.pm25);
    if (routine.window) span(routine.window);
    reason(routine.reason);
    for (const line of routine.protection) text(line);
    impact(routine.impact);
    if (routine.impact.percentLess !== undefined) add(routine.impact.percentLess);
  }
  for (const member of plan.members)
    add(member.exposureUsual, member.exposurePlan, member.percentLess);
  if (plan.answer) {
    add(...plan.answer.numbers);
    text(plan.answer.text);
  }

  for (const item of extras.home ?? []) {
    text(item.title);
    text(item.body);
    reason(item.reason);
    impact(item.impact);
  }
  for (const item of extras.alternatives ?? []) {
    text(item.title);
    text(item.body);
    reason(item.reason);
    impact(item.impact);
  }
  if (extras.community) {
    for (const action of extras.community.actions) {
      text(action.title);
      text(action.body);
      reason(action.reason);
    }
    span(extras.community.bestOutdoorWindow);
    impact(extras.community.aggregate);
  }

  return [...found].sort((a, b) => a - b);
}
