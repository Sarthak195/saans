import { describe, expect, it } from 'vitest';

import { buildAlternatives } from '@/core/alternatives';
import { exposureLessPercent } from '@/core/alternatives/exposure';
import { ALTERNATIVE_RULES } from '@/core/alternatives/rules';
import type { Band } from '@/core/aqi';
import type { Alternative, RoutineAdvice } from '@/core/plan/types';
import { MODES } from '@/core/profile/schema';
import { checkNumbers } from '@/core/text';
import type { Mode, Place, Routine } from '@/core/types';

import {
  DELHI,
  MUMBAI,
  NOIDA,
  SMALL_TOWN,
  makeAdvice,
  makeHousehold,
  makePlan,
  makeRoutine,
<<<<<<< HEAD
} from '../helpers/plan-doubles';
=======
} from '../helpers/plan-doubles';
import { CLAIMS_SAFE, DASHES, UNFILLED } from '../helpers/text';
>>>>>>> 1c42240 (test(core): helper coverage and lint-clean fact types for home, alternatives and community)

interface Trip {
  place?: Place;
  routine?: Partial<Routine>;
  advice?: Partial<RoutineAdvice>;
}

function alternatives(trip: Trip = {}): Alternative[] {
  const routine = makeRoutine(trip.routine);
  const advice = makeAdvice({ mode: routine.mode, kind: routine.kind, ...trip.advice });
  const place = trip.place ?? DELHI;
  return buildAlternatives({
    household: makeHousehold({ place, routines: [routine] }),
    plan: makePlan({ place, routines: [advice] }),
  });
}

const ids = (list: Alternative[]): string[] => list.map((a) => a.id.split(':')[1] ?? '');

describe('public transport by city', () => {
  it('suggests the Delhi Metro for a 6 km car commute in Delhi and in Noida', () => {
    for (const place of [DELHI, NOIDA]) {
      const list = alternatives({ place, routine: { km: 6 } });
      const transit = list.find((a) => a.id.endsWith('mid-transit-rail'));
      expect(transit?.title).toBe('Try Delhi Metro for this trip');
      expect(transit?.body).toContain('delhimetrorail.com');
    }
  });

  it('names Mumbai suburban rail, the metro and BEST for Mumbai', () => {
    const list = alternatives({ place: MUMBAI, routine: { km: 12, mode: 'two_wheeler' } });
    const transit = list.find((a) => a.id.endsWith('mid-transit-rail'));
    expect(transit?.title).toContain('Mumbai suburban rail');
    expect(transit?.title).toContain('Mumbai Metro');
    expect(transit?.body).toContain('wr.indianrailways.gov.in');
  });

  it('offers buses and a shared ride, and no metro, for a place without a transport list', () => {
    const list = alternatives({ place: SMALL_TOWN, routine: { km: 6 } });
    expect(ids(list)).toEqual(['mid-transit-bus', 'carpool', 'no-idling']);
    expect(list[0]?.title).toBe('Try a city bus for this trip');
    expect(list.map((a) => a.body).join(' ')).not.toMatch(/metro/i);
  });

  it('offers rail for a long trip where the city has it, and a shared ride where it does not', () => {
    expect(ids(alternatives({ routine: { km: 20 } }))).toEqual([
      'long-transit-rail',
      'carpool',
      'no-idling',
    ]);
    expect(ids(alternatives({ place: SMALL_TOWN, routine: { km: 20 } }))).toEqual([
      'carpool',
      'no-idling',
    ]);
  });
});

describe('walking and cycling', () => {
  const walkable: Band[] = ['good', 'satisfactory', 'moderate'];
  const notWalkable: (Band | null)[] = ['poor', 'very_poor', 'severe', null];

  it.each(walkable)('is suggested for a 1.5 km trip at %s', (level) => {
    const list = alternatives({ routine: { km: 1.5 }, advice: { level } });
    expect(ids(list)).toContain('short-walk-cycle');
  });

  it.each(notWalkable)('is never suggested at %s', (level) => {
    for (const mode of ['car', 'two_wheeler', 'auto'] as const) {
      const list = alternatives({ routine: { km: 1.5, mode }, advice: { level } });
      expect(ids(list), `${mode} ${String(level)}`).not.toContain('short-walk-cycle');
    }
  });

  it('is not suggested for a trip already on foot, by cycle, bus or metro, or for 2 km and more', () => {
    for (const mode of ['walk', 'cycle', 'bus', 'metro_rail'] as const) {
      expect(ids(alternatives({ routine: { km: 1.5, mode } }))).toEqual([]);
    }
    expect(ids(alternatives({ routine: { km: 2 } }))).not.toContain('short-walk-cycle');
    expect(ids(alternatives({ routine: { km: 1.99 } }))).toContain('short-walk-cycle');
  });

  it('says why walking is only for cleaner days', () => {
    const walk = alternatives({ routine: { km: 1 } }).find((a) =>
      a.id.endsWith('short-walk-cycle'),
    );
    expect(walk?.reason.text).toContain('Moderately polluted or better');
    expect(walk?.reason.source.quote).toBe('Walk or use cycles for small distances.');
  });
});

describe('impact numbers', () => {
  it('works out car-km avoided from one way x 2 x days, and says so', () => {
    const transit = alternatives({ routine: { km: 6 } }).find((a) =>
      a.id.endsWith('mid-transit-rail'),
    );
    expect(transit?.impact.kind).toBe('distance');
    expect(transit?.impact.numbers).toEqual([60, 6, 5]);
    expect(transit?.impact.text).toContain('About 60 fewer km by car each week');
    expect(transit?.impact.text).toContain('on 5 days a week');
    expect(transit?.impact.text).toContain('assumes you make the trip on each of those days');
    expect(transit?.impact.source?.status).toBe('APP');
  });

  it('halves the car-km for a shared ride and says it takes turns', () => {
    const carpool = alternatives({ routine: { km: 6 } }).find((a) => a.id.endsWith('carpool'));
    expect(carpool?.impact.numbers).toEqual([30, 60, 6, 5]);
    expect(carpool?.reason.text).toContain('Taking turns');
  });

  it('gives the mode exposure change from the Delhi study for a two-wheeler moving to the metro', () => {
    const list = alternatives({ routine: { km: 9, mode: 'two_wheeler' } });
    const transit = list.find((a) => a.id.endsWith('mid-transit-rail'));
    expect(transit?.impact.kind).toBe('mode');
    expect(transit?.impact.percentLess).toBe(40);
    expect(transit?.impact.numbers).toEqual([90, 9, 5, 40]);
    expect(transit?.impact.text).toContain('about 40% fewer fine particles');
    expect(transit?.impact.source?.status).toBe('P-READ');
    expect(transit?.reason.text).toContain('one Delhi route measured at morning rush hour in 2014');
  });

  it('gives a car trip the car-km saving only, with a note about shut windows', () => {
    const transit = alternatives({ routine: { km: 9 } }).find((a) =>
      a.id.endsWith('mid-transit-rail'),
    );
    expect(transit?.impact.kind).toBe('distance');
    expect(transit?.impact.percentLess).toBeUndefined();
    expect(transit?.reason.text).toContain('windows shut');
  });

  it('keeps no-idling honest about having no sourced figure', () => {
    const idle = alternatives({ routine: { km: 6 } }).find((a) => a.id.endsWith('no-idling'));
    expect(idle?.impact).toMatchObject({ kind: 'none', numbers: [] });
    expect(idle?.reason.source.quote).toBe(
      'Do not idle your vehicle, also turn off the engine at red lights.',
    );
    expect(idle?.reason.text).toContain('15 seconds');
    const rule = ALTERNATIVE_RULES.find((r) => r.id === 'no-idling');
    expect(rule?.alsoSource?.quote).toContain('beyond 15 seconds');
  });

  it('shows no CO2 figure', () => {
    for (const a of alternatives({ routine: { km: 6 } })) {
      expect(a.impact.text).not.toMatch(/CO2|carbon dioxide/i);
    }
  });
});

describe('combining errands', () => {
  it('saves (n - 1) trips of 2 x km, counting the way back, on errands made 3 days a week', () => {
    const list = alternatives({
      routine: { kind: 'errand', km: 4, days: ['mon', 'wed', 'fri'] },
      advice: { kind: 'errand' },
    });
    const combine = list.find((a) => a.id.endsWith('combine-errands'));
    expect(combine?.impact.numbers).toEqual([16, 2, 4]);
    expect(combine?.impact.text).toContain('About 16 fewer km by car each week');
    expect(combine?.impact.text).toContain('assumes everything fits into one trip');
  });

  it('is not offered for one errand a week, or for a commute', () => {
    expect(
      ids(alternatives({ routine: { kind: 'errand', days: ['sat'] }, advice: { kind: 'errand' } })),
    ).not.toContain('combine-errands');
    expect(ids(alternatives({ routine: { km: 6 } }))).not.toContain('combine-errands');
  });
});

describe('which trips get alternatives', () => {
  it('skips routines that are not on the plan day, have no mode, or are not trips', () => {
    expect(alternatives({ advice: { scheduled: false } })).toEqual([]);
    const noMode = makeAdvice({ mode: undefined });
    expect(
      buildAlternatives({
        household: makeHousehold({ routines: [makeRoutine()] }),
        plan: makePlan({ routines: [noMode] }),
      }),
    ).toEqual([]);
    expect(alternatives({ routine: { kind: 'sport' }, advice: { kind: 'sport' } })).toEqual([]);
  });

  it('skips a plan routine the household does not have', () => {
    expect(
      buildAlternatives({
        household: makeHousehold({ routines: [] }),
        plan: makePlan({ routines: [makeAdvice()] }),
      }),
    ).toEqual([]);
  });

  it('gives a car trip with no distance only the idling tip', () => {
    const noKm = makeRoutine();
    delete noKm.km;
    const list = buildAlternatives({
      household: makeHousehold({ routines: [noKm] }),
      plan: makePlan({ routines: [makeAdvice()] }),
    });
    expect(ids(list)).toEqual(['no-idling']);
  });

  it('is empty for an adult who already takes the metro', () => {
    expect(alternatives({ routine: { km: 12, mode: 'metro_rail' } })).toEqual([]);
  });
});

describe('exposure ratios', () => {
  it('only ever reports a reduction between 10 and 100 percent, for every pair of modes', () => {
    for (const from of MODES as readonly Mode[]) {
      for (const to of MODES as readonly Mode[]) {
        const change = exposureLessPercent(from, to);
        if (change === null) continue;
        expect(change.less).toBeGreaterThanOrEqual(10);
        expect(change.less).toBeLessThanOrEqual(100);
        expect(change.less % 5).toBe(0);
      }
    }
  });

  it('never reports a gain for moving to a mode with a higher ratio', () => {
    expect(exposureLessPercent('metro_rail', 'two_wheeler')).toBeNull();
    expect(exposureLessPercent('car', 'walk')).toBeNull();
  });
});

describe('every alternative', () => {
  const places = [DELHI, MUMBAI, SMALL_TOWN];
  const levels: (Band | null)[] = ['good', 'moderate', 'poor', 'severe', null];
  const kms = [0.5, 1.5, 2, 4.5, 6, 15, 15.5, 30];
  const modes: Mode[] = ['car', 'two_wheeler', 'auto', 'bus', 'walk'];
  const all = places.flatMap((place) =>
    levels.flatMap((level) =>
      kms.flatMap((km) =>
        modes.flatMap((mode) =>
          alternatives({
            place,
            routine: { km, mode },
            advice: { level },
          }),
        ),
      ),
    ),
  );

  it('lists every number its impact text shows', () => {
    expect(all.length).toBeGreaterThan(100);
    for (const a of all) {
      expect(checkNumbers(a.impact.text, a.impact.numbers).unknown, a.id).toEqual([]);
    }
  });

  it('has no unfilled placeholder, no dash and no claim that anything is safe', () => {
    for (const a of all) {
      const text = [a.title, a.body, a.reason.text, a.impact.text].join(' ');
      expect(text, a.id).not.toMatch(UNFILLED);
      expect(text, a.id).not.toMatch(DASHES);
      expect(text, a.id).not.toMatch(CLAIMS_SAFE);
    }
  });

  it('keeps percentLess between 0 and 100', () => {
    for (const a of all) {
      if (a.impact.percentLess === undefined) continue;
      expect(a.impact.percentLess).toBeGreaterThan(0);
      expect(a.impact.percentLess).toBeLessThanOrEqual(100);
    }
  });
});

describe('alternative rules data', () => {
  it('quotes every sourced row and marks every assumption as a Saans rule', () => {
    for (const rule of ALTERNATIVE_RULES) {
      for (const source of [rule.source, rule.alsoSource, rule.then.impact.source]) {
        if (!source) continue;
        if (source.status === 'P-READ') expect(source.quote, rule.id).toBeTruthy();
        if (source.status === 'APP') expect(source.title).toMatch(/^Saans rule: /);
      }
    }
  });
});
