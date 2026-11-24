import { describe, expect, it } from 'vitest';

import { buildPlan } from '@/core/plan/build-plan';
import { SAMPLES } from '@/core/profile/samples';
import { RECORDED_IDS, fetchRecordedSeries } from '@/server/air/recorded';
import type { Plan } from '@/core/plan/types';
import type { Household, Routine } from '@/core/types';
import { at, flatSeries, household, member, routine, seriesOf } from '../helpers/plan';

function byHour(values: Record<number, number>, rest: number) {
  return seriesOf((_date, hour) => values[hour] ?? rest);
}

const SATURDAY = at('2026-11-21', '05:00');

function plan(
  series: ReturnType<typeof seriesOf>,
  routines: Routine[] = [],
  now = SATURDAY,
  day?: 'today' | 'tomorrow' | 'day_after',
): Plan {
  return buildPlan({
    household: household(
      [member('m1', 'adult'), member('m2', 'older'), member('m3', 'child')],
      routines,
    ),
    series,
    now,
    ...(day ? { day } : {}),
  });
}

describe('today at a glance', () => {
  it('finds the best and worst three hours between 06:00 and 22:00', () => {
    const { glance } = plan(byHour({ 6: 200, 7: 200, 8: 200, 12: 30, 13: 30, 14: 30 }, 100));
    expect(glance.best).toEqual({ start: '12:00', end: '15:00', pm25: 30, level: 'good' });
    expect(glance.worst).toEqual({ start: '06:00', end: '09:00', pm25: 200, level: 'very_poor' });
  });

  it('shows it even with no routines, and the earlier block wins a tie', () => {
    const { glance, routines } = plan(flatSeries(70));
    expect(routines).toEqual([]);
    expect(glance.best?.start).toBe('06:00');
    expect(glance.worst?.start).toBe('06:00');
    expect(glance.topAction).toBe('The cleanest 3 hours today are 06:00 to 09:00.');
  });

  it('only counts blocks with data in every hour', () => {
    const gaps = seriesOf((_d, hour) => (hour % 2 === 0 ? 50 : null));
    const { glance } = plan(gaps);
    expect(glance.best).toBeNull();
    expect(glance.worst).toBeNull();
    expect(glance.topAction).toBe('There is no air forecast for today yet. Check back later.');
  });

  it('reads the plan day, not today, when asked for another day', () => {
    const series = seriesOf((date, hour) =>
      date === '2026-11-23' && hour >= 6 && hour < 9 ? 20 : 120,
    );
    const { glance, day } = plan(series, [], SATURDAY, 'day_after');
    expect(day.relative).toBe('day_after');
    expect(glance.best?.start).toBe('06:00');
    expect(glance.best?.pm25).toBe(20);
    expect(glance.topAction).toContain('on Monday');
  });
});

describe('airing the home', () => {
  it('is normal on a Good to Moderately polluted day', () => {
    expect(plan(flatSeries(20)).glance.airing).toEqual({ kind: 'normal' });
    expect(plan(flatSeries(80)).glance.airing).toEqual({ kind: 'normal' });
  });

  it('is not normal when the day is clean on average but three hours of the waking day are Poor', () => {
    const series = byHour({ 6: 100, 7: 100, 8: 100 }, 20);
    const { glance } = plan(series);
    expect(glance.worst?.level).toBe('poor');
    expect(glance.airing.kind).toBe('window');
    // Two Poor hours in a row are not a three-hour spell.
    expect(plan(byHour({ 6: 100, 7: 100 }, 20)).glance.airing).toEqual({ kind: 'normal' });
    // A Poor spell in the middle of the night is outside the waking day.
    expect(plan(byHour({ 1: 100, 2: 100, 3: 100 }, 20)).glance.airing).toEqual({ kind: 'normal' });
  });

  it('picks the cleanest hour from 12:00 to 16:00 on a Poor day', () => {
    const series = byHour({ 12: 105, 13: 80, 14: 100, 15: 90 }, 110);
    expect(plan(series).glance.airing).toEqual({
      kind: 'window',
      start: '13:00',
      end: '14:00',
      pm25: 80,
    });
  });

  it('keeps the windows shut when even the best hour is Very Poor, naming the least bad hour', () => {
    const series = byHour({ 12: 190, 13: 175, 14: 180, 15: 200 }, 220);
    expect(plan(series).glance.airing).toEqual({
      kind: 'keep_shut',
      leastBadHour: '2026-11-21T13:00',
      pm25: 175,
    });
  });

  it('falls back to normal when the afternoon has no data', () => {
    const series = seriesOf((_d, hour) => (hour >= 12 && hour < 16 ? null : 120));
    expect(plan(series).glance.airing).toEqual({ kind: 'normal' });
  });
});

describe('severe days', () => {
  it('is severe when AQI today is 301 or more', () => {
    const p = plan(flatSeries(200));
    expect(p.air.aqi.kind === 'ok' && p.air.aqi.aqi).toBeGreaterThanOrEqual(301);
    expect(p.severe).toBe(true);
    expect(p.glance.topAction).toBe(
      'Keep hard exercise and outdoor play indoors today. If an adult has to make a trip, consider a well-fitted N95 or N99 mask; it may help on a short trip.',
    );
  });

  it('is severe when any three hours of the plan day are Very Poor or worse, even on a cleaner day today', () => {
    const series = seriesOf((date, hour) =>
      date === '2026-11-22' && hour >= 18 && hour < 21 ? 200 : 40,
    );
    expect(plan(series, [], SATURDAY, 'today').severe).toBe(false);
    expect(plan(series, [], SATURDAY, 'tomorrow').severe).toBe(true);
  });

  it('is not severe for two bad hours or for a Poor day', () => {
    const two = seriesOf((date, hour) =>
      date === '2026-11-21' && hour >= 18 && hour < 20 ? 150 : 40,
    );
    expect(plan(two).severe).toBe(false);
    expect(plan(flatSeries(110)).severe).toBe(false);
  });

  it('is severe tomorrow when today AQI is over 300, because the plan carries the caution', () => {
    const series = seriesOf((date) => (date === '2026-11-21' ? 220 : 30));
    const p = plan(series, [], at('2026-11-21', '23:00'));
    expect(p.day.relative).toBe('tomorrow');
    expect(p.severe).toBe(true);
  });
});

describe('the one action at the top', () => {
  const adultWalk = routine({
    id: 'r1',
    memberId: 'm1',
    kind: 'walk',
    intensity: 'vigorous',
    start: '17:00',
  });

  it('leads with indoors when any routine goes indoors', () => {
    const p = plan(byHour({}, 100), [
      adultWalk,
      routine({ id: 'r2', memberId: 'm2', flexHours: 0, start: '09:00' }),
    ]);
    expect(p.glance.topAction).toBe('Bring the routines marked indoors inside today.');
  });

  it('says move when a routine moves and nothing goes indoors', () => {
    const p = plan(byHour({ 14: 60 }, 105), [
      routine({
        id: 'r1',
        memberId: 'm1',
        kind: 'walk',
        intensity: 'vigorous',
        start: '15:00',
        flexHours: 1,
      }),
    ]);
    expect(p.routines[0]?.decision).toBe('move');
    expect(p.glance.topAction).toBe('Move the routines marked for a cleaner time today.');
  });

  it('says to protect trips that stay when that is the strongest action', () => {
    const p = plan(flatSeries(100), [
      routine({ id: 'r1', memberId: 'm1', kind: 'commute', mode: 'car', intensity: 'light' }),
    ]);
    expect(p.glance.topAction).toBe('Protect the trips that cannot change today, as listed below.');
  });

  it('says to go shorter and gentler when that is all the plan asks', () => {
    const p = plan(flatSeries(100), [routine({ id: 'r1', memberId: 'm1', intensity: 'light' })]);
    expect(p.routines[0]?.decision).toBe('lighten');
    expect(p.glance.topAction).toBe('Keep outdoor time shorter and gentler today.');
  });

  it('points to the cleaner hours when the day is Poor but every routine can stay', () => {
    const series = byHour({ 17: 70 }, 100);
    const p = plan(series, [routine({ id: 'r1', memberId: 'm1', intensity: 'light' })]);
    expect(p.routines[0]?.decision).toBe('keep');
    expect(p.glance.topAction).toBe(
      'The air is Poor today, so check the cleaner hours before heading out.',
    );
  });

  it('offers the cleanest hours when no routine is on the plan day', () => {
    const p = plan(flatSeries(100), [routine({ id: 'r1', memberId: 'm1', days: ['mon'] })]);
    expect(p.glance.topAction).toBe('The cleanest 3 hours today are 06:00 to 09:00.');
    const later = plan(
      flatSeries(100),
      [routine({ id: 'r1', memberId: 'm1', days: ['sun'] })],
      SATURDAY,
      'tomorrow',
    );
    expect(later.routines[0]?.scheduled).toBe(true);
  });

  it('keeps things as planned when every routine is fine', () => {
    const p = plan(flatSeries(20), [routine({ id: 'r1', memberId: 'm1' })]);
    expect(p.glance.topAction).toBe('Your routines can go ahead as planned today.');
  });

  it('treats a routine with no air data as no plan yet', () => {
    const series = seriesOf((_d, hour) => (hour === 17 ? null : 100));
    const p = plan(series, [routine({ id: 'r1', memberId: 'm1', start: '17:00', minutes: 30 })]);
    expect(p.routines[0]?.decision).toBe('keep');
    expect(p.glance.topAction).toContain('The cleanest 3 hours today');
  });
});

describe('member totals', () => {
  it('compares the exposure index as usual and with the plan', () => {
    const series = byHour({ 15: 50 }, 100);
    const p = plan(series, [
      routine({ id: 'r1', memberId: 'm1', intensity: 'light', start: '09:00' }),
      routine({ id: 'r2', memberId: 'm2', start: '09:00', minutes: 120, flexHours: 0 }),
      routine({
        id: 'r3',
        memberId: 'm2',
        start: '17:00',
        minutes: 60,
        flexHours: 2,
        kind: 'walk',
      }),
    ]);
    const [adult, older, child] = p.members;
    // The adult's gentle walk is only lightened, so the exposure index does not change.
    expect(adult).toMatchObject({
      exposureUsual: 100,
      exposurePlan: 100,
      percentLess: 0,
      memberRef: 'member_1',
      sensitivity: 'general',
    });
    // Older adult: 120 min indoors (200 to 0) and one hour moved from 100 to 50.
    expect(older).toMatchObject({
      exposureUsual: 300,
      exposurePlan: 50,
      percentLess: 85,
      memberRef: 'member_2',
      sensitivity: 'high',
    });
    expect(child).toMatchObject({
      exposureUsual: 0,
      exposurePlan: 0,
      percentLess: 0,
      memberRef: 'member_3',
    });
  });
});

describe('the top action and the routine decisions', () => {
  // Very Poor in the morning, only Moderately polluted from midday: the son's 17:00 cricket is
  // lightened, not brought indoors.
  const MORNING_SMOG = byHour({ 6: 200, 7: 200, 8: 200, 9: 200, 10: 200 }, 80);
  const cricket = routine({
    id: 'cricket',
    memberId: 'm3',
    kind: 'sport',
    start: '17:00',
    intensity: 'vigorous',
    flexHours: 0,
  });

  it('does not say hard exercise stays indoors while the plan only lightens the cricket', () => {
    const { glance, routines, severe } = plan(MORNING_SMOG, [cricket]);
    expect(severe).toBe(true);
    expect(routines[0]?.decision).toBe('lighten');
    expect(glance.topAction).not.toMatch(/^Keep hard exercise and outdoor play indoors/);
    expect(glance.topAction).toContain('the times the plan below picks for it');
  });

  it('keeps the plain indoors line when every hard routine is brought indoors', () => {
    const { glance, routines } = plan(flatSeries(200), [cricket]);
    expect(routines[0]?.decision).toBe('indoors');
    expect(glance.topAction).toMatch(/^Keep hard exercise and outdoor play indoors today\./);
  });

  it('keeps the plain indoors line on a severe day with no hard routine to contradict it', () => {
    const walk = routine({ id: 'walk', memberId: 'm2', kind: 'walk', intensity: 'light' });
    const { glance } = plan(flatSeries(200), [walk]);
    expect(glance.topAction).toMatch(/^Keep hard exercise and outdoor play indoors today\./);
  });
});

describe('the top action never contradicts the routine decisions', () => {

  function contradictions(home: Household, p: Plan): string[] {
    const found: string[] = [];
    const text = p.glance.topAction;
    const scheduled = p.routines.filter((r) => r.scheduled);
    const decisions = new Set(scheduled.map((r) => r.decision));
    const hardStays = scheduled.some((r) => {
      const source = home.routines.find((x) => x.id === r.routineId);
      const hard = source?.intensity !== 'light' || r.kind === 'sport' || r.kind === 'outdoor_play';
      return hard && r.decision !== 'indoors';
    });
    if (text.startsWith("Keep hard exercise and outdoor play indoors") && hardStays)
      found.push('indoors line with a hard routine that stays');
    if (text.includes('go ahead as planned') && [...decisions].some((d) => d !== 'keep'))
      found.push('go-ahead line with a changed routine');
    if (text.startsWith("Bring the routines marked indoors") && !decisions.has('indoors'))
      found.push('indoors line with no routine indoors');
    if (text.startsWith("Move the routines marked") && !decisions.has('move'))
      found.push('move line with no routine moved');
    return found;
  }

  it('holds for every sample on every recorded day, time and plan day', async () => {
    const days = ['today', 'tomorrow', 'day_after'] as const;
    let checked = 0;
    for (const id of RECORDED_IDS) {
      const series = await fetchRecordedSeries(id);
      const date = series.recordedOn ?? '2026-11-21';
      for (const sample of SAMPLES) {
        for (const time of ['06:00', '09:30', '13:00', '16:30']) {
          for (const day of days) {
            const p = buildPlan({
              household: sample.household,
              series,
              now: at(date, time),
              day,
            });
            expect(
              contradictions(sample.household, p),
              `${sample.id} ${id} ${time} ${day}`,
            ).toEqual([]);
            checked += 1;
          }
        }
      }
    }
    expect(checked).toBeGreaterThan(200);
  });

  it('holds on days with a Very Poor spell and a cleaner rest of the day', () => {
    const home = household(
      [member('m1', 'adult'), member('m2', 'older'), member('m3', 'child')],
      [
        routine({ id: 'a', memberId: 'm3', kind: 'sport', start: '17:00', intensity: 'vigorous' }),
        routine({ id: 'b', memberId: 'm1', kind: 'sport', start: '06:30', intensity: 'moderate' }),
        routine({ id: 'c', memberId: 'm2', kind: 'walk', start: '07:00', intensity: 'light' }),
      ],
    );
    const shapes = [
      byHour({ 6: 200, 7: 200, 8: 200, 9: 200 }, 80),
      byHour({ 18: 200, 19: 200, 20: 200, 21: 200 }, 40),
      byHour({ 6: 200, 7: 200, 8: 200, 17: 200, 18: 200, 19: 200 }, 70),
      flatSeries(200),
    ];
    for (const series of shapes) {
      for (const day of ['today', 'tomorrow'] as const) {
        const p = buildPlan({ household: home, series, now: SATURDAY, day });
        expect(contradictions(home, p)).toEqual([]);
      }
    }
  });
});
