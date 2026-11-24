import { describe, expect, it } from 'vitest';

import { readDraft, type ReaderOutput } from '@/core/reader';

const text =
  'My son Aarav plays football on Mon to Fri for 45 minutes at 5 pm, a brisk run. We live in a 180 sq ft flat with a 10 ft ceiling, ' +
  'cook on LPG, light incense every evening and use an angithi in winter. The purifier has a CADR of 200 cfm.';

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
    purifierCadrCfm: { value: 200, quote: 'CADR of 200 cfm' },
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

  describe('the purifier rating', () => {
    const read = (said: string, quote: string, value: number) =>
      readDraft(said, { ...base, home: { ...base.home, purifierCadrCfm: { value, quote } } });

    it('converts a rating given in m3/h to cfm', () => {
      for (const unit of ['m3/h', 'm³/h', 'm3/hr', 'm3 per hour', 'cmh']) {
        const said = `The purifier has a CADR of 340 ${unit}.`;
        expect(read(said, `340 ${unit}`, 340).home.purifierCadrCfm, unit).toBe(200);
      }
    });

    it('does not read a bare CADR as cfm, and asks for the unit', () => {
      const said = 'The purifier has a CADR of 400.';
      const { home, notes } = read(said, 'CADR of 400', 400);
      expect(home.purifierCadrCfm).toBeUndefined();
      expect(notes.join(' ')).toContain('needs its unit');
      expect(notes.join(' ')).toContain('cfm or m3/h');
    });

    it('keeps a rating stated in cfm as it is, and a rating with no purifier words alone', () => {
      expect(read('Purifier CADR 350 cfm.', '350 cfm', 350).home.purifierCadrCfm).toBe(350);
      const none = read('We have 400 things.', '400', 400);
      expect(none.home.purifierCadrCfm).toBeUndefined();
      expect(none.notes.join(' ')).not.toContain('needs its unit');
    });

    it('drops a rating that is out of range in either unit', () => {
      expect(read('A CADR of 9000 cfm.', '9000 cfm', 9000).home.purifierCadrCfm).toBeUndefined();
      expect(read('A CADR of 9000 m3/h.', '9000 m3/h', 9000).home.purifierCadrCfm).toBeUndefined();
    });
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

describe('what the model reads correctly but the checks used to drop', () => {
  const empty = { conditions: [] as never[] };
  const home = { habits: [] };

  it('keeps the age and the walk of "My father is 72 and walks at 6 am in Lajpat Nagar"', () => {
    const said = 'My father is 72 and walks at 6 am in Lajpat Nagar';
    const draft = readDraft(said, {
      place: { value: 'Lajpat Nagar', quote: 'Lajpat Nagar' },
      members: [
        {
          label: { value: 'father', quote: 'father' },
          years: { value: 72, quote: '72' },
          ...empty,
        },
      ],
      routines: [
        {
          who: { value: 'father', quote: 'father' },
          kind: { value: 'walk', quote: 'walk' },
          start: { value: '06:00', quote: '6 am' },
        },
      ],
      home,
    });
    expect(draft.members.map((m) => [m.label, m.ageBand])).toEqual([['Father', 'older']]);
    expect(draft.routines.map((r) => [r.memberId, r.kind, r.start])).toEqual([
      ['father', 'walk', '06:00'],
    ]);
    expect(draft.notes.join(' ')).not.toContain('Assumed an adult');
  });

  it('keeps the walk of "My dadi walks every morning at 7" and drops the echoed statement', () => {
    const said = 'My dadi walks every morning at 7 in Lajpat Nagar';
    const draft = readDraft(said, {
      members: [{ label: { value: 'dadi', quote: 'dadi' }, ...empty }],
      routines: [
        {
          who: { value: 'dadi', quote: 'dadi' },
          kind: { value: 'walk', quote: 'walk' },
          start: { value: '07:00', quote: '7' },
          days: {
            value: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'],
            quote: 'every morning',
          },
        },
      ],
      home,
      question: {
        text: { value: said, quote: said },
        about: { value: 'dadi', quote: 'dadi' },
      },
    });
    expect(draft.members.map((m) => m.ageBand)).toEqual(['older']);
    expect(draft.routines.map((r) => [r.kind, r.start, r.days.length])).toEqual([
      ['walk', '07:00', 7],
    ]);
    expect(draft.question).toBeUndefined();
    expect(draft.target).toBeUndefined();
    expect(draft.notes.join(' ')).not.toContain('every day');
  });

  it('keeps a real question, with or without a question mark', () => {
    const output = (said: string): ReaderOutput => ({
      members: [{ label: { value: 'dadi', quote: 'dadi' }, ...empty }],
      routines: [],
      home,
      question: { text: { value: said, quote: said }, about: { value: 'dadi', quote: 'dadi' } },
    });
    for (const said of [
      'Can my dadi walk today?',
      'should my dadi walk today',
      'kya dadi sair kar sakti hain',
    ]) {
      expect(readDraft(said, output(said)).question, said).toBe(said);
    }
  });

  it('reads an older adult from a role word when no age is given', () => {
    const roles = [
      'dadi',
      'nani',
      'dada',
      'nana',
      'grandmother',
      'grandfather',
      'grandma',
      'grandpa',
    ];
    for (const role of roles) {
      const draft = readDraft(`My ${role} walks at 6 am`, {
        members: [{ label: { value: role, quote: role }, ...empty }],
        routines: [],
        home,
      });
      expect(
        draft.members.map((m) => m.ageBand),
        role,
      ).toEqual(['older']);
    }
  });

  it('keeps Hinglish "70 saal" and the walk working', () => {
    const said = 'Meri nani 70 saal ki hain aur subah 6 baje walk karti hain, Lajpat Nagar';
    const draft = readDraft(said, {
      members: [
        {
          label: { value: 'nani', quote: 'nani' },
          years: { value: 70, quote: '70 saal' },
          ...empty,
        },
      ],
      routines: [
        {
          who: { value: 'nani', quote: 'nani' },
          kind: { value: 'walk', quote: 'walk' },
          start: { value: '06:00', quote: '6 baje' },
        },
      ],
      home,
    });
    expect(draft.members.map((m) => m.ageBand)).toEqual(['older']);
    expect(draft.routines.map((r) => [r.kind, r.start])).toEqual([['walk', '06:00']]);
  });

  describe('an age next to a person word', () => {
    const bandOf = (said: string, label: string, years: number, quote: string) =>
      readDraft(said, {
        members: [
          { label: { value: label, quote: label }, years: { value: years, quote }, ...empty },
        ],
        routines: [],
        home,
      }).members.map((m) => m.ageBand)[0];

    it.each([
      ['my father, 72, walks at 6 am', 'father', 72, '72'],
      ['I have a 72-year-old father who walks', 'father', 72, '72'],
      ['my father aged 72 walks at 6 am', 'father', 72, '72'],
      ['my father is 72 years old', 'father', 72, '72'],
      ['mere father 72 saal ke hain', 'father', 72, '72'],
    ])('counts "%s" as an age', (said, label, years, quote) => {
      expect(bandOf(said, label, years, quote)).toBe('older');
    });

    it.each([
      // A clock time, a distance, a count and an AQI are not ages: the role decides.
      ['my father walks at 6 am', 'father', 6, '6', 'adult'],
      ['my father walks 5 km every day', 'father', 5, '5', 'adult'],
      ['my father is 6 am regular', 'father', 6, '6', 'adult'],
      ['my father has 3 kids', 'father', 3, '3', 'adult'],
      ['my father says the AQI is 90', 'father', 90, '90', 'adult'],
      // A temperature, a weight and a floor are not ages either.
      ['my mother thinks it is 65 outside', 'mother', 65, '65', 'adult'],
      ['my father weighs 70 kg and my father is 70 kg', 'father', 70, '70', 'adult'],
      ['my son is 72 floors up', 'son', 72, '72', 'child'],
      // The number belongs to someone else in the text.
      ['my father is 72 and my son is 8', 'son', 72, '72', 'child'],
      // Months are a baby, not an age in years.
      ['my baby is 8 months old', 'baby', 8, '8', 'infant'],
    ])('does not read "%s" as an age', (said, label, years, quote, band) => {
      expect(bandOf(said, label, years, quote)).toBe(band);
    });
  });

  describe('every routine kind in another form', () => {
    type Kind = ReaderOutput['routines'][number]['kind']['value'];
    const cases: [Kind, string, string][] = [
      ['walk', 'My father walks at 6 am', 'walk'],
      ['walk', 'My father walked at 6 am', 'walk'],
      ['walk', 'My father is walking at 6 am', 'walk'],
      ['outdoor_play', 'My son plays at 6 am', 'play'],
      ['outdoor_play', 'My son is playing at 6 am', 'play'],
      ['sport', 'My son runs at 6 am', 'run'],
      ['sport', 'My son is running at 6 am', 'run'],
      ['sport', 'My son ran at 6 am', 'run'],
      ['sport', 'My son is jogging at 6 am', 'jog'],
      ['sport', 'My son goes to the gym at 6 am', 'gym'],
      ['sport', 'My son exercises at 6 am', 'exercise'],
      ['school_run', 'My son goes to school at 6 am', 'school'],
      ['commute', 'My father is commuting at 6 am', 'commute'],
      ['commute', 'My father works at 6 am', 'work'],
      ['errand', 'My father is shopping at 6 am', 'shopping'],
      ['errand', 'My father goes to the market at 6 am', 'market'],
    ];
    const keep = (said: string, kind: Kind, quote: string) => {
      const who = said.includes('father') ? 'father' : 'son';
      return readDraft(said, {
        members: [{ label: { value: who, quote: who }, ...empty }],
        routines: [
          {
            who: { value: who, quote: who },
            kind: { value: kind, quote },
            start: { value: '06:00', quote: '6 am' },
          },
        ],
        home,
      }).routines.map((r) => r.kind);
    };

    it.each(cases)('keeps a %s from "%s"', (kind, said, quote) => {
      expect(keep(said, kind, quote)).toEqual([kind]);
    });

    it('still refuses a kind whose quote is not in the text', () => {
      expect(keep('My father sleeps at 6 am', 'walk', 'walk')).toEqual([]);
      expect(keep('My father walks at 6 am', 'sport', 'run')).toEqual([]);
    });
  });
});
