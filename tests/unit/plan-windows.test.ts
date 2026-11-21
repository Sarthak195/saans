import { describe, expect, it } from 'vitest';

import { buildPlan } from '@/core/plan/build-plan';
import type { Plan, RoutineAdvice } from '@/core/plan/types';
import { at, household, member, routine, seriesOf } from '../helpers/plan';
import type { Member, Routine } from '@/core/types';

/** PM2.5 by hour of day, the same every day; hours not listed take `rest`. */
function byHour(values: Record<number, number>, rest: number) {
  return seriesOf((_date, hour) => values[hour] ?? rest);
}

function planFor(
  kind: Member['ageBand'],
  overrides: Partial<Routine>,
  series: ReturnType<typeof byHour>,
  now: Date,
  day?: 'today' | 'tomorrow' | 'day_after',
): { plan: Plan; advice: RoutineAdvice } {
  const plan = buildPlan({
    household: household(
      [member('m1', kind)],
      [routine({ id: 'r1', memberId: 'm1', ...overrides })],
    ),
    series,
    now,
    ...(day ? { day } : {}),
  });
  const advice = plan.routines[0];
  if (!advice) throw new Error('No routine advice');
  return { plan, advice };
}

// Friday 20 Nov and Saturday 21 Nov 2026 (IST).
const FRIDAY_MORNING = at('2026-11-20', '06:00');
const SATURDAY_MORNING = at('2026-11-21', '06:00');

describe('cleaner window guards', () => {
  const evening = byHour(
    { 12: 30, 13: 30, 14: 70, 15: 90, 16: 95, 17: 100, 18: 110, 19: 120 },
    100,
  );

  it('keeps a child out of school hours on a weekday', () => {
    const { advice } = planFor('child', { flexHours: 4 }, evening, FRIDAY_MORNING);
    expect(advice.decision).toBe('move');
    // 13:00 is cleanest but falls in the 08:00 to 14:00 school block, so the next best is 14:00.
    expect(advice.window?.start).toBe('14:00');
  });

  it('lets the same child have the cleanest hour on a Saturday', () => {
    const { advice } = planFor('child', { flexHours: 4 }, evening, SATURDAY_MORNING);
    expect(advice.window?.start).toBe('13:00');
  });

  it('lets a child use the cleanest hour when the routine gives free hours', () => {
    const { advice } = planFor(
      'child',
      { flexHours: 4, freeFrom: '12:00', freeTo: '15:00' },
      evening,
      FRIDAY_MORNING,
    );
    expect(advice.window?.start).toBe('13:00');
  });

  it('keeps a child within 07:00 to 19:00 even when evening hours are far cleaner', () => {
    const late = byHour({ 6: 5, 20: 5, 21: 5 }, 100);
    const { advice } = planFor(
      'child',
      { flexHours: 4, intensity: 'vigorous' },
      late,
      SATURDAY_MORNING,
    );
    expect(advice.window).toBeUndefined();
    // A child at Poor who cannot be moved stays in, since the school advice is to postpone running.
    expect(advice.decision).toBe('indoors');
  });

  it('offers nothing before 10:00 or after 19:00 on a Poor day', () => {
    const morning = byHour(
      { 4: 20, 5: 20, 6: 20, 7: 20, 8: 130, 9: 125, 10: 100, 11: 90, 12: 85 },
      150,
    );
    const { advice } = planFor(
      'adult',
      { kind: 'sport', start: '08:00', intensity: 'vigorous', flexHours: 4 },
      morning,
      at('2026-11-21', '03:00'),
    );
    expect(advice.decision).toBe('move');
    expect(advice.window?.start).toBe('12:00');
    expect(advice.window?.end).toBe('13:00');
  });

  it('does offer an early window on a day that is not Poor', () => {
    const earlyClean = byHour({ 6: 20, 7: 20, 8: 80 }, 45);
    const { advice } = planFor(
      'older',
      { kind: 'walk', start: '08:00', intensity: 'vigorous', flexHours: 3 },
      earlyClean,
      at('2026-11-21', '03:00'),
    );
    expect(advice.decision).toBe('move');
    // 06:00 and 07:00 tie; the one nearer the usual time wins.
    expect(advice.window?.start).toBe('07:00');
  });

  it('turns a move with no cleaner time into indoors or lighten and says so', () => {
    const flat = byHour({}, 100);
    const general = planFor('adult', { intensity: 'vigorous' }, flat, SATURDAY_MORNING).advice;
    expect(general.decision).toBe('lighten');
    expect(general.window).toBeUndefined();
    expect(general.reason.text).toContain('No cleaner time was found');

    const sensitive = planFor('older', { intensity: 'moderate' }, flat, SATURDAY_MORNING).advice;
    expect(sensitive.decision).toBe('indoors');
    expect(sensitive.reason.text).toContain(
      'No cleaner time was found, so indoors is the better choice.',
    );
    expect(sensitive.impact.kind).toBe('indoors');
  });

  it('does not offer a window with no flexible hours', () => {
    const { advice } = planFor('older', { flexHours: 0 }, evening, SATURDAY_MORNING);
    expect(advice.window).toBeUndefined();
    expect(advice.decision).toBe('indoors');
  });

  it('does not offer a slower improvement than the original is worth', () => {
    // 100 to 95 is a 5 percent cut inside the same band, so it is not worth moving.
    const small = byHour({ 16: 95, 18: 95 }, 100);
    const { advice } = planFor('older', { flexHours: 1 }, small, SATURDAY_MORNING);
    expect(advice.window).toBeUndefined();
  });

  it('offers a window for a drop of a band even when the cut is under a fifth', () => {
    // 91 is Poor and 90 is Moderately polluted: a cut of about 1 percent that still lowers the level.
    const edge = byHour({ 17: 91, 16: 90, 18: 90 }, 91);
    const { advice } = planFor('older', { flexHours: 1 }, edge, SATURDAY_MORNING);
    expect(advice.window?.level).toBe('moderate');
    expect(advice.impact.text).toContain('A little cleaner air');
    expect(advice.impact.text).not.toContain('about 0%');
  });

  it('offers no window before now when the plan day is today', () => {
    const { advice } = planFor(
      'adult',
      { start: '17:00', intensity: 'vigorous', flexHours: 4 },
      evening,
      at('2026-11-21', '15:00'),
    );
    expect(advice.window === undefined || advice.window.start >= '15:00').toBe(true);
    // 12:00 to 14:00 are the clean hours, and they are already past.
    expect(advice.window?.start).not.toBe('13:00');
  });

  it('keeps an adult inside their free hours', () => {
    const { advice } = planFor(
      'adult',
      { start: '17:00', intensity: 'vigorous', flexHours: 4, freeFrom: '15:00', freeTo: '19:00' },
      evening,
      SATURDAY_MORNING,
    );
    expect(advice.window?.start).toBe('15:00');
    expect(advice.window?.end).toBe('16:00');
  });

  it('never moves an essential trip', () => {
    const { advice } = planFor(
      'adult',
      { kind: 'commute', mode: 'two_wheeler', intensity: 'light', flexHours: 4 },
      evening,
      SATURDAY_MORNING,
    );
    expect(advice.decision).toBe('essential');
    expect(advice.window).toBeUndefined();
    expect(advice.protection.join(' ')).toContain('N95');
  });

  it('leaves a routine that is not on the plan weekday as it is', () => {
    const { advice } = planFor('adult', { days: ['mon'] }, evening, SATURDAY_MORNING);
    expect(advice.scheduled).toBe(false);
    expect(advice.decision).toBe('keep');
    expect(advice.level).toBeNull();
    expect(advice.pm25).toBeNull();
    expect(advice.reason.text).toBe(
      'This routine is not on Saturdays, so there is nothing to change.',
    );
  });

  it('keeps a routine with no air data as planned and says so', () => {
    const gap = seriesOf(() => null);
    const { advice, plan } = planFor('older', {}, gap, SATURDAY_MORNING);
    expect(advice.decision).toBe('keep');
    expect(advice.level).toBeNull();
    expect(advice.reason.ruleId).toBe('no-data');
    expect(plan.glance.best).toBeNull();
    expect(plan.glance.airing).toEqual({ kind: 'normal' });
    expect(plan.severe).toBe(false);
  });
});

describe('where a cleaner time may be offered', () => {
  const NOW = at('2026-11-21', '03:00');
  // The plan day is Saturday 21 Nov, so school hours do not come into it.

  it('does not move a sensitive person from one Poor hour to a slightly less Poor one', () => {
    // 119 to 95 is a cut of 20 percent, but both are Poor.
    const poor = byHour({ 16: 95 }, 119);
    const { advice } = planFor('older', { flexHours: 1, intensity: 'moderate' }, poor, NOW);
    expect(advice.window).toBeUndefined();
    expect(advice.decision).toBe('indoors');
    expect(advice.reason.text).toContain('No cleaner time was found');

    const moderate = byHour({ 16: 85 }, 119);
    const found = planFor('older', { flexHours: 1, intensity: 'moderate' }, moderate, NOW).advice;
    expect(found.window?.level).toBe('moderate');
  });

  it('does not move a child from Very Poor to Poor, but does from Poor to Moderate', () => {
    const light = { flexHours: 1, intensity: 'light' as const };
    const refused = planFor('child', light, byHour({ 16: 100 }, 200), NOW).advice;
    expect(refused.window).toBeUndefined();
    expect(refused.decision).toBe('lighten');

    const poor = byHour({ 16: 80 }, 119);
    const moved = planFor('child', { flexHours: 1, intensity: 'vigorous' }, poor, NOW).advice;
    expect(moved.decision).toBe('move');
    expect(moved.window?.level).toBe('moderate');
  });

  it('lets a healthy adult move from Very Poor to Poor but not to another Very Poor hour', () => {
    const hard = { flexHours: 1, intensity: 'vigorous' as const };
    // 200 to 150 is a cut of 25 percent, yet 150 is still Very Poor.
    const stillVeryPoor = planFor('adult', hard, byHour({ 16: 150 }, 200), NOW).advice;
    expect(stillVeryPoor.window).toBeUndefined();
    expect(stillVeryPoor.decision).toBe('indoors');

    const toPoor = planFor('adult', hard, byHour({ 16: 100 }, 200), NOW).advice;
    expect(toPoor.window?.level).toBe('poor');
  });

  it('keeps the 20 percent rule as an extra condition inside an acceptable band', () => {
    const hard = { flexHours: 1, intensity: 'vigorous' as const };
    expect(planFor('adult', hard, byHour({ 16: 105 }, 119), NOW).advice.window).toBeUndefined();
    expect(planFor('adult', hard, byHour({ 16: 95 }, 119), NOW).advice.window?.start).toBe('16:00');
  });

  it.each(['infant', 'under5', 'older'] as const)(
    'keeps %s within 07:00 to 19:00 on a day that is not Poor',
    (band) => {
      // 05:00 and 20:00 are far cleaner but outside the band; 07:00 and 17:00 are inside it.
      const series = byHour({ 4: 5, 5: 5, 6: 85, 7: 30, 17: 30, 18: 85, 20: 5, 21: 5 }, 70);
      const morning = planFor(
        band,
        { start: '06:00', flexHours: 3, intensity: 'vigorous' },
        series,
        NOW,
      );
      expect(morning.advice.level).toBe('moderate');
      expect(morning.advice.window?.start).toBe('07:00');
      const evening = planFor(
        band,
        { start: '18:00', flexHours: 3, intensity: 'vigorous' },
        series,
        NOW,
      );
      expect(evening.advice.window?.start).toBe('17:00');
    },
  );

  it('keeps a child out of school hours when the free hours run backwards', () => {
    const clean = byHour({ 9: 30, 10: 30, 11: 30, 15: 80 }, 100);
    const { advice } = planFor(
      'child',
      { flexHours: 4, freeFrom: '15:00', freeTo: '12:00', start: '12:00' },
      clean,
      FRIDAY_MORNING,
    );
    // 09:00 to 11:00 are the cleanest hours but fall in school time, so the first allowed hour is 15:00.
    expect(advice.window?.start).toBe('15:00');
  });
});

describe('the poor day guard applies to the routine own hours', () => {
  const NOW = at('2026-11-21', '03:00');
  const poorDay = (rest = 100) => byHour({ 12: 50, 13: 50, 14: 50 }, rest);

  it('moves a brisk early walk to the afternoon instead of lightening it', () => {
    const { advice } = planFor(
      'adult',
      { kind: 'walk', start: '06:00', minutes: 45, intensity: 'moderate', flexHours: 7 },
      poorDay(),
      NOW,
    );
    expect(advice.decision).toBe('move');
    expect(advice.reason.ruleId).toBe('poor-day-hours');
    expect(advice.reason.source.id).toBe('mohfw-advisory-2025');
    expect(advice.reason.text).toContain('morning and late evening');
    expect(advice.window?.start).toBe('12:00');
  });

  it('falls back to indoors when no cleaner time is found', () => {
    const { advice } = planFor(
      'adult',
      { kind: 'sport', start: '06:00', minutes: 45, intensity: 'vigorous', flexHours: 0 },
      poorDay(),
      NOW,
    );
    expect(advice.decision).toBe('indoors');
    expect(advice.reason.text).toContain('No cleaner time was found');
  });

  it('applies to a routine that runs past 19:00, even in a Moderate hour on a Poor day', () => {
    const late = planFor(
      'adult',
      { kind: 'sport', start: '18:30', minutes: 60, intensity: 'moderate', flexHours: 0 },
      byHour({ 18: 80, 19: 80 }, 130),
      NOW,
    ).advice;
    expect(late.level).toBe('moderate');
    expect(late.decision).toBe('indoors');
    expect(late.reason.ruleId).toBe('poor-day-hours');
  });

  it('leaves a routine inside 10:00 to 19:00 to the grid', () => {
    const { advice } = planFor(
      'adult',
      { kind: 'walk', start: '11:00', minutes: 30, intensity: 'moderate', flexHours: 0 },
      poorDay(),
      NOW,
    );
    expect(advice.reason.ruleId).toBe('poor-general-easier');
    expect(advice.decision).toBe('lighten');
  });

  it('keeps a light walk but adds the advice to avoid morning and late-evening walks', () => {
    const { advice } = planFor(
      'adult',
      { kind: 'walk', start: '06:30', minutes: 30, intensity: 'light', flexHours: 0 },
      poorDay(),
      NOW,
    );
    expect(advice.decision).toBe('lighten');
    expect(advice.reason.ruleId).toBe('poor-general-easier');
    expect(advice.reason.text).toContain(
      'Health advice on days with poor air is to avoid outdoor walks in the morning and late evening.',
    );
  });

  it('does not add the note to a light walk inside the daytime hours', () => {
    const { advice } = planFor(
      'adult',
      { kind: 'walk', start: '11:00', minutes: 30, intensity: 'light', flexHours: 0 },
      poorDay(),
      NOW,
    );
    expect(advice.reason.text).not.toContain('morning and late evening');
  });

  it('never turns an essential trip into a move', () => {
    const { advice } = planFor(
      'adult',
      {
        kind: 'commute',
        mode: 'walk',
        start: '07:00',
        minutes: 30,
        intensity: 'moderate',
        flexHours: 2,
      },
      poorDay(),
      NOW,
    );
    expect(advice.decision).toBe('essential');
    expect(advice.window).toBeUndefined();
  });

  it('does not apply on a day that is not Poor', () => {
    const { advice } = planFor(
      'adult',
      { kind: 'walk', start: '06:00', minutes: 45, intensity: 'moderate', flexHours: 0 },
      byHour({}, 40),
      NOW,
    );
    expect(advice.decision).toBe('keep');
    expect(advice.reason.ruleId).not.toBe('poor-day-hours');
  });
});
