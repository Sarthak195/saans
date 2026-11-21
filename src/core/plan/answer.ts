import { BAND_LABEL } from '@/core/aqi';
import type { Evaluated } from '@/core/plan/advice';
import { WEEKDAY_FULL, toMinutes } from '@/core/plan/clock';
import type { DaySlot, QuestionAnswer, QuestionTarget, RoutineAdvice } from '@/core/plan/types';
import { numbersIn } from '@/core/plan/words';
import type { PlanDay } from '@/core/time';

function startHour(advice: RoutineAdvice): number {
  return toMinutes(advice.start) / 60;
}

/** The scheduled routine nearest an hour; with no hour, the first one the plan changes, else the first. */
function pick(candidates: Evaluated[], hour: number | undefined): Evaluated | undefined {
  const scheduled = candidates.filter((c) => c.advice.scheduled);
  const pool = scheduled.length > 0 ? scheduled : candidates;
  if (hour === undefined) return pool.find((c) => c.advice.decision !== 'keep') ?? pool[0];
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
export function matchRoutine(
  evaluated: Evaluated[],
  target: QuestionTarget,
): Evaluated | undefined {
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

function whenPhrase(day: PlanDay, slot: DaySlot): string {
  if (day.relative === 'today') return `this ${slot}`;
  if (day.relative === 'tomorrow') return `tomorrow ${slot}`;
  return `${WEEKDAY_FULL[day.weekday]} ${slot}`;
}

function sentenceFor(found: Evaluated, day: PlanDay): string {
  const { advice } = found;
  if (!advice.scheduled) {
    return `That routine is not on ${WEEKDAY_FULL[day.weekday]}s, so nothing changes.`;
  }
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
      if (!w) return `Not ${when} outdoors: ${reading}`;
      const percent = advice.impact.percentLess ?? 0;
      const less = percent > 0 ? `, about ${String(percent)}% less` : '';
      return `Not ${when} outdoors: ${reading} ${w.start} to ${w.end} is cleaner at about ${String(w.pm25)}${less}.`;
    }
    case 'indoors': {
      const why = found.moveFailed ? ', and no cleaner time was found' : '';
      return `Not ${when} outdoors: ${reading} Staying indoors is the better choice${why}.`;
    }
    case 'essential':
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
}): QuestionAnswer | undefined {
  const found = matchRoutine(args.evaluated, args.target);
  if (!found) return undefined;
  const sentence = sentenceFor(found, args.day);
  const text = args.shifted
    ? `This ${found.advice.slot} is already over, so here is tomorrow. ${sentence}`
    : sentence;
  return {
    text,
    routineRef: found.advice.ref,
    numbers: numbersIn(text),
    shiftedToNextDay: args.shifted,
  };
}
