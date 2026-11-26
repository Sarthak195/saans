// Collects every number a person can see in a plan and its extras. The check on written text
// uses this set to refuse a number that did not come from the plan. Core layer: pure.
import { displayPm25, roundToFive } from '@/core/format';
import { clockNumbers } from '@/core/plan/clock';
import type {
  Alternative,
  CommunityPlan,
  GrapNote,
  HomeAdvice,
  Impact,
  Plan,
  Reason,
  Window,
} from '@/core/plan/types';
import { PM25_NAME_NUMBER } from '@/core/plan/words';
import { splitClockNumbers } from '@/core/text';

/**
 * The advice that sits beside the plan and is shown with it: home advice, alternatives, the
 * community plan and a GRAP note. Each part may be absent.
 */
export interface PlanExtras {
  home?: HomeAdvice[] | undefined;
  alternatives?: Alternative[] | undefined;
  community?: CommunityPlan | undefined;
  grap?: GrapNote | null | undefined;
}

/** What a written text may state: numbers, which of them are only clock readings, and names. */
export interface WrittenAllowance {
  /** Every number a text may state, sorted, without repeats. */
  numbers: number[];
  /** Those numbers that appear in the facts only as an hour or minute of the day. */
  clockOnly: number[];
  /** The place name and member labels, shown as written. Their numbers are allowed only inside them. */
  names: string[];
}

/**
 * Every number a person can see in the plan and its extras: readings, times, minutes, percentages,
 * counts and the numbers inside each generated sentence. A briefing may state only these (anything
 * else is a number the model made up), so this is the allowed set for the Gemini number check.
 * A number that is in the plan only as an hour or minute (the 20 of 20:00) may be written only as
 * a time, so it is listed in clockOnly. Numbers inside the place name and member labels are not
 * in the set: those are text the family chose, so they are allowed only as part of the exact name.
 */
export function writtenAllowance(plan: Plan, extras: PlanExtras = {}): WrittenAllowance {
  // Only names that contain a letter count as names (\p{L} matches a letter in any script).
  const names = [plan.place.name, ...plan.members.map((m) => m.label)].filter((n) =>
    /\p{L}/u.test(n),
  );
  // Numbers that may be written as they are. The 2.5 of 'PM2.5' is always allowed.
  const plain = new Set<number>([PM25_NAME_NUMBER]);
  // Numbers read as an hour or minute of the day.
  const clockSet = new Set<number>();
  const add = (...values: number[]): void => {
    for (const value of values) plain.add(value);
  };
  // Reads the numbers out of a sentence, sorting clock readings from plain numbers and skipping
  // the names.
  const text = (sentence: string): void => {
    const parts = splitClockNumbers(sentence, names);
    add(...parts.plain);
    for (const value of parts.clock) clockSet.add(value);
  };
  // Adds the hour and the minute of an 'HH:MM' time.
  const clock = (hhmm: string): void => {
    for (const value of clockNumbers(hhmm)) clockSet.add(value);
  };
  // 'YYYY-MM-DDTHH:MM' stamps show their time of day.
  const stamp = (value: string): void => {
    clock(value.slice(11, 16));
  };
  // Adds the two times and the PM2.5 of a window.
  const span = (w: Window | null): void => {
    if (w === null) return;
    clock(w.start);
    clock(w.end);
    add(w.pm25);
  };
  // Adds the listed numbers of an impact and those in its sentence.
  const impact = (i: Impact | undefined): void => {
    if (i === undefined) return;
    add(...i.numbers);
    text(i.text);
  };
  const reason = (r: Reason): void => {
    text(r.text);
  };

  // Day labels, then the counting numbers up to the larger of the routine and member counts.
  for (const day of [plan.day, ...plan.days]) text(day.label);
  for (let n = 1; n <= Math.max(plan.routines.length, plan.members.length); n += 1) add(n);

  // The air: times, grid position, today's AQI and the hourly strip.
  const { air } = plan;
  stamp(air.dataHour);
  stamp(air.fetchedAt);
  if (air.recordedOn !== undefined) text(air.recordedOn);
  add(air.gridLat, air.gridLon, air.aqi.validHours);
  if (air.aqi.kind === 'ok') {
    add(air.aqi.aqi);
    if (air.aqi.pm25Avg !== null) add(displayPm25(air.aqi.pm25Avg));
    if (air.aqi.pm10Avg !== null) add(roundToFive(air.aqi.pm10Avg));
  }
  for (const hour of air.hourly) {
    stamp(hour.hour);
    if (hour.pm25 !== null) add(hour.pm25);
  }

  // The glance: best and worst spans, airing advice and the top action.
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

  // Each routine's start, length, level reading, window, reason, protection lines and impact.
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
  // Each member's exposure totals.
  for (const member of plan.members)
    add(member.exposureUsual, member.exposurePlan, member.percentLess);
  if (plan.answer) {
    add(...plan.answer.numbers);
    text(plan.answer.text);
  }

  // The extras: home advice, alternatives, the GRAP note and the community plan.
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
  if (extras.grap) text(extras.grap.text);
  if (extras.community) {
    for (const action of extras.community.actions) {
      text(action.title);
      text(action.body);
      reason(action.reason);
    }
    span(extras.community.bestOutdoorWindow);
    impact(extras.community.aggregate);
  }

  // Sorts ascending so the result does not depend on the order the numbers were added in.
  const sorted = (values: Iterable<number>): number[] => [...values].sort((a, b) => a - b);
  return {
    numbers: sorted(new Set([...plain, ...clockSet])),
    // A number is clock-only when it was never added as a plain number.
    clockOnly: sorted([...clockSet].filter((n) => !plain.has(n))),
    names,
  };
}

/** Every number a written text may state, clock readings included. See writtenAllowance. */
export function planFacts(plan: Plan, extras: PlanExtras = {}): number[] {
  return writtenAllowance(plan, extras).numbers;
}
