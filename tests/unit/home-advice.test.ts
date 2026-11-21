import { describe, expect, it } from 'vitest';

import { buildHomeAdvice, checkPurifier, neededCadr } from '@/core/home';
import { INDOOR } from '@/core/home/data';
import type { HomeAdvice } from '@/core/plan/types';
import { checkNumbers } from '@/core/text';
import type { Home } from '@/core/types';

<<<<<<< HEAD
import { INSUFFICIENT, aqiOk, makeHousehold, makePlan, windowOf } from '../helpers/plan-doubles';
=======
import { INSUFFICIENT, aqiOk, makeHousehold, makePlan, windowOf } from '../helpers/plan-doubles';
import { CLAIMS_SAFE, DASHES, UNFILLED } from '../helpers/text';
>>>>>>> 1c42240 (test(core): helper coverage and lint-clean fact types for home, alternatives and community)

function advice(home: Partial<Home> = {}, plan: Parameters<typeof makePlan>[0] = {}): HomeAdvice[] {
  return buildHomeAdvice({ household: makeHousehold({ home }), plan: makePlan(plan) });
}

const ids = (list: HomeAdvice[]): string[] => list.map((a) => a.id);
const poorDay = {
  aqi: aqiOk(250),
  worst: windowOf('very_poor', 180),
  airing: { kind: 'window', start: '13:00', end: '14:00', pm25: 112 } as const,
};

describe('carbon monoxide guard', () => {
  it.each(['angithi_coal', 'gas'] as const)(
    'comes first for %s heating, before any window row',
    (h) => {
      const list = advice({ heating: h }, poorDay);
      expect(list[0]?.id).toMatch(/^co-guard/);
      expect(list[0]?.priority).toBe(0);
      expect(list[0]?.safety).toBe(true);
      const airing = list.findIndex((a) => a.id.startsWith('airing-'));
      expect(airing).toBeGreaterThan(0);
      expect(list.filter((a) => a.priority === 0).every((a) => a.safety)).toBe(true);
    },
  );

  it('comes before the keep-shut row too', () => {
    const list = advice(
      { heating: 'angithi_coal' },
      {
        aqi: aqiOk(350),
        airing: { kind: 'keep_shut', leastBadHour: '2026-11-24T14:00', pm25: 160 },
      },
    );
    expect(ids(list).indexOf('co-guard-angithi')).toBeLessThan(
      ids(list).indexOf('airing-keep-shut'),
    );
  });

  it('quotes the ministry for the angithi and marks the gas row as a Saans rule', () => {
    const list = advice({ heating: 'angithi_coal' });
    expect(list[0]?.reason.source.status).toBe('P-READ');
    expect(list[0]?.reason.source.quote).toContain('fatal due to CO');
    const gas = advice({ heating: 'gas' })[0];
    expect(gas?.reason.source.status).toBe('APP');
    expect(gas?.reason.source.title).toMatch(/^Saans rule: /);
  });

  it('is absent with no heater or an electric one', () => {
    for (const heating of ['none', 'electric'] as const) {
      expect(ids(advice({ heating })).some((id) => id.startsWith('co-guard'))).toBe(false);
    }
  });
});

describe('airing text', () => {
  it('says to air as usual when the glance says normal', () => {
    const row = advice().find((a) => a.id === 'airing-normal');
    expect(row?.title).toBe('Air your home as usual today');
  });

  it('gives the window and its rounded PM2.5', () => {
    const row = advice({}, poorDay).find((a) => a.id === 'airing-window');
    expect(row?.title).toBe('Open windows only from 13:00 to 14:00');
    expect(row?.body).toContain('about 110 micrograms');
    expect(row?.reason.source.quote).toContain('12 p.m. to 4 p.m.');
  });

  it('gives the least bad hour when windows stay shut, from an hour stamp or a clock time', () => {
    for (const leastBadHour of ['2026-11-24T14:00', '14:00']) {
      const row = advice(
        {},
        { aqi: aqiOk(350), airing: { kind: 'keep_shut', leastBadHour, pm25: 163 } },
      ).find((a) => a.id === 'airing-keep-shut');
      expect(row?.body).toContain('around 14:00');
      expect(row?.body).toContain('about 165 micrograms');
    }
  });
});

describe('purifier sizing', () => {
  it('follows the EPA chart: 0.65 cfm for each sq ft', () => {
    const chart: [number, number][] = [
      [100, 65],
      [200, 130],
      [300, 195],
      [400, 260],
      [500, 325],
      [600, 390],
    ];
    for (const [sqft, cfm] of chart) expect(neededCadr(sqft)).toBe(cfm);
    expect(neededCadr(180)).toBe(117);
  });

  it('never needs less for a bigger room', () => {
    let last = 0;
    for (let sqft = 20; sqft <= 5000; sqft += 7) {
      const needed = neededCadr(sqft);
      expect(needed).toBeGreaterThanOrEqual(last);
      last = needed;
    }
  });

  it('reports a shortfall against the unit the family has', () => {
    expect(checkPurifier({ roomSqft: 180, purifierCadrCfm: 70 })).toEqual({
      fit: 'short',
      needed: 117,
      have: 70,
      gap: 47,
    });
    const row = advice({ roomSqft: 180, purifierCadrCfm: 70 }, poorDay).find(
      (a) => a.id === 'purifier-short',
    );
    expect(row?.title).toBe('Your purifier is about 47 cfm short for this room');
    expect(row?.impact?.numbers).toEqual([70, 117, 47]);
  });

  it('reports a surplus, a match, and what an owner of nothing should buy', () => {
    expect(checkPurifier({ roomSqft: 180, purifierCadrCfm: 200 })).toMatchObject({
      fit: 'spare',
      gap: 83,
    });
    expect(checkPurifier({ roomSqft: 180, purifierCadrCfm: 117 }).fit).toBe('match');
    const none = advice({ roomSqft: 180 }, poorDay).find((a) => a.id === 'purifier-none');
    expect(none?.impact?.numbers).toEqual([117]);
    expect(none?.title).toContain('about 117 cfm');
  });

  it('asks for the room size when it is not known', () => {
    expect(checkPurifier({}).fit).toBe('unknown');
    expect(ids(advice({}, poorDay))).toContain('purifier-unknown');
  });

  it('adds a note, but no scaled number, for ceilings above 8 ft', () => {
    const tall = advice({ roomSqft: 180, ceilingFt: 10 }, poorDay).find(
      (a) => a.id === 'purifier-none',
    );
    const normal = advice({ roomSqft: 180, ceilingFt: 8 }, poorDay).find(
      (a) => a.id === 'purifier-none',
    );
    expect(tall?.body).toContain('Your ceiling is about 10 ft');
    expect(normal?.body).not.toContain('ceiling');
    expect(tall?.impact?.numbers).toEqual(normal?.impact?.numbers);
  });

  it('stays quiet about purifiers on a good-air day', () => {
    const list = advice({ roomSqft: 180 }, { aqi: aqiOk(40), worst: windowOf('good', 20) });
    expect(ids(list).some((id) => id.startsWith('purifier'))).toBe(false);
  });

  it('offers the box-fan filter on a poor day with a chamber caveat, and not to an owner of a big enough purifier', () => {
    const fan = advice({}, poorDay).find((a) => a.id === 'box-fan-filter');
    expect(fan?.body).toContain('lab chamber');
    expect(fan?.body).toContain('change the filters often');
    expect(fan?.impact?.numbers).toEqual([260, 111]);
    expect(ids(advice({ roomSqft: 180, purifierCadrCfm: 200 }, poorDay))).not.toContain(
      'box-fan-filter',
    );
  });
});

describe('festival row', () => {
  it.each([
    ['2026-10-01', true],
    ['2026-11-30', true],
    ['2026-09-30', false],
    ['2026-12-01', false],
    ['2026-03-15', false],
  ])('on %s the Diwali row is shown: %s', (date, shown) => {
    expect(ids(advice({}, { date })).includes('festival-diwali')).toBe(shown);
  });

  it('quotes the ministry on Diwali nights', () => {
    const row = advice({}, { date: '2026-11-08' }).find((a) => a.id === 'festival-diwali');
    expect(row?.reason.source.quote).toContain('Stay indoor during nights of Diwali');
  });
});

describe('cooking, habits and cleaning', () => {
  it('asks biomass and kerosene households to switch to LPG, PNG or electric', () => {
    expect(advice({ cooking: 'biomass' }).find((a) => a.id === 'cooking-biomass')?.title).toContain(
      'LPG, PNG or electric',
    );
    expect(ids(advice({ cooking: 'kerosene' }))).toContain('cooking-kerosene');
    expect(ids(advice({ cooking: 'lpg_png' }))).not.toContain('cooking-biomass');
    expect(ids(advice({ cooking: 'electric' }))).not.toContain('cooking-kerosene');
  });

  it('adds a row for each habit, and only for the habits the family has', () => {
    expect(ids(advice({ habits: [] })).some((id) => id.startsWith('habit-'))).toBe(false);
    const all = ids(advice({ habits: ['incense', 'mosquito_coil', 'smoking', 'candles'] }));
    for (const id of ['habit-incense', 'habit-mosquito-coil', 'habit-smoking', 'habit-candles']) {
      expect(all).toContain(id);
    }
    expect(ids(advice({ habits: ['candles'] })).filter((id) => id.startsWith('habit-'))).toEqual([
      'habit-candles',
    ]);
  });

  it('gives the Liu figure for mosquito coils with its limits', () => {
    const coil = advice({ habits: ['mosquito_coil'] }).find((a) => a.id === 'habit-mosquito-coil');
    expect(coil?.impact?.numbers).toEqual([75, 137]);
    expect(coil?.impact?.text).toContain('not Indian');
    expect(coil?.impact?.text).toContain('not health risk');
    expect(coil?.impact?.source?.quote).toContain('75-137 cigarettes');
  });

  it('suggests wet mopping unless the day is clearly clean', () => {
    expect(ids(advice({}, poorDay))).toContain('wet-mopping');
    expect(ids(advice({}, { aqi: aqiOk(40), worst: windowOf('good', 20) }))).not.toContain(
      'wet-mopping',
    );
  });
});

describe('myth checks', () => {
  it('flags the four myths and puts them after the real advice', () => {
    const list = advice({}, poorDay);
    const myths = list.filter((a) => a.myth);
    expect(myths.map((m) => m.id)).toEqual(['myth-plants', 'myth-masks', 'myth-ozone', 'myth-ac']);
    const lastReal = Math.max(...list.filter((a) => !a.myth).map((a) => a.priority));
    expect(Math.min(...myths.map((m) => m.priority))).toBeGreaterThan(lastReal);
  });

  it('gives the Cummings and Waring finding for plants', () => {
    const plants = advice().find((a) => a.id === 'myth-plants');
    expect(plants?.impact?.numbers).toEqual([12, 0.023, 10, 1000]);
    expect(plants?.reason.source.title).toContain('Cummings and Waring');
  });
});

describe('every row, across households and days', () => {
  const homes: Partial<Home>[] = [
    {},
    { heating: 'angithi_coal', cooking: 'biomass', habits: ['incense', 'candles'] },
    { heating: 'gas', cooking: 'kerosene', habits: ['mosquito_coil', 'smoking'], roomSqft: 123.4 },
    { roomSqft: 180, ceilingFt: 9.5, purifierCadrCfm: 100 },
    { roomSqft: 180, purifierCadrCfm: 300 },
    { roomSqft: 180, purifierCadrCfm: 117 },
    { roomSqft: 300 },
  ];
  const plans: Parameters<typeof makePlan>[0][] = [
    {},
    poorDay,
    {
      date: '2026-10-30',
      aqi: aqiOk(420),
      worst: windowOf('severe', 300),
      airing: { kind: 'keep_shut', leastBadHour: '14:00', pm25: 140 },
    },
    { aqi: INSUFFICIENT, worst: null, best: null },
    { aqi: aqiOk(40), worst: windowOf('good', 20) },
  ];
  const all = homes.flatMap((home) => plans.map((plan) => advice(home, plan)));

  it('lists every number its impact text shows', () => {
    for (const list of all) {
      for (const row of list) {
        if (!row.impact) continue;
        expect(checkNumbers(row.impact.text, row.impact.numbers).unknown, row.id).toEqual([]);
      }
    }
  });

  it('has no unfilled placeholder, no dash and no claim that anything is safe', () => {
    for (const list of all) {
      for (const row of list) {
        const text = [row.title, row.body, row.reason.text, row.impact?.text ?? ''].join(' ');
        expect(text, row.id).not.toMatch(UNFILLED);
        expect(text, row.id).not.toMatch(DASHES);
        expect(text, row.id).not.toMatch(CLAIMS_SAFE);
      }
    }
  });

  it('is ordered by priority and never repeats a row', () => {
    for (const list of all) {
      const priorities = list.map((a) => a.priority);
      expect(priorities).toEqual([...priorities].sort((a, b) => a - b));
      expect(new Set(ids(list)).size).toBe(list.length);
    }
  });

  it('still gives the life-safety row and the myths when air data is missing', () => {
    const list = advice(
      { heating: 'angithi_coal' },
      { aqi: INSUFFICIENT, worst: null, best: null },
    );
    expect(list[0]?.id).toBe('co-guard-angithi');
    expect(list.filter((a) => a.myth)).toHaveLength(4);
  });
});

describe('indoor data', () => {
  it('carries a source on every row, quoting it when read from a document', () => {
    for (const row of INDOOR.rows) {
      expect(row.source.id).toBeTruthy();
      if (row.source.status === 'P-READ') expect(row.source.quote).toBeTruthy();
      if (row.source.status === 'APP') expect(row.source.title).toMatch(/^Saans rule: /);
    }
  });
});
