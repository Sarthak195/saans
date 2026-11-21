import { describe, expect, it } from 'vitest';

import { buildPlan } from '@/core/plan/build-plan';
import { planFacts } from '@/core/plan/facts';
import type { QuestionTarget } from '@/core/plan/types';
import { extractNumbers } from '@/core/text';
import type { Routine } from '@/core/types';
import { at, household, member, routine, seriesOf } from '../helpers/plan';

function byHour(values: Record<number, number>, rest: number) {
  return seriesOf((_date, hour) => values[hour] ?? rest);
}

const MORNING = at('2026-11-21', '10:00');
const NIGHT = at('2026-11-21', '21:30');

function answerFor(
  series: ReturnType<typeof seriesOf>,
  question: QuestionTarget,
  routines: Routine[],
  now = MORNING,
  day?: 'today' | 'tomorrow' | 'day_after',
) {
  const plan = buildPlan({
    household: household([member('m1', 'adult'), member('m2', 'older')], routines),
    series,
    now,
    question,
    ...(day ? { day } : {}),
  });
  return { plan, answer: plan.answer };
}

const cricket = routine({
  id: 'r1',
  memberId: 'm1',
  kind: 'sport',
  intensity: 'vigorous',
  flexHours: 3,
});

describe('answering a question', () => {
  it('builds the answer from computed values only', () => {
    const { answer } = answerFor(byHour({ 14: 140 }, 245), { routineId: 'r1' }, [cricket]);
    expect(answer?.text).toBe(
      'Not this evening outdoors: PM2.5 around 17:00 is forecast at about 245 (Very Poor). 14:00 to 15:00 is cleaner at about 140, about 45% less.',
    );
    expect(answer?.routineRef).toBe('routine_1');
    expect(answer?.shiftedToNextDay).toBe(false);
    expect(answer?.numbers).toEqual([17, 0, 245, 14, 15, 140, 45]);
  });

  it('says the evening is over and answers for tomorrow when the question was about today', () => {
    const { answer, plan } = answerFor(
      byHour({ 14: 140 }, 245),
      { routineId: 'r1', aboutToday: true },
      [cricket],
      NIGHT,
    );
    expect(plan.day.relative).toBe('tomorrow');
    expect(answer?.shiftedToNextDay).toBe(true);
    expect(
      answer?.text.startsWith(
        'This evening is already over, so here is tomorrow. Not tomorrow evening outdoors:',
      ),
    ).toBe(true);
  });

  it('does not shift when the question is about today and today is still open', () => {
    const { answer } = answerFor(byHour({}, 245), { routineId: 'r1', aboutToday: true }, [cricket]);
    expect(answer?.shiftedToNextDay).toBe(false);
    expect(answer?.text).not.toContain('already over');
  });

  it('does not shift when the family chose tomorrow in the morning', () => {
    const { answer } = answerFor(
      byHour({}, 245),
      { routineId: 'r1', aboutToday: true },
      [cricket],
      MORNING,
      'tomorrow',
    );
    expect(answer?.shiftedToNextDay).toBe(false);
    expect(answer?.text).toContain('tomorrow evening');
  });

  it('names the weekday when the plan day is the day after tomorrow', () => {
    const { answer } = answerFor(
      byHour({}, 245),
      { routineId: 'r1' },
      [cricket],
      MORNING,
      'day_after',
    );
    expect(answer?.text).toContain('Monday evening');
  });

  it('matches by member and the nearest start hour', () => {
    const routines = [
      routine({ id: 'r1', memberId: 'm1', start: '06:00', flexHours: 0 }),
      routine({ id: 'r2', memberId: 'm1', start: '17:00', flexHours: 0 }),
      routine({ id: 'r3', memberId: 'm2', start: '16:00', flexHours: 0 }),
    ];
    const { answer } = answerFor(byHour({}, 100), { memberId: 'm1', hour: 16 }, routines);
    expect(answer?.routineRef).toBe('routine_2');
  });

  it('matches a member with no hour to the first routine the plan changes', () => {
    const routines = [
      routine({ id: 'r1', memberId: 'm1', start: '06:00', flexHours: 0, intensity: 'light' }),
      routine({ id: 'r2', memberId: 'm1', start: '17:00', flexHours: 0, intensity: 'moderate' }),
    ];
    const series = byHour({ 6: 20, 7: 20 }, 100);
    expect(answerFor(series, { memberId: 'm1' }, routines).answer?.routineRef).toBe('routine_2');
    expect(answerFor(flatLow(), { memberId: 'm1' }, routines).answer?.routineRef).toBe('routine_1');
  });

  it('matches by hour alone across the household', () => {
    const routines = [
      routine({ id: 'r1', memberId: 'm1', start: '06:00' }),
      routine({ id: 'r2', memberId: 'm2', start: '18:00' }),
    ];
    expect(answerFor(byHour({}, 100), { hour: 19 }, routines).answer?.routineRef).toBe('routine_2');
  });

  it('gives no answer when nothing matches', () => {
    expect(answerFor(byHour({}, 100), {}, [cricket]).answer).toBeUndefined();
    expect(answerFor(byHour({}, 100), { routineId: 'nope' }, [cricket]).answer).toBeUndefined();
    expect(answerFor(byHour({}, 100), { memberId: 'nobody' }, [cricket]).answer).toBeUndefined();
    expect(answerFor(byHour({}, 100), { hour: 17 }, []).answer).toBeUndefined();
  });

  it('answers each kind of decision in plain words', () => {
    const adult = (extra: Partial<Routine>) =>
      routine({ id: 'r1', memberId: 'm1', flexHours: 0, ...extra });
    expect(answerFor(byHour({}, 20), { routineId: 'r1' }, [adult({})]).answer?.text).toBe(
      'Yes, go ahead this evening: PM2.5 around 17:00 is forecast at about 20 (Good).',
    );
    expect(
      answerFor(byHour({}, 100), { routineId: 'r1' }, [adult({ intensity: 'light' })]).answer?.text,
    ).toBe(
      'Go lighter this evening: PM2.5 around 17:00 is forecast at about 100 (Poor). Keep it shorter and gentler.',
    );
    const older = routine({ id: 'r1', memberId: 'm2', flexHours: 0 });
    expect(answerFor(byHour({}, 100), { routineId: 'r1' }, [older]).answer?.text).toBe(
      'Not this evening outdoors: PM2.5 around 17:00 is forecast at about 100 (Poor). Staying indoors is the better choice, and no cleaner time was found.',
    );
    expect(
      answerFor(byHour({}, 300), { routineId: 'r1' }, [adult({ intensity: 'light' })]).answer?.text,
    ).toBe(
      'Not this evening outdoors: PM2.5 around 17:00 is forecast at about 300 (Severe). Staying indoors is the better choice.',
    );
    const trip = adult({ kind: 'commute', mode: 'car', intensity: 'light', start: '09:00' });
    expect(answerFor(byHour({}, 150), { routineId: 'r1' }, [trip]).answer?.text).toBe(
      'This trip stays this morning: PM2.5 around 09:00 is forecast at about 150 (Very Poor). Keep the car windows up and set the air conditioning to recirculate.',
    );
  });

  it('says so when the routine is not on the plan day or has no data', () => {
    const sundayOnly = routine({ id: 'r1', memberId: 'm1', days: ['sun'] });
    expect(answerFor(byHour({}, 100), { routineId: 'r1' }, [sundayOnly]).answer?.text).toBe(
      'That routine is not on Saturdays, so nothing changes.',
    );
    const noData = seriesOf(() => null);
    expect(answerFor(noData, { routineId: 'r1' }, [cricket]).answer?.text).toBe(
      'There is no air data for that time, so nothing is changed.',
    );
  });

  it('puts every number it states in the plan facts, with 245 Very Poor and 251 Severe', () => {
    const { plan, answer } = answerFor(byHour({ 14: 140 }, 245), { routineId: 'r1' }, [cricket]);
    const facts = planFacts(plan);
    for (const n of extractNumbers(answer?.text ?? '')) expect(facts).toContain(n);
    for (const impact of plan.routines.map((r) => r.impact)) {
      for (const n of extractNumbers(impact.text)) expect(facts).toContain(n);
    }
    expect(answer?.text).toContain('245 (Very Poor)');
    const severe = answerFor(byHour({}, 251), { routineId: 'r1' }, [cricket]).answer?.text;
    expect(severe).toContain('255 (Severe)');
    expect(severe).not.toContain('251');
  });
});

function flatLow() {
  return byHour({}, 20);
}
