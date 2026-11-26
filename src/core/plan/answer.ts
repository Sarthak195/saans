// Answers the family's question about one routine in a single sentence.
// Layer: core (pure). The text is built only from advice the plan already computed, so every
// number in it can be traced to the plan; nothing is looked up or generated here.
import { BAND_LABEL } from '@/core/aqi';
import type { Evaluated } from '@/core/plan/advice';
import { toMinutes } from '@/core/format';
import { WEEKDAY_FULL } from '@/core/plan/clock';
import type { DaySlot, QuestionAnswer, QuestionTarget, RoutineAdvice } from '@/core/plan/types';
import { numbersIn } from '@/core/plan/words';
import type { PlanDay } from '@/core/time';
import type { Weekday } from '@/core/types';

// The routine's start as hours after midnight, so two routines can be compared by distance.
function startHour(advice: RoutineAdvice): number {
  return toMinutes(advice.start) / 60;
}

/** The scheduled routine nearest an hour; with no hour, the first one the plan changes, else the first. */
function pick(candidates: Evaluated[], hour: number | undefined): Evaluated | undefined {
  // Prefer routines that run on the plan day; fall back to all of them only when none does.
  const scheduled = candidates.filter((c) => c.advice.scheduled);
  const pool = scheduled.length > 0 ? scheduled : candidates;
  // With no hour to go by, the routine that matters most is the first one the plan changes.
  if (hour === undefined) return pool.find((c) => c.advice.decision !== 'keep') ?? pool[0];
  // Strict comparison: on a tie the earlier routine in the list stays.
  let nearest: Evaluated | undefined;
  for (const c of pool) {
    if (
      !nearest ||
      Math.abs(startHour(c.advice) - hour) < Math.abs(startHour(nearest.advice) - hour)
    ) {
      nearest = c;
    }
  }
  return nearest;
}

/** By routine id, else by member and nearest start hour, else by hour alone. */
function matchRoutine(evaluated: Evaluated[], target: QuestionTarget): Evaluated | undefined {
  const byId =
    target.routineId === undefined
      ? undefined
      : evaluated.find((e) => e.advice.routineId === target.routineId);
  if (byId) return byId;
  if (target.memberId !== undefined) {
    const own = evaluated.filter((e) => e.advice.memberId === target.memberId);
    if (own.length > 0) return pick(own, target.hour);
  }
  return target.hour === undefined ? undefined : pick(evaluated, target.hour);
}

// Words for when the routine happens, such as "this evening" or "Friday morning".
function whenPhrase(day: PlanDay, slot: DaySlot): string {
  if (day.relative === 'today') return `this ${slot}`;
  if (day.relative === 'tomorrow') return `tomorrow ${slot}`;
  return `${WEEKDAY_FULL[day.weekday]} ${slot}`;
}

/** The next time an unscheduled routine runs: a later plan day with its own advice, or just the weekday. */
export interface NextRun {
  weekday: Weekday;
  later?: { found: Evaluated; day: PlanDay };
}

/** The routine a sentence ends up describing: the next run's day when the asked one is not on the plan day. */
function spokenAbout(found: Evaluated, next?: NextRun): Evaluated {
  return !found.advice.scheduled && next?.later ? next.later.found : found;
}

// The sentence that answers the question, written from the routine's computed advice alone.
function sentenceFor(found: Evaluated, day: PlanDay, next?: NextRun): string {
  const { advice } = found;
  if (!advice.scheduled) {
    // The routine is not on the plan day: say so, then point to its next run if there is one.
    const notOn = `That routine is not on ${WEEKDAY_FULL[day.weekday]}s`;
    if (next?.later) {
      const { later } = next;
      // The next run is described on its own day, without looking further ahead.
      return `${notOn}, so here is the next day it runs, ${WEEKDAY_FULL[later.day.weekday]}. ${sentenceFor(later.found, later.day)}`;
    }
    if (next) {
      return `${notOn}. It next runs on ${WEEKDAY_FULL[next.weekday]}, which this plan does not cover, so nothing changes yet.`;
    }
    return `${notOn}, so nothing changes.`;
  }
  // Without a forecast for the hours there is nothing to base an answer on, so nothing changes.
  if (advice.level === null || advice.pm25 === null) {
    return 'There is no air data for that time, so nothing is changed.';
  }
  const when = whenPhrase(day, advice.slot);
  const reading = `PM2.5 around ${advice.start} is forecast at about ${String(advice.pm25)} (${BAND_LABEL[advice.level]}).`;
  switch (advice.decision) {
    case 'keep':
      return `Yes, go ahead ${when}: ${reading}`;
    case 'lighten':
      return `Go lighter ${when}: ${reading} Keep it shorter and gentler.`;
    case 'move': {
      const w = advice.window;
      // No cleaner window was kept for the routine, so the sentence cannot name one.
      if (!w) return `Not ${when} outdoors: ${reading}`;
      // The "less" clause is left out when the move saves nothing.
      const percent = advice.impact.percentLess ?? 0;
      const less = percent > 0 ? `, about ${String(percent)}% less` : '';
      return `Not ${when} outdoors: ${reading} ${w.start} to ${w.end} is cleaner at about ${String(w.pm25)}${less}.`;
    }
    case 'indoors': {
      // moveFailed: another time was tried and none was good enough.
      const why = found.moveFailed ? ', and no cleaner time was found' : '';
      return `Not ${when} outdoors: ${reading} Staying indoors is the better choice${why}.`;
    }
    case 'essential':
      // Only the first protection line is quoted; trim drops the space left when there is none.
      return `This trip stays ${when}: ${reading} ${advice.protection[0] ?? ''}`.trim();
  }
}

/**
 * The answer to a family's question, built only from the matched routine's computed advice. When the
 * question was about today but today's evening is over, the plan day is tomorrow and the answer says so.
 */
export function buildAnswer(args: {
  target: QuestionTarget;
  evaluated: Evaluated[];
  day: PlanDay;
  shifted: boolean;
  /** For a routine that is not on the plan day: when it runs next, with the advice for that day. */
  nextRun?: (found: Evaluated) => NextRun | undefined;
}): QuestionAnswer | undefined {
  const found = matchRoutine(args.evaluated, args.target);
  // No routine matches the question: there is no computed advice to answer from.
  if (!found) return undefined;
  // The next run is looked up only for a routine that is not on the plan day.
  const next = found.advice.scheduled ? undefined : args.nextRun?.(found);
  const sentence = sentenceFor(found, args.day, next);
  // A question about a time already past is answered for tomorrow, and the text says so first.
  const text = args.shifted
    ? `This ${found.advice.slot} is already over, so here is tomorrow. ${sentence}`
    : sentence;
  return {
    text,
    routineRef: found.advice.ref,
    level: spokenAbout(found, next).advice.level,
    // The numbers the text states, kept so they can be checked against the plan's own numbers.
    numbers: numbersIn(text),
    shiftedToNextDay: args.shifted,
  };
}
