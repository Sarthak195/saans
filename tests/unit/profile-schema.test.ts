import { describe, expect, it } from 'vitest';

import { householdSchema, MAX_LABEL, MAX_MEMBERS, MAX_ROUTINES } from '@/core/profile/schema';
import type { Household, Member, Routine } from '@/core/types';

function member(id: string): Member {
  return { id, label: `Member ${id}`, ageBand: 'adult', conditions: [] };
}

function routine(id: string, memberId = 'm1'): Routine {
  return {
    id,
    memberId,
    kind: 'walk',
    start: '07:30',
    minutes: 30,
    intensity: 'light',
    days: ['mon', 'tue'],
    flexHours: 1,
  };
}

function household(overrides: Partial<Household> = {}): Household {
  return {
    v: 1,
    place: { name: 'Delhi', admin1: 'Delhi', lat: 28.6, lon: 77.2 },
    members: [member('m1')],
    routines: [routine('r1')],
    home: { cooking: 'lpg_png', habits: [], heating: 'none' },
    lang: 'en',
    ...overrides,
  };
}

function firstIssuePath(value: unknown): string {
  const result = householdSchema.safeParse(value);
  if (result.success) return 'valid';
  return result.error.issues[0]?.path.join('.') ?? '';
}

describe('householdSchema', () => {
  it('accepts a complete household', () => {
    const full = household({
      question: 'Is it safe for the baby to go out?',
      members: [{ ...member('m1'), ageBand: 'infant', conditions: ['asthma_copd'] }],
      routines: [
        {
          ...routine('r1'),
          mode: 'two_wheeler',
          km: 6.5,
          freeFrom: '09:00',
          freeTo: '17:00',
        },
      ],
      home: {
        roomSqft: 180,
        ceilingFt: 10,
        purifierCadrCfm: 250,
        cooking: 'biomass',
        habits: ['incense'],
        heating: 'angithi_coal',
      },
      community: { kind: 'school', households: 120, outdoorSlots: [routine('s1')] },
    });
    expect(householdSchema.safeParse(full).success).toBe(true);
  });

  it('accepts exactly the maximum members and routines', () => {
    const ids = Array.from({ length: MAX_MEMBERS }, (_, i) => `m${String(i + 1)}`);
    const routines = Array.from({ length: MAX_ROUTINES }, (_, i) => routine(`r${String(i)}`));
    const full = household({ members: ids.map(member), routines });
    expect(householdSchema.safeParse(full).success).toBe(true);
  });

  it.each([
    [
      'too many members',
      () => ({
        members: Array.from({ length: MAX_MEMBERS + 1 }, (_, i) => member(`m${String(i)}`)),
      }),
      'members',
    ],
    ['no members', () => ({ members: [] }), 'members'],
    [
      'too many routines',
      () => ({
        routines: Array.from({ length: MAX_ROUTINES + 1 }, (_, i) => routine(`r${String(i)}`)),
      }),
      'routines',
    ],
    [
      'a label over the limit',
      () => ({ members: [{ ...member('m1'), label: 'x'.repeat(MAX_LABEL + 1) }] }),
      'members.0.label',
    ],
    ['an empty label', () => ({ members: [{ ...member('m1'), label: '  ' }] }), 'members.0.label'],
    ['an overlong question', () => ({ question: 'q'.repeat(1501) }), 'question'],
    [
      'a latitude south of India',
      () => ({ place: { name: 'x', admin1: 'y', lat: 5.9, lon: 77 } }),
      'place.lat',
    ],
    [
      'a latitude north of India',
      () => ({ place: { name: 'x', admin1: 'y', lat: 38.1, lon: 77 } }),
      'place.lat',
    ],
    [
      'a longitude west of India',
      () => ({ place: { name: 'x', admin1: 'y', lat: 20, lon: 67.9 } }),
      'place.lon',
    ],
    [
      'a longitude east of India',
      () => ({ place: { name: 'x', admin1: 'y', lat: 20, lon: 98.1 } }),
      'place.lon',
    ],
    [
      'coordinates finer than 0.1 degree',
      () => ({ place: { name: 'x', admin1: 'y', lat: 28.61, lon: 77.2 } }),
      'place.lat',
    ],
    [
      'a routine for an unknown member',
      () => ({ routines: [routine('r1', 'ghost')] }),
      'routines.0.memberId',
    ],
    ['duplicate member ids', () => ({ members: [member('m1'), member('m1')] }), 'members'],
    ['duplicate routine ids', () => ({ routines: [routine('r1'), routine('r1')] }), 'routines'],
    ['a language other than en or hi', () => ({ lang: 'fr' as unknown as 'en' }), 'lang'],
    ['an unknown version', () => ({ v: 2 as unknown as 1 }), 'v'],
  ])('rejects %s', (_name, make, path) => {
    expect(firstIssuePath({ ...household(), ...make() })).toBe(path);
  });

  it.each([
    ['24:00', 'start'],
    ['7:30', 'start'],
    ['07:60', 'start'],
    ['07:30pm', 'start'],
  ])('rejects the time %s', (value, field) => {
    const bad = household({ routines: [{ ...routine('r1'), [field]: value }] });
    expect(firstIssuePath(bad)).toBe(`routines.0.${field}`);
  });

  it.each([-1, 5, 1.5])('rejects flexHours of %s', (flexHours) => {
    const bad = household({ routines: [{ ...routine('r1'), flexHours }] });
    expect(firstIssuePath(bad)).toBe('routines.0.flexHours');
  });

  it.each([0, 4])('accepts flexHours of %s', (flexHours) => {
    const ok = household({ routines: [{ ...routine('r1'), flexHours }] });
    expect(householdSchema.safeParse(ok).success).toBe(true);
  });

  it('requires free hours to come as a pair', () => {
    const bad = household({ routines: [{ ...routine('r1'), freeFrom: '09:00' }] });
    expect(firstIssuePath(bad)).toBe('routines.0.freeTo');
  });

  it('rejects a routine with no days and with a repeated day', () => {
    expect(firstIssuePath(household({ routines: [{ ...routine('r1'), days: [] }] }))).toBe(
      'routines.0.days',
    );
    expect(
      firstIssuePath(household({ routines: [{ ...routine('r1'), days: ['mon', 'mon'] }] })),
    ).toBe('routines.0.days');
  });

  it('rejects unknown fields so a stray key cannot ride along in a sealed link', () => {
    expect(householdSchema.safeParse({ ...household(), admin: true }).success).toBe(false);
  });

  it('rejects ids that could break out of a URL or an attribute', () => {
    expect(firstIssuePath(household({ members: [member('a b')] }))).toBe('members.0.id');
  });

  it('rejects a repeated condition', () => {
    const bad = household({
      members: [{ ...member('m1'), conditions: ['heart', 'heart'] }],
    });
    expect(firstIssuePath(bad)).toBe('members.0.conditions');
  });

  it('rejects a non-object', () => {
    expect(householdSchema.safeParse(null).success).toBe(false);
    expect(householdSchema.safeParse('household').success).toBe(false);
  });
});
