import { describe, expect, it } from 'vitest';

import { SAMPLES } from '@/core/profile/samples';
import { parseHouseholdForm } from '@/server/household-form';
import { valuesOfHousehold } from '@/server/household-values';

describe('household form values', () => {
  it.each(SAMPLES.filter((s) => s.household.members.length > 0))(
    'turn sample $id into form values and back into the same people and routines',
    ({ household }) => {
      const parsed = parseHouseholdForm(valuesOfHousehold(household), household.place);
      if (!('household' in parsed)) throw new Error(JSON.stringify(parsed.errors));
      expect(
        parsed.household.members.map(({ label, ageBand, conditions }) => ({
          label,
          ageBand,
          conditions,
        })),
      ).toEqual(
        household.members.map(({ label, ageBand, conditions }) => ({ label, ageBand, conditions })),
      );
      expect(parsed.household.routines.map((r) => [r.kind, r.start, r.minutes, r.days])).toEqual(
        household.routines.map((r) => [r.kind, r.start, r.minutes, r.days]),
      );
      expect(parsed.household.home).toEqual(household.home);
    },
  );

  it('explains each mistake in plain words, by field', () => {
    const place = { name: 'Pune', admin1: 'Maharashtra', lat: 18.5, lon: 73.9 };
    const result = parseHouseholdForm(
      {
        m1_label: 'Son',
        r1_kind: 'walk',
        r1_member: 'm9',
        r1_start: '25:00',
        r1_minutes: '9999',
        roomSqft: '3',
        r1_freeFrom: '08:00',
      },
      place,
    );
    if (!('errors' in result)) throw new Error('expected errors');
    const byField = Object.fromEntries(result.errors.map((e) => [e.field, e.message]));
    expect(byField).toMatchObject({
      m1_age: 'Choose an age group for Son.',
      r1_member: 'Choose who does this routine.',
      r1_start: 'Give a start time, such as 17:30.',
      r1_minutes: 'Minutes must be a whole number from 1 to 480.',
      roomSqft: 'Room size must be a number from 20 to 5000.',
      r1_freeTo: 'Give both free hours, or leave both empty.',
    });
  });

  it('turns a purifier rating in m3/h into cfm, and keeps one in cfm as it is', () => {
    const place = { name: 'Pune', admin1: 'Maharashtra', lat: 18.5, lon: 73.9 };
    const cfmOf = (extra: Record<string, string>): number | undefined => {
      const parsed = parseHouseholdForm(
        { m1_label: 'Me', m1_age: 'adult', purifierCadrCfm: '340', ...extra },
        place,
      );
      if (!('household' in parsed)) throw new Error(JSON.stringify(parsed.errors));
      return parsed.household.home.purifierCadrCfm;
    };
    expect(cfmOf({ purifierUnit: 'm3h' })).toBe(200);
    expect(cfmOf({ purifierUnit: 'cfm' })).toBe(340);
    expect(cfmOf({})).toBe(340);
    expect(cfmOf({ purifierUnit: 'm3h', purifierCadrCfm: '3398' })).toBe(2000);
    const tooBig = parseHouseholdForm(
      { m1_label: 'Me', m1_age: 'adult', purifierCadrCfm: '3400', purifierUnit: 'm3h' },
      place,
    );
    expect('errors' in tooBig && tooBig.errors[0]?.message).toBe(
      'Purifier air flow must be a number from 1 to 3398.',
    );
  });

  it('asks for at least one person', () => {
    const place = { name: 'Pune', admin1: 'Maharashtra', lat: 18.5, lon: 73.9 };
    const result = parseHouseholdForm({}, place);
    if (!('errors' in result)) throw new Error('expected errors');
    expect(result.errors).toEqual([{ field: 'm1_label', message: 'Add at least one person.' }]);
  });
});
