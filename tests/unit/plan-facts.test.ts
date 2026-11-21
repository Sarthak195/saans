import { describe, expect, it } from 'vitest';

import { buildPlan } from '@/core/plan/build-plan';
import { planFacts, writtenAllowance } from '@/core/plan/facts';
import { checkNumbers } from '@/core/text';
import type { Alternative, CommunityPlan, HomeAdvice, Reason } from '@/core/plan/types';
import { at, household, member, routine, seriesOf } from '../helpers/plan';

const reason: Reason = {
  ruleId: 'x',
  text: 'Wet mop 3 times a week.',
  source: { id: 's', title: 'Saans rule: test', url: 'https://example.org', status: 'APP' },
};

function planWith(series: ReturnType<typeof seriesOf>) {
  return buildPlan({
    household: household(
      [member('m1', 'adult'), member('m2', 'older')],
      [
        routine({ id: 'r1', memberId: 'm1', start: '17:30', minutes: 90, intensity: 'vigorous' }),
        routine({ id: 'r2', memberId: 'm2', start: '06:15', minutes: 40, intensity: 'light' }),
      ],
    ),
    series,
    now: at('2026-11-21', '10:00'),
  });
}

describe('planFacts', () => {
  it('lists readings, times, durations, counts and refs, sorted and without repeats', () => {
    const plan = planWith(seriesOf(() => 100));
    const facts = planFacts(plan);
    // 17:30 reads as 17 and 30; 90 and 40 are minutes; 1 and 2 are routine and member numbers.
    expect(facts).toEqual(
      expect.arrayContaining([2.5, 17, 30, 90, 6, 15, 40, 1, 2, 100, 0, 21, 22]),
    );
    expect(facts).toEqual([...new Set(facts)].sort((a, b) => a - b));
  });

  it('reads the hour of the data and the fetch time, and the recording date', () => {
    const plan = planWith(
      seriesOf(() => 100, { recordedOn: '2026-11-21', fetchedAt: '2026-11-21T23:21:04+05:30' }),
    );
    expect(planFacts(plan)).toEqual(expect.arrayContaining([23, 21, 2026, 11, 28.6, 77.2]));
  });

  it('does not widen the allowed numbers with those in a place name or a member label', () => {
    const plan = planWith(seriesOf(() => 100));
    const named = {
      ...plan,
      place: { ...plan.place, name: 'Sector 62' },
      members: plan.members.map((m) => ({ ...m, label: 'Kid 50' })),
    };
    const allowance = writtenAllowance(named);
    expect(allowance.names).toEqual(['Sector 62', 'Kid 50', 'Kid 50']);
    expect(planFacts(named)).not.toContain(62);
    expect(planFacts(named)).not.toContain(50);
    // The name itself is fine, the number on its own is not.
    const check = (text: string) =>
      checkNumbers(text, allowance.numbers, { masks: allowance.names }).unknown;
    expect(check('Air near Sector 62 is poor.')).toEqual([]);
    expect(check('AQI is 62 near Sector 62.')).toEqual([62]);
    expect(check('Kid 50 should stay in. AQI 50.')).toEqual([50]);
  });

  it('keeps a number inside a generated sentence out of the set when it is a label number', () => {
    const plan = planWith(seriesOf(() => 100));
    const named = {
      ...plan,
      glance: { ...plan.glance, topAction: 'Keep Kid 50 indoors until 12:00.' },
      members: plan.members.map((m) => ({ ...m, label: 'Kid 50' })),
    };
    expect(planFacts(named)).not.toContain(50);
  });

  it('lists a number that is only an hour or minute of the day as clock only', () => {
    const plan = planWith(seriesOf(() => 100));
    const { numbers, clockOnly } = writtenAllowance(plan);
    // 17:30 and 06:15 are in the plan; 90 and 40 minutes are counts.
    expect(clockOnly).toEqual(expect.arrayContaining([17, 15, 19, 30]));
    expect(clockOnly).not.toContain(90);
    expect(clockOnly).not.toContain(100);
    expect(numbers).toEqual(expect.arrayContaining(clockOnly));
    expect(clockOnly.every((n) => numbers.includes(n))).toBe(true);
    const check = (text: string) => checkNumbers(text, numbers, { clockOnly }).unknown;
    expect(check('Go at 17:30 or at 5:30 pm, around 06:15.')).toEqual([]);
    expect(check('The AQI is 19 today.')).toEqual([19]);
    expect(check('About 17 people are outside.')).toEqual([17]);
  });

  it('copes with an AQI that cannot be computed', () => {
    const sparse = seriesOf((date, hour) => (date === '2026-11-21' && hour < 6 ? 100 : null));
    const plan = planWith(sparse);
    expect(plan.air.aqi.kind).toBe('insufficient');
    expect(planFacts(plan)).toContain(plan.air.aqi.validHours);
  });

  it('includes the PM2.5 and PM10 averages and the AQI when there is enough data', () => {
    const series = seriesOf(() => 100);
    const withTen = { ...series, hours: series.hours.map((h) => ({ ...h, pm10: 205 })) };
    const plan = planWith(withTen);
    const facts = planFacts(plan);
    expect(plan.air.aqi.kind).toBe('ok');
    if (plan.air.aqi.kind === 'ok') expect(facts).toContain(plan.air.aqi.aqi);
    expect(facts).toContain(205);
  });

  it('adds the numbers from home advice, alternatives and the community view', () => {
    const plan = planWith(seriesOf(() => 100));
    const home: HomeAdvice[] = [
      {
        id: 'purifier',
        priority: 1,
        title: 'Run a 117 cfm purifier',
        body: 'Your room needs about 117 cfm.',
        reason,
        impact: { kind: 'purifier', text: 'Short by 40 cfm.', numbers: [40] },
      },
    ];
    const alternatives: Alternative[] = [
      {
        id: 'metro',
        routineRef: 'routine_1',
        title: 'Take the metro',
        body: 'Saves 12 car-km a week.',
        reason,
        impact: { kind: 'distance', text: '12 car-km avoided.', numbers: [12] },
      },
    ];
    const community: CommunityPlan = {
      kind: 'school',
      actions: [{ id: 'a', title: 'Hold assembly indoors', body: 'For 300 families.', reason }],
      bestOutdoorWindow: { start: '14:00', end: '15:00', pm25: 65, level: 'moderate' },
      aggregate: { kind: 'distance', text: 'About 1500 car-km a week.', numbers: [1500] },
    };
    const base = planFacts(plan);
    const facts = planFacts(plan, { home, alternatives, community });
    expect(facts).toEqual(expect.arrayContaining([117, 40, 12, 300, 14, 15, 65, 1500, 3]));
    expect(base).not.toContain(117);
    expect(base).not.toContain(1500);
  });
});
