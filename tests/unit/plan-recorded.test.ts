import { describe, expect, it } from 'vitest';

import type { AirSeries } from '@/core/air/types';
import { buildPlan } from '@/core/plan/build-plan';
import { planFacts } from '@/core/plan/facts';
import type { Plan } from '@/core/plan/types';
import { extractNumbers } from '@/core/text';
import type { Household, Routine } from '@/core/types';
import { fetchRecordedSeries } from '@/server/air/recorded';
import { at, household, member, routine } from '../helpers/plan';

// The recordings were taken on Saturday 21 Nov 2026, so every test names that date explicitly.
const DAY = '2026-11-21';
const WEEKEND: Routine['days'] = ['sat', 'sun'];

function allTexts(plan: Plan): string[] {
  return [
    plan.glance.topAction,
    ...plan.routines.flatMap((r) => [r.reason.text, r.impact.text, ...r.protection]),
    ...(plan.answer ? [plan.answer.text] : []),
  ];
}

const family: Household = household(
  [member('dad', 'adult'), member('son', 'child'), member('nani', 'older', ['asthma_copd'])],
  [
    routine({
      id: 'drive',
      memberId: 'dad',
      kind: 'commute',
      mode: 'two_wheeler',
      start: '09:00',
      minutes: 45,
      intensity: 'light',
      days: WEEKEND,
    }),
    routine({
      id: 'cricket',
      memberId: 'son',
      kind: 'sport',
      start: '17:00',
      intensity: 'vigorous',
      days: WEEKEND,
      flexHours: 3,
    }),
    routine({
      id: 'walk',
      memberId: 'nani',
      kind: 'walk',
      start: '06:30',
      minutes: 40,
      intensity: 'light',
      days: WEEKEND,
      flexHours: 2,
    }),
  ],
);

const runner: Household = household(
  [member('asha', 'adult')],
  [
    routine({
      id: 'run',
      memberId: 'asha',
      kind: 'sport',
      start: '06:00',
      minutes: 45,
      intensity: 'vigorous',
      days: WEEKEND,
      flexHours: 4,
    }),
    routine({
      id: 'metro',
      memberId: 'asha',
      kind: 'commute',
      mode: 'metro_rail',
      start: '09:00',
      intensity: 'light',
      days: WEEKEND,
    }),
  ],
);

async function planOn(id: string, home: Household, time = '05:00'): Promise<Plan> {
  const series: AirSeries = await fetchRecordedSeries(id);
  return buildPlan({ household: home, series, now: at(series.recordedOn ?? DAY, time) });
}

describe('plans on the recorded series', () => {
  it('gives two households in Delhi different plans from the same air', async () => {
    const [a, b] = await Promise.all([
      planOn('delhi-lajpat-nagar', family),
      planOn('delhi-lajpat-nagar', runner),
    ]);
    expect(a.air.aqi).toEqual(b.air.aqi);
    expect(a.glance.best).toEqual(b.glance.best);
    expect(a.routines.map((r) => r.decision)).not.toEqual(b.routines.map((r) => r.decision));

    const by = (plan: Plan, id: string) => plan.routines.find((r) => r.routineId === id);
    // A child's hard play at a Very Poor hour goes indoors; the grandmother with asthma stays in too.
    expect(by(a, 'cricket')?.decision).toBe('indoors');
    expect(by(a, 'walk')?.decision).toBe('indoors');
    // A two-wheeler trip cannot be dropped, so it gets a mask; a metro trip gets a waiting-outside note.
    expect(by(a, 'drive')?.decision).toBe('essential');
    expect(by(a, 'drive')?.protection.join(' ')).toContain('N95');
    expect(by(b, 'metro')?.protection.join(' ')).toContain('while you wait outside');
    // The runner is an adult, so the run moves rather than going indoors outright.
    expect(by(b, 'run')?.decision).toBe('move');
  });

  it('gives the same household in Delhi and Mumbai different air and different plans', async () => {
    const [delhi, mumbai] = await Promise.all([
      planOn('delhi-lajpat-nagar', family),
      planOn('mumbai-andheri', family),
    ]);
    expect(delhi.air.gridLat).not.toBe(mumbai.air.gridLat);
    expect(delhi.air.hourly.map((h) => h.pm25)).not.toEqual(mumbai.air.hourly.map((h) => h.pm25));
    expect(delhi.routines.map((r) => r.level)).not.toEqual(mumbai.routines.map((r) => r.level));
    expect(delhi.routines.map((r) => r.decision)).not.toEqual(
      mumbai.routines.map((r) => r.decision),
    );
    // The same household is a long way from Severe in Mumbai.
    expect(mumbai.severe).toBe(false);
    expect(delhi.severe).toBe(true);
  });

  it('plans the recorded smog day as severe and labels it recorded', async () => {
    const series = await fetchRecordedSeries('delhi-smog-2025-12-13');
    const plan = buildPlan({ household: family, series, now: at('2025-12-13', '09:00') });
    expect(plan.air.source).toBe('recorded');
    expect(plan.air.recordedOn).toBe('2025-12-13');
    expect(plan.severe).toBe(true);
    expect(plan.day.date).toBe('2025-12-13');
  });

  it('plans a place with good air by keeping everything and still shows the day at a glance', async () => {
    const plan = await planOn('bengaluru-indiranagar', family);
    expect(
      plan.routines
        .filter((r) => r.scheduled)
        .every((r) => ['keep', 'lighten', 'essential'].includes(r.decision)),
    ).toBe(true);
    expect(plan.glance.best).not.toBeNull();
  });

  it('has every number a person can see in the planFacts', async () => {
    const plan = await planOn('delhi-lajpat-nagar', family);
    const facts = planFacts(plan);
    for (const text of allTexts(plan)) {
      for (const n of extractNumbers(text)) expect(facts).toContain(n);
    }
    for (const r of plan.routines) {
      for (const n of r.impact.numbers) expect(facts).toContain(n);
      if (r.pm25 !== null) expect(facts).toContain(r.pm25);
    }
    expect([...facts].sort((x, y) => x - y)).toEqual(facts);
    expect(new Set(facts).size).toBe(facts.length);
  });
});

describe('time of day', () => {
  // The plan opens on today before 17:00 IST and on tomorrow after.
  it.each([
    ['06:00', 'today', '2026-11-21', '2026-11-21T06:00'],
    ['14:00', 'today', '2026-11-21', '2026-11-21T14:00'],
    ['21:30', 'tomorrow', '2026-11-22', '2026-11-21T21:00'],
    ['23:55', 'tomorrow', '2026-11-22', '2026-11-21T23:00'],
  ] as const)(
    'at %s IST the plan is for %s (%s) and reads data from %s',
    async (time, relative, date, dataHour) => {
      const plan = await planOn('delhi-lajpat-nagar', family, time);
      expect(plan.day.relative).toBe(relative);
      expect(plan.day.date).toBe(date);
      expect(plan.air.dataHour).toBe(dataHour);
      expect(plan.days.map((d) => d.relative)).toEqual(['today', 'tomorrow', 'day_after']);
      expect(plan.air.hourly).toHaveLength(16);
      expect(plan.air.hourly[0]?.hour).toBe(`${date}T06:00`);
      expect(plan.air.hourly.at(-1)?.hour).toBe(`${date}T21:00`);
    },
  );

  it('offers no window earlier than the clock on today but does after the day is tomorrow', async () => {
    const noon = await planOn('delhi-lajpat-nagar', family, '15:30');
    const cricket = noon.routines.find((r) => r.routineId === 'cricket');
    if (cricket?.window) expect(cricket.window.start >= '15:30').toBe(true);

    const night = await planOn('delhi-lajpat-nagar', runner, '23:55');
    expect(night.day.relative).toBe('tomorrow');
    expect(night.routines.find((r) => r.routineId === 'run')?.scheduled).toBe(true);
  });

  it('reports a recorded series as recorded and a stale one as stale', async () => {
    const recorded = await planOn('mumbai-andheri', family);
    expect(recorded.air).toMatchObject({ source: 'recorded', recordedOn: DAY });
    const series = await fetchRecordedSeries('mumbai-andheri');
    const stale = buildPlan({
      household: family,
      series: { ...series, stale: { lastGoodAt: '2026-11-21T14:05:00+05:30' } },
      now: at(DAY, '15:00'),
    });
    expect(stale.air.staleSince).toBe('2026-11-21T14:05:00+05:30');
    expect(planFacts(stale)).toEqual(expect.arrayContaining([14, 5]));
  });
});
