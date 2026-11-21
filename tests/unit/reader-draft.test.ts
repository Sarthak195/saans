import { describe, expect, it } from 'vitest';

import { readDraft, type ReaderOutput } from '@/core/reader';

const text =
  'My son Aarav plays football on Mon to Fri for 45 minutes at 5 pm, a brisk run. We live in a 180 sq ft flat with a 10 ft ceiling, ' +
  'cook on LPG, light incense every evening and use an angithi in winter. The purifier has a CADR of 200.';

const base: ReaderOutput = {
  members: [{ label: { value: 'son', quote: 'My son' }, conditions: [] }],
  routines: [
    {
      who: { value: 'son', quote: 'My son' },
      kind: { value: 'outdoor_play', quote: 'plays football' },
      start: { value: '17:00', quote: '5 pm' },
      minutes: { value: 45, quote: '45 minutes' },
      intensity: { value: 'vigorous', quote: 'brisk run' },
      days: { value: ['mon', 'tue', 'wed', 'thu', 'fri'], quote: 'Mon to Fri' },
    },
  ],
  home: {
    roomSqft: { value: 180, quote: '180 sq ft' },
    ceilingFt: { value: 10, quote: '10 ft' },
    purifierCadrCfm: { value: 200, quote: 'CADR of 200' },
    cooking: { value: 'lpg_png', quote: 'cook on LPG' },
    habits: [{ value: 'incense', quote: 'light incense' }],
    heating: { value: 'angithi_coal', quote: 'an angithi' },
  },
};

const [firstRoutine] = base.routines;
if (!firstRoutine) throw new Error('The base output has no routine');

describe('reading the home', () => {
  it('keeps cooking, a habit, heating and sizes the text states with their units', () => {
    const { home, notes } = readDraft(text, base);
    expect(home).toEqual({
      cooking: 'lpg_png',
      habits: ['incense'],
      heating: 'angithi_coal',
      roomSqft: 180,
      ceilingFt: 10,
      purifierCadrCfm: 200,
    });
    expect(notes.join(' ')).not.toContain('cooking on LPG or PNG');
  });

  it('drops a fabricated value and a number with no unit, and assumes the default', () => {
    const { home, notes } = readDraft(text, {
      ...base,
      home: {
        roomSqft: { value: 7, quote: '7' },
        ceilingFt: { value: 12, quote: '12' },
        purifierCadrCfm: { value: 5000, quote: '5000' },
        cooking: { value: 'biomass', quote: 'firewood' },
        habits: [
          { value: 'smoking', quote: 'smokes' },
          { value: 'candles', quote: 'light incense' },
        ],
        heating: { value: 'gas', quote: 'gas heater' },
      },
    });
    expect(home).toEqual({ cooking: 'lpg_png', habits: [], heating: 'none' });
    expect(notes).toContain('Assumed cooking on LPG or PNG and no heating. Change it in the form.');
  });

  it('does not let a size outside what a home can have through', () => {
    const big = 'The room is 90000 sq ft and the ceiling is 2 ft.';
    const { home } = readDraft(big, {
      ...base,
      members: [],
      routines: [],
      home: {
        roomSqft: { value: 90000, quote: '90000 sq ft' },
        ceilingFt: { value: 2, quote: '2 ft' },
        habits: [],
      },
    });
    expect(home.roomSqft).toBeUndefined();
    expect(home.ceilingFt).toBeUndefined();
  });
});

describe('reading a routine', () => {
  it('keeps the duration, days and effort the text supports', () => {
    const [routine] = readDraft(text, base).routines;
    expect(routine).toMatchObject({
      kind: 'outdoor_play',
      start: '17:00',
      minutes: 45,
      intensity: 'vigorous',
      days: ['mon', 'tue', 'wed', 'thu', 'fri'],
    });
  });

  it('does not use a duration, days or effort whose quote does not say it', () => {
    const [routine] = readDraft(text, {
      ...base,
      routines: [
        {
          ...firstRoutine,
          minutes: { value: 120, quote: 'for' },
          days: { value: ['sat', 'sun'], quote: 'at 5 pm' },
          intensity: { value: 'light', quote: 'My son' },
        },
      ],
    }).routines;
    // A claim its quote does not support is not used: the default and the text's own words stand in.
    expect(routine?.minutes).toBe(60);
    expect(routine?.days).toHaveLength(7);
    expect(routine?.intensity).toBe('vigorous');
  });

  it('assumes a duration and every day, and says so', () => {
    const quiet = 'My son plays football at 5 pm.';
    const { routines, notes } = readDraft(quiet, {
      ...base,
      routines: [
        {
          who: { value: 'son', quote: 'My son' },
          kind: { value: 'outdoor_play', quote: 'plays football' },
          start: { value: '17:00', quote: '5 pm' },
        },
      ],
    });
    expect(routines[0]).toMatchObject({
      minutes: 60,
      days: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'],
    });
    expect(notes).toContain('Assumed 60 minutes for football. Change it in the form.');
    expect(notes).toContain('Assumed every day for football. Change it in the form.');
  });

  it('assumes a time from a part of the day, with a note', () => {
    const evening = 'My son plays football every evening.';
    const { routines, notes } = readDraft(evening, {
      ...base,
      routines: [
        {
          who: { value: 'son', quote: 'My son' },
          kind: { value: 'outdoor_play', quote: 'plays football' },
          start: { value: '18:00', quote: 'every evening' },
        },
      ],
    });
    expect(routines[0]?.start).toBe('17:00');
    expect(notes).toContain('Assumed 17:00 for the football. Change it in the form.');
  });

  it('says "you" for the writer when an age is assumed', () => {
    const { notes } = readDraft('I walk at 6 am.', {
      members: [{ label: { value: 'me', quote: 'I' }, conditions: [] }],
      routines: [],
      home: { habits: [] },
    });
    expect(notes).toContain('Assumed an adult for you. Change it in the form.');
  });
});
