import { describe, expect, it } from 'vitest';

import samplesData from '@/data/samples.json';
import { householdSchema } from '@/core/profile/schema';
import { SAMPLES, sampleById } from '@/core/profile/samples';
import { quoteInText } from '@/core/text';
import { SNAPSHOT_TARGETS } from '@/server/air/recorded-targets';

function sample(id: string) {
  const found = sampleById(id);
  if (found === undefined) throw new Error(`missing sample ${id}`);
  return found;
}

describe('SAMPLES', () => {
  it('holds exactly the six samples, in order, with unique ids', () => {
    expect(SAMPLES.map((s) => s.id)).toEqual(['s1', 's2', 's3', 's4', 's5', 's6']);
    expect(new Set(SAMPLES.map((s) => s.id)).size).toBe(6);
    expect(samplesData).toHaveLength(6);
  });

  it.each(SAMPLES.map((s) => [s.id, s] as const))('%s has a household that validates', (_id, s) => {
    expect(householdSchema.safeParse(s.household).success).toBe(true);
  });

  it.each(SAMPLES.map((s) => [s.id, s] as const))(
    '%s points at a recorded place that matches its coordinates',
    (_id, s) => {
      const target = SNAPSHOT_TARGETS.find((t) => t.id === s.recordedId);
      expect(target).toBeDefined();
      expect(s.household.place.lat).toBe(target?.lat);
      expect(s.household.place.lon).toBe(target?.lon);
    },
  );

  it.each(SAMPLES.map((s) => [s.id, s] as const))(
    '%s carries a source, a title and a one-line summary',
    (_id, s) => {
      expect(s.source.status).toBe('APP');
      expect(s.source.title.startsWith('Saans rule:')).toBe(true);
      expect(s.title).not.toMatch(/\n/);
      expect(s.summary).not.toMatch(/\n/);
    },
  );

  it('labels members with neutral family words, never personal names', () => {
    const allowed =
      /^(Son|Daughter|Mother|Father|Parent( \d)?|Grandmother|Grandfather|Baby|Older child|Younger child|Me|Coordinator)$/;
    for (const s of SAMPLES) {
      for (const member of s.household.members) expect(member.label).toMatch(allowed);
    }
  });

  it('keeps every routine and slot on a member of the household', () => {
    for (const s of SAMPLES) {
      const ids = new Set(s.household.members.map((m) => m.id));
      const slots = s.household.community?.outdoorSlots ?? [];
      for (const routine of [...s.household.routines, ...slots]) {
        expect(ids.has(routine.memberId)).toBe(true);
      }
    }
  });

  it('uses no dashes in user-facing words', () => {
    for (const s of SAMPLES) {
      const words = `${s.title} ${s.summary} ${s.text ?? ''}`;
      for (const code of [0x2013, 0x2014]) {
        expect(words.includes(String.fromCharCode(code))).toBe(false);
      }
    }
  });
});

describe('sampleById', () => {
  it('finds a sample and returns undefined for an unknown id', () => {
    expect(sampleById('s3')?.household.place.name).toBe('Andheri');
    expect(sampleById('s9')).toBeUndefined();
  });
});

describe('S1, the Delhi family', () => {
  const s1 = sample('s1');

  it('asks about the cricket routine today', () => {
    const play = s1.household.routines.find((r) => r.id === s1.question?.routineId);
    expect(play?.kind).toBe('outdoor_play');
    expect(play?.start).toBe('17:00');
    expect(s1.question?.aboutToday).toBe(true);
  });

  it('describes the household the spec names', () => {
    const { members, routines, home } = s1.household;
    const byId = (id: string) => members.find((m) => m.id === id);
    expect(byId('grandmother')).toMatchObject({ ageBand: 'older', conditions: ['asthma_copd'] });
    expect(byId('son')?.ageBand).toBe('child');
    const walk = routines.find((r) => r.memberId === 'grandmother');
    expect(walk).toMatchObject({ start: '06:30', minutes: 30, intensity: 'light' });
    expect(walk?.days).toHaveLength(7);
    const play = routines.find((r) => r.memberId === 'son');
    expect(play).toMatchObject({ minutes: 60, intensity: 'vigorous', flexHours: 3 });
    expect(play?.days).toEqual(['mon', 'tue', 'wed', 'thu', 'fri', 'sat']);
    const drive = routines.find((r) => r.kind === 'commute');
    expect(drive).toMatchObject({ mode: 'car', km: 18, start: '08:30', minutes: 45 });
    expect(home).toMatchObject({ habits: ['incense'], cooking: 'lpg_png', roomSqft: 180 });
    expect(home.purifierCadrCfm).toBeUndefined();
  });

  it('has typed text that contains every fact the profile quotes', () => {
    const text = s1.text ?? '';
    const facts = [
      'Lajpat Nagar',
      'My son is 7',
      'plays cricket downstairs around 5 pm',
      'My mother has asthma',
      'walks at 6:30 am',
      'I drive to Gurugram at 8:30',
      s1.household.question ?? '',
    ];
    for (const fact of facts) expect(quoteInText(text, fact), fact).toBe(true);
  });
});

describe('S2, the Hinglish runner', () => {
  const s2 = sample('s2');

  it('has Hinglish text that holds the facts its profile claims', () => {
    const text = s2.text ?? '';
    for (const fact of [
      'Lajpat Nagar mein rehta hoon',
      '26 saal',
      '6 baje run karta hoon',
      '9 baje scooty se 9 km',
    ]) {
      expect(quoteInText(text, fact), fact).toBe(true);
    }
    const [run, ride] = s2.household.routines;
    expect(run).toMatchObject({
      kind: 'sport',
      start: '06:00',
      minutes: 45,
      intensity: 'vigorous',
    });
    expect(ride).toMatchObject({ mode: 'two_wheeler', km: 9, start: '09:00', minutes: 30 });
  });
});

describe('S3 to S6', () => {
  it('S3 has a couple and an infant, with a train commute and a pram walk', () => {
    const s3 = sample('s3');
    expect(s3.household.members.map((m) => m.ageBand).sort()).toEqual(['adult', 'adult', 'infant']);
    expect(s3.household.routines.some((r) => r.mode === 'metro_rail' && r.start === '08:00')).toBe(
      true,
    );
    expect(s3.household.routines.find((r) => r.memberId === 'baby')).toMatchObject({
      start: '17:30',
      intensity: 'light',
    });
  });

  it('S4 has two older adults, one with a heart condition, and a coal heater', () => {
    const s4 = sample('s4');
    expect(s4.household.members.every((m) => m.ageBand === 'older')).toBe(true);
    expect(s4.household.members.some((m) => m.conditions.includes('heart'))).toBe(true);
    expect(s4.household.home.heating).toBe('angithi_coal');
    expect(s4.household.routines.every((r) => r.start === '06:00' && r.intensity === 'light')).toBe(
      true,
    );
  });

  it('S5 has two adults, two children, a school walk and evening play', () => {
    const s5 = sample('s5');
    const bands = s5.household.members.map((m) => m.ageBand).sort();
    expect(bands).toEqual(['adult', 'adult', 'child', 'child']);
    expect(
      s5.household.routines.some(
        (r) => r.kind === 'school_run' && r.start === '07:30' && r.km === 1.5,
      ),
    ).toBe(true);
    expect(
      s5.household.routines.some((r) => r.kind === 'outdoor_play' && r.start === '17:30'),
    ).toBe(true);
  });

  it('S6 is a school with three outdoor slots and 300 households', () => {
    const community = sample('s6').household.community;
    expect(community).toMatchObject({ kind: 'school', households: 300 });
    expect(community?.outdoorSlots.map((r) => [r.start, r.minutes])).toEqual([
      ['08:00', 20],
      ['11:00', 40],
      ['15:00', 60],
    ]);
    expect(sample('s6').household.members).toHaveLength(1);
  });
});
