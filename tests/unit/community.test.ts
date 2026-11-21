import { describe, expect, it } from 'vitest';

import { buildCommunity } from '@/core/community';
import { COMMUNITY } from '@/core/community/data';
import type { Band } from '@/core/aqi';
import type { CommunityPlan } from '@/core/plan/types';
import { COMMUNITY_KINDS } from '@/core/profile/schema';
import { checkNumbers } from '@/core/text';
import type { Community, CommunityKind, Place, Routine } from '@/core/types';

import {
  DELHI,
  INSUFFICIENT,
  MUMBAI,
  aqiOk,
  hourlyOf,
  makeHousehold,
  makePlan,
  makeRoutine,
  windowOf,
} from '../helpers/plan-doubles';
import { CLAIMS_SAFE, DASHES, UNFILLED } from '../helpers/text';

const DATE = '2026-11-24'; // a Tuesday

interface Scenario {
  place?: Place;
  community?: Partial<Community> & { kind?: CommunityKind };
  aqi?: number;
  level?: Band;
  hourly?: ReturnType<typeof hourlyOf>;
}

function community(s: Scenario = {}): CommunityPlan {
  const place = s.place ?? DELHI;
  const level = s.level ?? 'moderate';
  return buildCommunity({
    household: makeHousehold({
      place,
      community: { kind: 'society', outdoorSlots: [], ...s.community },
    }),
    plan: makePlan({
      place,
      aqi: aqiOk(s.aqi ?? 150),
      worst: windowOf(level, 100),
      hourly: s.hourly ?? hourlyOf(DATE, () => 100),
    }),
  });
}

const ids = (c: CommunityPlan): string[] => c.actions.map((a) => a.id);

// Dirty mornings and evenings, cleanest at 14:00 and 15:00, as in a Delhi winter.
const winterShape = (hour: number): number => ({ 14: 90, 15: 95, 13: 130, 16: 140 })[hour] ?? 220;
const slot = (overrides: Partial<Routine>): Routine =>
  makeRoutine({ kind: 'sport', days: ['tue'], flexHours: 0, ...overrides });

describe('community actions', () => {
  const cases: [Band, number][] = [
    ['good', 40],
    ['very_poor', 350],
  ];
  const places = [DELHI, MUMBAI];

  it.each(
    COMMUNITY_KINDS.flatMap((kind) =>
      cases.flatMap(([level, aqi]) => places.map((place) => [kind, level, aqi, place] as const)),
    ),
  )('gives 4 to 6 actions for a %s at %s (AQI %i) in %o', (kind, level, aqi, place) => {
    const plan = community({ place, community: { kind }, level, aqi });
    expect(plan.kind).toBe(kind);
    expect(plan.actions.length).toBeGreaterThanOrEqual(4);
    expect(plan.actions.length).toBeLessThanOrEqual(6);
    for (const action of plan.actions) {
      expect(action.reason.source.id).toBeTruthy();
      if (action.reason.source.status === 'P-READ') expect(action.reason.source.quote).toBeTruthy();
    }
  });

  it('gives a school on a very poor day the ministry guidance for schools', () => {
    const list = ids(community({ community: { kind: 'school' }, level: 'very_poor', aqi: 350 }));
    expect(list).toEqual(
      expect.arrayContaining([
        'school-limit-outdoor',
        'school-windows-shut',
        'school-wet-mop',
        'school-display-aqi',
      ]),
    );
  });

  it('keeps school windows open for ventilation on a clean day, not shut', () => {
    const list = ids(community({ community: { kind: 'school' }, level: 'good', aqi: 40 }));
    expect(list).toContain('school-ventilation');
    expect(list).not.toContain('school-windows-shut');
    expect(list).not.toContain('school-limit-outdoor');
  });

  it('adds the CAQM sports advisory for a school in Delhi NCR only', () => {
    const delhi = community({ community: { kind: 'school' }, level: 'poor', aqi: 250 });
    const mumbai = community({
      place: MUMBAI,
      community: { kind: 'school' },
      level: 'poor',
      aqi: 250,
    });
    expect(ids(delhi)).toContain('school-sports-reschedule');
    expect(ids(mumbai)).not.toContain('school-sports-reschedule');
    const row = delhi.actions.find((a) => a.id === 'school-sports-reschedule');
    expect(row?.reason.text).toContain('Advisory No. 18');
  });

  it('adds the electric heaters and the reporting apps for a Delhi society, and neither elsewhere', () => {
    const delhi = ids(community({ level: 'very_poor', aqi: 350 }));
    const mumbai = ids(community({ place: MUMBAI, level: 'very_poor', aqi: 350 }));
    expect(delhi).toContain('society-heaters');
    expect(delhi.concat(ids(community({ level: 'good', aqi: 40 })))).toContain('report-polluters');
    expect(mumbai).not.toContain('society-heaters');
    expect(mumbai).not.toContain('report-polluters');
    const apps = community({ level: 'good', aqi: 40 }).actions.find(
      (a) => a.id === 'report-polluters',
    );
    expect(apps?.body).toContain('311 App');
    expect(apps?.body).toContain('SAMEER App');
  });

  it('suggests work from home for an office only on the worst days in Delhi NCR', () => {
    expect(ids(community({ community: { kind: 'office' }, level: 'severe', aqi: 450 }))).toContain(
      'office-work-from-home',
    );
    expect(ids(community({ community: { kind: 'office' }, level: 'moderate' }))).not.toContain(
      'office-work-from-home',
    );
    expect(
      ids(community({ place: MUMBAI, community: { kind: 'office' }, level: 'severe', aqi: 450 })),
    ).not.toContain('office-work-from-home');
  });

  it('still gives at least four actions when there is no AQI and no worst block', () => {
    const result = buildCommunity({
      household: makeHousehold({ community: { kind: 'society', outdoorSlots: [] } }),
      plan: makePlan({ aqi: INSUFFICIENT, worst: null, best: null }),
    });
    expect(result.actions.length).toBeGreaterThanOrEqual(4);
    expect(result.bestOutdoorWindow).toBeNull();
  });

  it('reads a household with no community as a society with no slots', () => {
    const result = buildCommunity({ household: makeHousehold(), plan: makePlan() });
    expect(result.kind).toBe('society');
    expect(result.aggregate).toBeUndefined();
  });
});

describe('best outdoor window', () => {
  it('is the slot itself when it cannot move', () => {
    const win = community({
      community: { outdoorSlots: [slot({ start: '15:00', minutes: 60 })] },
      hourly: hourlyOf(DATE, winterShape),
    }).bestOutdoorWindow;
    expect(win).toMatchObject({ start: '15:00', end: '16:00', pm25: 95, level: 'poor' });
  });

  it('moves a slot with flexibility to the cleanest hour and rounds the PM2.5 to 5', () => {
    const win = community({
      community: { outdoorSlots: [slot({ start: '11:00', minutes: 60, flexHours: 4 })] },
      hourly: hourlyOf(DATE, (h) => (h === 14 ? 92 : winterShape(h))),
      level: 'moderate',
    }).bestOutdoorWindow;
    expect(win).toMatchObject({ start: '14:00', end: '15:00', pm25: 90, level: 'poor' });
  });

  it('picks the best across all slots', () => {
    const win = community({
      community: {
        outdoorSlots: [
          slot({ id: 'assembly', start: '08:00', minutes: 30 }),
          slot({ id: 'sports', start: '14:00', minutes: 60 }),
          slot({ id: 'pe', start: '11:00', minutes: 60 }),
        ],
      },
      hourly: hourlyOf(DATE, winterShape),
    }).bestOutdoorWindow;
    expect(win?.start).toBe('14:00');
  });

  it('never offers a window before 10:00 or after 19:00 on a poor day', () => {
    const early = community({
      community: { outdoorSlots: [slot({ start: '08:00', minutes: 60, flexHours: 4 })] },
      hourly: hourlyOf(DATE, (h) => (h < 10 ? 20 : 200)),
      level: 'very_poor',
      aqi: 350,
    }).bestOutdoorWindow;
    expect(early?.start).toBe('10:00');
    const onlyEarly = community({
      community: { outdoorSlots: [slot({ start: '08:00', minutes: 60 })] },
      level: 'poor',
      aqi: 250,
    }).bestOutdoorWindow;
    expect(onlyEarly).toBeNull();
    // On a moderate day the same early slot is fine.
    expect(
      community({ community: { outdoorSlots: [slot({ start: '08:00', minutes: 60 })] } })
        .bestOutdoorWindow?.start,
    ).toBe('08:00');
  });

  it('respects free hours', () => {
    const win = community({
      community: {
        outdoorSlots: [
          slot({ start: '11:00', minutes: 60, flexHours: 4, freeFrom: '10:00', freeTo: '13:00' }),
        ],
      },
      hourly: hourlyOf(DATE, (h) => (h === 12 ? 100 : winterShape(h))),
    }).bestOutdoorWindow;
    expect(win?.start).toBe('12:00');
  });

  it('is null with no slots, a slot on another weekday, or missing forecast hours', () => {
    expect(community().bestOutdoorWindow).toBeNull();
    expect(
      community({ community: { outdoorSlots: [slot({ days: ['sat'] })] } }).bestOutdoorWindow,
    ).toBeNull();
    expect(
      community({
        community: { outdoorSlots: [slot({ start: '11:00', minutes: 60 })] },
        hourly: hourlyOf(DATE, (h) => (h === 11 ? null : 100)),
      }).bestOutdoorWindow,
    ).toBeNull();
    expect(
      community({
        community: { outdoorSlots: [slot({ start: '23:00', minutes: 60 })] },
      }).bestOutdoorWindow,
    ).toBeNull();
  });

  it('is never worse than the slot as scheduled, whatever the forecast', () => {
    for (let seed = 1; seed <= 25; seed += 1) {
      const shape = (h: number): number => 40 + ((h * seed * 37) % 160);
      const hourly = hourlyOf(DATE, shape);
      const fixed = community({
        community: { outdoorSlots: [slot({ start: '12:00', minutes: 60 })] },
        hourly,
      }).bestOutdoorWindow;
      const flexible = community({
        community: { outdoorSlots: [slot({ start: '12:00', minutes: 60, flexHours: 3 })] },
        hourly,
      }).bestOutdoorWindow;
      expect(flexible?.pm25 ?? Infinity).toBeLessThanOrEqual(fixed?.pm25 ?? Infinity);
    }
  });

  it('leads the action list and names the hours', () => {
    const result = community({
      community: { outdoorSlots: [slot({ start: '14:00', minutes: 60 })] },
      hourly: hourlyOf(DATE, winterShape),
    });
    expect(result.actions[0]?.id).toBe('best-window');
    expect(result.actions[0]?.title).toBe('Hold outdoor time from 14:00 to 15:00');
    expect(result.actions[0]?.body).toContain('about 90 micrograms');
    expect(result.actions.length).toBeLessThanOrEqual(6);
  });
});

describe('aggregate impact', () => {
  it('is N x 6 km x 5 days car-km a week, and states both assumptions', () => {
    const { aggregate } = community({ community: { households: 300 } });
    expect(aggregate?.kind).toBe('distance');
    expect(aggregate?.numbers).toEqual([300, 6, 9000, 5]);
    expect(aggregate?.text).toContain(
      'If 300 households each replace one 6 km car round trip a day',
    );
    expect(aggregate?.text).toContain('about 9000 fewer car-km a week');
    expect(aggregate?.text).toContain('Saans assumptions');
    expect(aggregate?.source?.status).toBe('APP');
  });

  it('scales with the number of households', () => {
    for (const n of [1, 2, 37, 300, 10_000]) {
      const { aggregate } = community({ community: { households: n } });
      expect(aggregate?.numbers[2]).toBe(n * 30);
    }
  });

  it('is left out when the number of households is not known', () => {
    expect(community().aggregate).toBeUndefined();
    expect('aggregate' in community()).toBe(false);
  });

  it('lists every number its text shows', () => {
    const { aggregate } = community({ community: { households: 120 } });
    expect(checkNumbers(aggregate?.text ?? '', aggregate?.numbers ?? []).unknown).toEqual([]);
  });
});

describe('community text', () => {
  it('has no unfilled placeholder, no dash and no claim that anything is safe', () => {
    for (const kind of COMMUNITY_KINDS) {
      for (const level of ['good', 'very_poor'] as const) {
        const result = community({
          community: {
            kind,
            households: 50,
            outdoorSlots: [slot({ start: '14:00', minutes: 60 })],
          },
          level,
          hourly: hourlyOf(DATE, winterShape),
        });
        for (const a of result.actions) {
          const text = [a.title, a.body, a.reason.text].join(' ');
          expect(text, a.id).not.toMatch(UNFILLED);
          expect(text, a.id).not.toMatch(DASHES);
          expect(text, a.id).not.toMatch(CLAIMS_SAFE);
        }
      }
    }
  });

  it('quotes the window guard from the ministry', () => {
    expect(COMMUNITY.window.guardSource.quote).toContain('late evening');
  });
});
