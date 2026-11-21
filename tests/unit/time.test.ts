import { afterEach, describe, expect, it } from 'vitest';

import { addHours, defaultPlanDay, hoursOf, istIso, istParts, planDays } from '@/core/time';
import type { PlanDay } from '@/core/time';

// Every instant is written in UTC so the expected IST reading is plain arithmetic (+05:30).
const AT = {
  morning: new Date('2026-11-24T00:30:00Z'), // 06:00 IST Tue 24 Nov
  afternoon: new Date('2026-11-24T08:30:00Z'), // 14:00 IST
  justBeforeFive: new Date('2026-11-24T11:29:00Z'), // 16:59 IST
  five: new Date('2026-11-24T11:30:00Z'), // 17:00 IST
  night: new Date('2026-11-24T16:00:00Z'), // 21:30 IST
  lateNight: new Date('2026-11-24T18:25:00Z'), // 23:55 IST
  pastMidnight: new Date('2026-11-24T18:35:00Z'), // 00:05 IST Wed 25 Nov
};

describe('istIso', () => {
  it('writes an instant on the Indian clock with the offset, and rolls over midnight', () => {
    expect(istIso(AT.morning)).toBe('2026-11-24T06:00:00+05:30');
    expect(istIso(new Date('2026-11-24T18:35:45Z'))).toBe('2026-11-25T00:05:45+05:30');
  });
});

describe('istParts', () => {
  it('reads 06:00 IST on a Tuesday', () => {
    expect(istParts(AT.morning)).toEqual({
      date: '2026-11-24',
      hour: 6,
      minute: 0,
      weekday: 'tue',
      hourStamp: '2026-11-24T06:00',
    });
  });

  it('reads 14:00, 21:30 and 23:55 IST on the same date', () => {
    expect(istParts(AT.afternoon)).toMatchObject({ date: '2026-11-24', hour: 14, minute: 0 });
    expect(istParts(AT.night)).toMatchObject({ date: '2026-11-24', hour: 21, minute: 30 });
    expect(istParts(AT.lateNight)).toMatchObject({
      date: '2026-11-24',
      hour: 23,
      minute: 55,
      hourStamp: '2026-11-24T23:00',
    });
  });

  it('rolls the date and weekday over at IST midnight, not UTC midnight', () => {
    expect(istParts(AT.pastMidnight)).toEqual({
      date: '2026-11-25',
      hour: 0,
      minute: 5,
      weekday: 'wed',
      hourStamp: '2026-11-25T00:00',
    });
    // 20:00 UTC on the 23rd is already 01:30 IST on the 24th.
    expect(istParts(new Date('2026-11-23T20:00:00Z'))).toMatchObject({
      date: '2026-11-24',
      weekday: 'tue',
    });
  });

  it('rolls over a month end and a year end', () => {
    expect(istParts(new Date('2026-11-30T20:00:00Z'))).toMatchObject({
      date: '2026-12-01',
      weekday: 'tue',
    });
    expect(istParts(new Date('2026-12-31T19:00:00Z'))).toMatchObject({
      date: '2027-01-01',
      hour: 0,
      weekday: 'fri',
    });
  });

  it('names every weekday', () => {
    const names = Array.from(
      { length: 7 },
      (_, i) => istParts(new Date(Date.UTC(2026, 10, 22 + i, 6))).weekday,
    );
    expect(names).toEqual(['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']);
  });

  describe('with the process time zone changed', () => {
    const original = process.env.TZ;
    afterEach(() => {
      if (original === undefined) delete process.env.TZ;
      else process.env.TZ = original;
    });

    it('gives the same answer under UTC, New York and Kolkata', () => {
      const results = ['UTC', 'America/New_York', 'Asia/Kolkata', 'Pacific/Auckland'].map((tz) => {
        process.env.TZ = tz;
        return [istParts(AT.lateNight), planDays(AT.lateNight), defaultPlanDay(AT.night)];
      });
      for (const r of results) expect(r).toEqual(results[0]);
      expect(results[0]?.[0]).toMatchObject({ date: '2026-11-24', hour: 23, weekday: 'tue' });
    });
  });
});

describe('addHours', () => {
  it('moves within a day', () => {
    expect(addHours('2026-11-24T06:00', 3)).toBe('2026-11-24T09:00');
    expect(addHours('2026-11-24T06:00', 0)).toBe('2026-11-24T06:00');
  });

  it('crosses midnight both ways', () => {
    expect(addHours('2026-11-24T23:00', 1)).toBe('2026-11-25T00:00');
    expect(addHours('2026-11-25T00:00', -1)).toBe('2026-11-24T23:00');
    expect(addHours('2026-11-24T06:00', -23)).toBe('2026-11-23T07:00');
  });

  it('crosses month, year and leap-day ends', () => {
    expect(addHours('2026-11-30T23:00', 1)).toBe('2026-12-01T00:00');
    expect(addHours('2026-12-31T23:00', 1)).toBe('2027-01-01T00:00');
    expect(addHours('2028-02-28T23:00', 1)).toBe('2028-02-29T00:00');
    expect(addHours('2027-02-28T23:00', 1)).toBe('2027-03-01T00:00');
    expect(addHours('2026-11-24T00:00', 72)).toBe('2026-11-27T00:00');
  });

  it('refuses anything that is not a real hour stamp', () => {
    expect(() => addHours('2026-11-24', 1)).toThrow(RangeError);
    expect(() => addHours('2026-11-24T06:30', 1)).toThrow(RangeError);
    expect(() => addHours('2026-02-31T06:00', 1)).toThrow(RangeError);
    expect(() => addHours('2026-11-24T24:00', 1)).toThrow(RangeError);
  });
});

describe('planDays and defaultPlanDay', () => {
  it('lists today, tomorrow and the day after with labels', () => {
    expect(planDays(AT.morning)).toEqual<PlanDay[]>([
      { date: '2026-11-24', weekday: 'tue', relative: 'today', label: 'Tue 24 Nov' },
      { date: '2026-11-25', weekday: 'wed', relative: 'tomorrow', label: 'Wed 25 Nov' },
      { date: '2026-11-26', weekday: 'thu', relative: 'day_after', label: 'Thu 26 Nov' },
    ]);
  });

  it('is the same list at 06:00, 14:00 and 23:55 on the same IST date', () => {
    expect(planDays(AT.afternoon)).toEqual(planDays(AT.morning));
    expect(planDays(AT.lateNight)).toEqual(planDays(AT.morning));
  });

  it('starts a new list after IST midnight', () => {
    expect(planDays(AT.pastMidnight)[0]).toMatchObject({ date: '2026-11-25', label: 'Wed 25 Nov' });
  });

  it('runs across a month end', () => {
    const days = planDays(new Date('2026-11-29T20:00:00Z')); // 01:30 IST Mon 30 Nov
    expect(days.map((d) => d.label)).toEqual(['Mon 30 Nov', 'Tue 1 Dec', 'Wed 2 Dec']);
    expect(days.map((d) => d.date)).toEqual(['2026-11-30', '2026-12-01', '2026-12-02']);
  });

  it('runs across a year end', () => {
    const days = planDays(new Date('2026-12-30T10:00:00Z'));
    expect(days.map((d) => d.label)).toEqual(['Wed 30 Dec', 'Thu 31 Dec', 'Fri 1 Jan']);
  });

  it('defaults to today before 17:00 IST and tomorrow from 17:00', () => {
    expect(defaultPlanDay(AT.morning).relative).toBe('today');
    expect(defaultPlanDay(AT.afternoon).relative).toBe('today');
    expect(defaultPlanDay(AT.justBeforeFive).relative).toBe('today');
    expect(defaultPlanDay(AT.five).relative).toBe('tomorrow');
    expect(defaultPlanDay(AT.night)).toMatchObject({ date: '2026-11-25', label: 'Wed 25 Nov' });
  });

  it('defaults to tomorrow at 23:55 IST, and to the new today at 00:05', () => {
    expect(defaultPlanDay(AT.lateNight)).toMatchObject({
      date: '2026-11-25',
      relative: 'tomorrow',
    });
    expect(defaultPlanDay(AT.pastMidnight)).toMatchObject({
      date: '2026-11-25',
      relative: 'today',
    });
  });
});

describe('hoursOf', () => {
  const [today] = planDays(AT.morning) as [PlanDay, ...PlanDay[]];

  it('covers the two hours a 17:30 hour-long routine touches', () => {
    expect(hoursOf(today, '17:30', 60)).toEqual(['2026-11-24T17:00', '2026-11-24T18:00']);
  });

  it('covers one hour when the routine ends exactly on the hour', () => {
    expect(hoursOf(today, '17:00', 60)).toEqual(['2026-11-24T17:00']);
    expect(hoursOf(today, '08:15', 45)).toEqual(['2026-11-24T08:00']);
  });

  it('covers a short routine that straddles an hour boundary', () => {
    expect(hoursOf(today, '07:50', 20)).toEqual(['2026-11-24T07:00', '2026-11-24T08:00']);
  });

  it('spans several hours', () => {
    expect(hoursOf(today, '06:30', 150)).toEqual([
      '2026-11-24T06:00',
      '2026-11-24T07:00',
      '2026-11-24T08:00',
    ]);
  });

  it('runs past midnight into the next date', () => {
    expect(hoursOf(today, '23:30', 120)).toEqual([
      '2026-11-24T23:00',
      '2026-11-25T00:00',
      '2026-11-25T01:00',
    ]);
  });

  it('runs past a month end', () => {
    const lastDay: PlanDay = {
      date: '2026-11-30',
      weekday: 'mon',
      relative: 'today',
      label: 'Mon 30 Nov',
    };
    expect(hoursOf(lastDay, '23:45', 30)).toEqual(['2026-11-30T23:00', '2026-12-01T00:00']);
  });

  it('touches the starting hour even for a zero-minute routine', () => {
    expect(hoursOf(today, '09:40', 0)).toEqual(['2026-11-24T09:00']);
    expect(hoursOf(today, '09:40', -5)).toEqual(['2026-11-24T09:00']);
  });

  it('refuses a bad clock string or a non-finite length', () => {
    expect(() => hoursOf(today, '9:30', 30)).toThrow(RangeError);
    expect(() => hoursOf(today, '24:00', 30)).toThrow(RangeError);
    expect(() => hoursOf(today, '12:60', 30)).toThrow(RangeError);
    expect(() => hoursOf(today, '12:00', Number.NaN)).toThrow(RangeError);
  });
});
