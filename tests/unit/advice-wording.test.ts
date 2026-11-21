import { describe, expect, it } from 'vitest';

import { cityOf } from '@/core/alternatives/cities';
import { buildCommunity } from '@/core/community';
import { buildHomeAdvice } from '@/core/home';
import type { Place, Routine } from '@/core/types';

import {
  DELHI,
  INSUFFICIENT,
  aqiOk,
  hourlyOf,
  makeHousehold,
  makePlan,
  makeRoutine,
  windowOf,
} from '../helpers/plan-doubles';

// Checks that each sentence is true of the facts that fired it, not only that rows appear.

const DATE = '2026-11-24';

describe('airing row only says what the day supports', () => {
  const airingIds = (plan: Parameters<typeof makePlan>[0]): string[] =>
    buildHomeAdvice({ household: makeHousehold(), plan: makePlan(plan) })
      .map((a) => a.id)
      .filter((id) => id.startsWith('airing-'));

  it.each([
    ['good', 20],
    ['satisfactory', 50],
    ['moderate', 85],
  ] as const)('says to air as usual when the worst block is %s', (level, pm25) => {
    expect(airingIds({ worst: windowOf(level, pm25) })).toEqual(['airing-normal']);
  });

  it('does not say the air is fine when there is no air data, and asks for a check instead', () => {
    expect(airingIds({ aqi: INSUFFICIENT, worst: null, best: null })).toEqual(['airing-unknown']);
  });

  it('does not say to air as usual on a poor or worse day, whatever the glance says', () => {
    for (const level of ['poor', 'very_poor', 'severe'] as const) {
      expect(airingIds({ worst: windowOf(level, 200) })).toEqual([]);
    }
  });
});

describe('community best window wording', () => {
  const slot: Routine = makeRoutine({
    kind: 'sport',
    days: ['tue'],
    flexHours: 0,
    start: '14:00',
    minutes: 60,
  });

  function firstAction(
    level: 'moderate' | 'very_poor',
    pm25AtSlot: number,
  ): { title: string; body: string } {
    const result = buildCommunity({
      household: makeHousehold({ community: { kind: 'school', outdoorSlots: [slot] } }),
      plan: makePlan({
        aqi: aqiOk(level === 'moderate' ? 150 : 350),
        worst: windowOf(level, 100),
        hourly: hourlyOf(DATE, (h) => (h === 14 ? pm25AtSlot : 300)),
      }),
    });
    const action = result.actions[0];
    expect(action?.id).toBe('best-window');
    return { title: action?.title ?? '', body: action?.body ?? '' };
  }

  it('offers a clean window as a good time for outdoor activity', () => {
    const action = firstAction('moderate', 40);
    expect(action.title).toBe('Hold outdoor time from 14:00 to 15:00');
    expect(action.body).toContain('Hold assembly, sport or play then if you can.');
  });

  it('calls a window that is itself poor the least bad time and asks for it to be short and light', () => {
    const action = firstAction('very_poor', 200);
    expect(action.title).toBe('Least bad outdoor time: 14:00 to 15:00');
    expect(action.body).toContain('Keep it short and light.');
    expect(action.body).not.toContain('Hold assembly, sport or play');
  });
});

describe('Delhi only advice', () => {
  const noida: Place = { name: 'Noida', admin1: 'Uttar Pradesh', lat: 28.6, lon: 77.4 };
  const ids = (place: Place): string[] =>
    buildCommunity({
      household: makeHousehold({ place, community: { kind: 'society', outdoorSlots: [] } }),
      plan: makePlan({ place, aqi: aqiOk(350), worst: windowOf('very_poor', 200) }),
    }).actions.map((a) => a.id);

  it('shows the city reporting apps in Delhi but not in Noida, where GRAP still applies', () => {
    expect(ids(noida)).toContain('society-heaters');
    expect(ids(noida)).not.toContain('report-polluters');
    expect(ids(DELHI)).toContain('report-polluters');
  });
});

describe('cities without a verified operator site', () => {
  it('are not listed, so they fall back to the generic bus', () => {
    for (const name of ['Bhopal', 'Indore', 'Lucknow', 'Kochi', 'Jaipur']) {
      const place: Place = { name, admin1: 'Madhya Pradesh', lat: 23.26, lon: 77.41 };
      expect(cityOf(place)).toBeNull();
    }
  });
});
