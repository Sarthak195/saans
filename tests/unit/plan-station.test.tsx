import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { AirSection } from '@/components/air-section';
import { PlanHeader } from '@/components/plan-top';
import type { AirSeries, StationReading } from '@/core/air/types';
import { buildPlan } from '@/core/plan/build-plan';
import { planFacts } from '@/core/plan/facts';
import type { Plan } from '@/core/plan/types';

import { at, household, member, routine, seriesOf } from '../helpers/plan';

// A Saturday afternoon: the model says Good air, then the play routines are judged.
const NOW = at('2026-11-21', '14:20');
const PLAY = routine({ id: 'play', memberId: 'c', kind: 'outdoor_play', start: '16:00' });
const LATE = routine({ id: 'late', memberId: 'c', kind: 'outdoor_play', start: '20:00' });

function station(overrides: Partial<StationReading> = {}): StationReading {
  return {
    provider: 'openaq',
    name: 'R K Puram, Delhi - DPCC',
    distanceKm: 5.5,
    pm25: 100,
    pm10: null,
    measuredAt: '2026-11-21T14:00:00+05:30',
    ...overrides,
  };
}

function planFor(
  extra: Partial<AirSeries> = {},
  options: { day?: 'today' | 'tomorrow'; modelPm25?: number } = {},
): Plan {
  const series = seriesOf(() => options.modelPm25 ?? 20, extra);
  return buildPlan({
    household: household([member('c', 'child')], [PLAY, LATE]),
    series,
    now: NOW,
    day: options.day ?? 'today',
  });
}

const decide = (plan: Plan) => plan.routines.map((r) => [r.routineId, r.decision, r.level]);

describe('a nearby monitor that reads worse than the model', () => {
  it('reads the next hours of today at the worse level and says so', () => {
    const plain = planFor();
    const careful = planFor({ station: station() });
    expect(careful.air.precaution).toEqual({
      stationLevel: 'poor',
      modelLevel: 'good',
      fromHour: '2026-11-21T14:00',
      toHour: '2026-11-21T17:00',
    });
    const play = careful.routines.find((r) => r.routineId === 'play');
    expect(plain.routines.find((r) => r.routineId === 'play')?.decision).toBe('keep');
    expect(play?.level).toBe('poor');
    expect(play?.decision).not.toBe('keep');
    // A routine outside the covered hours still reads the model.
    expect(careful.routines.find((r) => r.routineId === 'late')).toEqual(
      plain.routines.find((r) => r.routineId === 'late'),
    );
  });

  it('keeps the model values and the AQI headline exactly as they were', () => {
    const plain = planFor();
    const careful = planFor({ station: station({ pm25: 200 }) });
    expect(careful.air.aqi).toEqual(plain.air.aqi);
    expect(careful.air.hourly).toEqual(plain.air.hourly);
    expect(careful.glance.worst).toEqual(plain.glance.worst);
    expect(careful.severe).toBe(plain.severe);
  });

  it('does not offer the hours the monitor reads worse as the cleanest window', () => {
    // The model is cleanest from 14:00 to 17:00, where the monitor says the air is worse.
    const series = (extra: Partial<AirSeries>) =>
      seriesOf((_, hour) => (hour >= 14 && hour < 17 ? 20 : 60), extra);
    const build = (extra: Partial<AirSeries>) =>
      buildPlan({
        household: household([member('c', 'child')], []),
        series: series(extra),
        now: NOW,
      });
    expect(build({}).glance.best?.start).toBe('14:00');
    const careful = build({ station: station({ pm25: 120 }) });
    expect(careful.glance.best?.start).not.toBe('14:00');
    expect(careful.glance.topAction).not.toContain('14:00');
  });

  it('keeps the monitor numbers out of what a written text may state', () => {
    const careful = planFor({ station: station({ pm25: 173, pm10: 311, distanceKm: 6.7 }) });
    const facts = planFacts(careful);
    for (const value of [173, 311, 6.7]) expect(facts).not.toContain(value);
  });

  it('ignores a reading that is not worse, is absent, or is too old', () => {
    const plain = decide(planFor());
    expect(planFor({ station: station({ pm25: 25 }) }).air.precaution).toBeUndefined();
    expect(planFor({ station: station({ pm25: 5 }) }).air.precaution).toBeUndefined();
    expect(planFor({ station: station({ pm25: null, pm10: 300 }) }).air.precaution).toBeUndefined();
    expect(planFor().air.precaution).toBeUndefined();
    const old = planFor({ station: station({ measuredAt: '2026-11-21T09:00:00+05:30' }) });
    expect(old.air.precaution).toBeUndefined();
    expect(decide(old)).toEqual(plain);
  });

  it('compares the monitor with the model hour, not with the 24-hour AQI', () => {
    const same = planFor({ station: station({ pm25: 110 }) }, { modelPm25: 100 });
    expect(same.air.precaution).toBeUndefined();
    const worse = planFor({ station: station({ pm25: 150 }) }, { modelPm25: 100 });
    expect(worse.air.precaution?.stationLevel).toBe('very_poor');
    expect(worse.air.precaution?.modelLevel).toBe('poor');
  });

  it('never applies to a recording or a later day', () => {
    const plain = decide(planFor());
    const recorded = planFor({ source: 'recorded', recordedOn: '2026-11-21', station: station() });
    expect(recorded.air.precaution).toBeUndefined();
    expect(recorded.air.station).toBeUndefined();
    expect(decide(recorded)).toEqual(plain);

    const tomorrow = planFor({ station: station() }, { day: 'tomorrow' });
    expect(tomorrow.air.precaution).toBeUndefined();
    expect(decide(tomorrow)).toEqual(decide(planFor({}, { day: 'tomorrow' })));
  });

  it('does not cover hours that fall on the next day', () => {
    const late = buildPlan({
      household: household([member('c', 'child')], []),
      series: seriesOf(() => 20, { station: station({ measuredAt: '2026-11-21T22:30:00+05:30' }) }),
      now: at('2026-11-21', '22:40'),
      day: 'today',
    });
    expect(late.air.precaution?.toHour).toBe('2026-11-21T23:00');
  });
});

describe('showing the monitor reading', () => {
  const ctx = { base: '/plan/x', actionBase: '/plan/x', formToken: 't', keep: {} };

  it('writes the reading in plain words beside the model value', () => {
    const plan = planFor({ station: station({ pm25: 28 }) });
    const html = renderToStaticMarkup(<AirSection air={plan.air} />);
    expect(html).toContain(
      'Measured nearby: PM2.5 28 at R K Puram, Delhi - DPCC (via OpenAQ), 5.5 km away, at 14:00 IST',
    );
    expect(html).toContain('does not change');
  });

  it('shows no line without a reading', () => {
    const html = renderToStaticMarkup(<AirSection air={planFor().air} />);
    expect(html).not.toContain('Measured nearby');
  });

  it('adds a plain note to the plan header only when the precaution applies', () => {
    const careful = planFor({ station: station() });
    const html = renderToStaticMarkup(<PlanHeader plan={careful} ctx={ctx} smogDay={false} />);
    expect(html).toContain('reads worse than the forecast');
    expect(html).toContain('uses the worse level');
    const calm = renderToStaticMarkup(<PlanHeader plan={planFor()} ctx={ctx} smogDay={false} />);
    expect(calm).not.toContain('reads worse');
  });
});
