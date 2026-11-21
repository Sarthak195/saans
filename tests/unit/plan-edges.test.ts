import { describe, expect, it } from 'vitest';

import { buildPlan } from '@/core/plan/build-plan';
import { planFacts } from '@/core/plan/facts';
import { at, flatSeries, household, member, routine } from '../helpers/plan';

describe('plan edges', () => {
  it('refuses a routine that names a member who is not in the household', () => {
    const broken = household([member('m1', 'adult')], [routine({ id: 'r1', memberId: 'ghost' })]);
    expect(() =>
      buildPlan({ household: broken, series: flatSeries(50), now: at('2026-11-21', '10:00') }),
    ).toThrow('not in the household');
  });

  it('plans a day beyond the series as "no forecast yet" rather than failing', () => {
    const home = household([member('m1', 'older')], [routine({ id: 'r1', memberId: 'm1' })]);
    const plan = buildPlan({
      household: home,
      series: flatSeries(150),
      now: at('2026-12-30', '10:00'),
    });
    expect(plan.routines[0]).toMatchObject({ decision: 'keep', level: null, pm25: null });
    expect(plan.routines[0]?.reason.ruleId).toBe('no-data');
    expect(plan.glance.best).toBeNull();
    // The AQI is read at the last hour the series has, so the headline never invents a later one.
    expect(plan.air.dataHour).toBe('2026-11-26T23:00');
    expect(plan.air.hourly.every((h) => h.pm25 === null && h.level === null)).toBe(true);
    expect(planFacts(plan)).toContain(2.5);
  });

  it('accepts optional inputs passed through as undefined', () => {
    const home = household([member('m1', 'adult')], []);
    const plan = buildPlan({
      household: home,
      series: flatSeries(50),
      now: at('2026-11-21', '10:00'),
      day: undefined,
      question: undefined,
    });
    expect(plan.day.relative).toBe('today');
    expect(plan.answer).toBeUndefined();
    expect(
      planFacts(plan, { home: undefined, alternatives: undefined, community: undefined }),
    ).toContain(2.5);
  });

  it('keeps members and routines in household order with stable refs', () => {
    const home = household(
      [member('b', 'adult'), member('a', 'child')],
      [routine({ id: 'z', memberId: 'a' }), routine({ id: 'y', memberId: 'b' })],
    );
    const plan = buildPlan({
      household: home,
      series: flatSeries(50),
      now: at('2026-11-21', '10:00'),
    });
    expect(plan.routines.map((r) => [r.ref, r.memberRef, r.routineId])).toEqual([
      ['routine_1', 'member_2', 'z'],
      ['routine_2', 'member_1', 'y'],
    ]);
    expect(plan.members.map((m) => m.memberRef)).toEqual(['member_1', 'member_2']);
  });
});
