import { describe, expect, it } from 'vitest';

import { clockTimes, keywordOutput, readDraft } from '@/core/reader';
import { bareClockTimes, dayPartClock, daysIn, minutesIn, tidyClock } from '@/core/reader/clock';
import { detectLang } from '@/core/reader/draft';
import { ageBandOfYears } from '@/core/reader/members';
import { hasTerm } from '@/core/reader/terms';
import { STATIC_PLACES } from '@/server/geo/places';

import { INJECTION_TEXT, sampleText } from '../helpers/genai';

describe('clock times', () => {
  it.each([
    ['around 5 pm', ['17:00']],
    ['6:30 am', ['06:30']],
    ['17:00', ['17:00']],
    ['6:30 pm', ['18:30']],
    ['12 pm', ['12:00']],
    ['12 am', ['00:00']],
    ['5pm', ['17:00']],
    ['5 p.m.', ['17:00']],
    ['9 baje', ['09:00', '21:00']],
    ['subah 6 baje', ['06:00']],
    ['shaam 6 baje', ['18:00']],
    ['५ बजे शाम', ['17:00']],
    ['at 8:30', ['08:30', '20:30']],
    ['08:30', ['08:30']],
    ['around 7', ['07:00', '19:00']],
  ])('reads %s', (quote, expected) => {
    expect(clockTimes(quote)).toEqual(expected);
  });

  it('does not take a distance, a duration or an age for a time', () => {
    expect(clockTimes('9 km to the office for 45 minutes at age 26 in 2 hours')).toEqual([]);
    expect(clockTimes('26 saal ka hoon')).toEqual([]);
  });

  it('tidies and rejects clock strings', () => {
    expect(tidyClock('5:00')).toBe('05:00');
    expect(tidyClock('25:00')).toBeUndefined();
    expect(tidyClock('five')).toBeUndefined();
  });

  it('reads a bare hour only when the text itself gives that time', () => {
    expect(bareClockTimes('6', 'Subah 6 baje run karta hoon')).toEqual(['06:00']);
    expect(bareClockTimes('6', 'We have 6 cats')).toEqual([]);
    expect(bareClockTimes('six', 'at 6 pm')).toEqual([]);
  });

  it('names the part of the day when no hour is given', () => {
    expect(dayPartClock('every evening')).toBe('17:00');
    expect(dayPartClock('subah')).toBe('07:00');
    expect(dayPartClock('whenever')).toBeUndefined();
  });
});

describe('durations and days', () => {
  it.each([
    ['for 45 minutes', [45]],
    ['an hour', [60]],
    ['half an hour', [30]],
    ['1.5 hours', [90]],
    ['do ghante', [120]],
    ['20 min', [20]],
    ['whenever', []],
  ])('reads the duration in %s', (quote, expected) => {
    expect(minutesIn(quote)).toEqual(expected);
  });

  it.each([
    ['Mon to Fri', ['mon', 'tue', 'wed', 'thu', 'fri']],
    ['Mon-Fri', ['mon', 'tue', 'wed', 'thu', 'fri']],
    ['weekdays', ['mon', 'tue', 'wed', 'thu', 'fri']],
    ['on weekends', ['sat', 'sun']],
    ['Saturdays and Sundays', ['sat', 'sun']],
    ['every day', ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']],
    ['Sat to Mon', ['mon', 'sat', 'sun']],
    ['tomorrow', []],
  ])('reads the days in %s', (quote, expected) => {
    expect(daysIn(quote)).toEqual(expected);
  });
});

describe('ages and words', () => {
  it.each([
    [0, 'infant'],
    [1, 'under5'],
    [4, 'under5'],
    [5, 'child'],
    [12, 'child'],
    [13, 'teen'],
    [17, 'teen'],
    [18, 'adult'],
    [59, 'adult'],
    [60, 'older'],
    [95, 'older'],
  ])('puts %i years in %s', (years, band) => {
    expect(ageBandOfYears(years)).toBe(band);
  });

  it('matches whole words, not parts of words', () => {
    expect(hasTerm('he is a person', 'son')).toBe(false);
    expect(hasTerm('my son plays', 'son')).toBe(true);
    expect(hasTerm('he is running', 'run')).toBe(true);
    // A one-letter word must not match the start of "is".
    expect(hasTerm('the aqi is 20', 'i')).toBe(false);
    expect(hasTerm('I drive', 'i')).toBe(true);
  });

  it('calls a text Hindi only when most of it is in Devanagari', () => {
    expect(detectLang('Main Lajpat Nagar mein rehta hoon')).toBe('en');
    expect(detectLang('मैं लाजपत नगर में रहता हूँ')).toBe('hi');
    expect(detectLang('12345')).toBe('en');
  });
});

describe('the keyword reader', () => {
  const read = (text: string) => readDraft(text, keywordOutput(text, STATIC_PLACES));

  it('finds the place near "live in", not the city the family drives to', () => {
    const draft = read(sampleText('s1'));
    expect(draft.placeQuery).toBe('Lajpat Nagar');
  });

  it('finds the family, the ages and the routines in the English sample', () => {
    const draft = read(sampleText('s1'));
    expect(draft.members.map((m) => [m.label, m.ageBand, m.conditions])).toEqual([
      ['Son', 'child', []],
      ['Mother', 'adult', ['asthma_copd']],
      ['Me', 'adult', []],
    ]);
    expect(draft.routines.map((r) => [r.memberId, r.kind, r.start, r.mode ?? null])).toEqual([
      ['son', 'outdoor_play', '17:00', null],
      ['mother', 'walk', '06:30', null],
      ['me', 'commute', '08:30', 'car'],
    ]);
    expect(draft.question).toBe('Can my son play outside this evening?');
    expect(draft.target).toMatchObject({ memberId: 'son', aboutToday: true });
  });

  it('reads Hinglish ages, times and distances', () => {
    const draft = read(sampleText('s2'));
    expect(draft.members).toEqual([expect.objectContaining({ label: 'Me', ageBand: 'adult' })]);
    expect(draft.routines.map((r) => [r.kind, r.start, r.mode, r.km])).toEqual([
      ['sport', '06:00', undefined, undefined],
      ['commute', '09:00', 'two_wheeler', 9],
    ]);
    expect(draft.notes).not.toContain('Assumed an adult for me. Change it in the form.');
  });

  it('reads "N years", "N saal" and number words as ages', () => {
    const ages = (text: string) => read(text).members.map((m) => m.ageBand);
    expect(ages('My daughter is 3 years old and plays at 5 pm.')).toEqual(['under5']);
    expect(ages('Mera beta saat saal ka hai aur park mein khelta hai shaam 5 baje.')).toEqual([
      'child',
    ]);
    expect(ages('My son is seven and plays cricket at 4 pm.')).toEqual(['child']);
    expect(ages('My father is 72 years old and walks at 6 am.')).toEqual(['older']);
  });

  it('needs a year word next to the age and reads months as a baby', () => {
    // A bare number is no age: the role is guessed and the guess is listed.
    const bare = read('My son is 72 and walks at 6 am.');
    expect(bare.notes.some((n) => n.startsWith('Assumed'))).toBe(true);
    expect(
      read('My son is 8 months old and sleeps at 6 pm.').members.map((m) => m.ageBand),
    ).toEqual(['infant']);
  });

  it('keeps the injected number out', () => {
    const draft = read(INJECTION_TEXT);
    expect(JSON.stringify(draft)).not.toMatch(/\b20\b/);
    expect(draft.members.map((m) => [m.label, m.ageBand])).toEqual([['Son', 'child']]);
  });

  it('reads nothing from text that describes no one', () => {
    expect(read('Is the air bad today?').members).toEqual([]);
  });
});
