import type { AirSeries, HourSample } from '@/core/air/types';
import { WEEKDAYS } from '@/core/profile/schema';
import type { Household, Member, Routine } from '@/core/types';

export const FIRST_DATE = '2026-11-19';
export const LAST_DATE = '2026-11-26';

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function datesBetween(first: string, last: string): string[] {
  const out: string[] = [];
  for (
    let ms = Date.parse(`${first}T00:00:00Z`);
    ms <= Date.parse(`${last}T00:00:00Z`);
    ms += 86_400_000
  ) {
    out.push(new Date(ms).toISOString().slice(0, 10));
  }
  return out;
}

/** An hourly series from a function of date and hour; null makes a gap. PM10 is left empty so only PM2.5 sets the AQI. */
export function seriesOf(
  pm25: (date: string, hour: number) => number | null,
  extra: Partial<AirSeries> = {},
): AirSeries {
  const hours: HourSample[] = datesBetween(FIRST_DATE, LAST_DATE).flatMap((date) =>
    Array.from({ length: 24 }, (_, hour) => ({
      hour: `${date}T${pad(hour)}:00`,
      pm25: pm25(date, hour),
      pm10: null,
      no2: null,
      o3: null,
      co: null,
      so2: null,
    })),
  );
  return {
    source: 'open-meteo-cams',
    gridLat: 28.6,
    gridLon: 77.2,
    hours,
    fetchedAt: '2026-11-21T08:00:00+05:30',
    ...extra,
  };
}

/** The same value at every hour. */
export function flatSeries(value: number): AirSeries {
  return seriesOf(() => value);
}

/** Wall-clock IST as a Date: at('2026-11-21', '14:00'). */
export function at(date: string, hhmm: string): Date {
  return new Date(`${date}T${hhmm}:00+05:30`);
}

export function member(
  id: string,
  ageBand: Member['ageBand'],
  conditions: Member['conditions'] = [],
): Member {
  return { id, label: `Person ${id}`, ageBand, conditions };
}

export function routine(partial: Pick<Routine, 'id' | 'memberId'> & Partial<Routine>): Routine {
  return {
    kind: 'outdoor_play',
    start: '17:00',
    minutes: 60,
    intensity: 'moderate',
    days: [...WEEKDAYS],
    flexHours: 2,
    ...partial,
  };
}

export function household(members: Member[], routines: Routine[]): Household {
  return {
    v: 1,
    place: { name: 'Test place', admin1: 'Delhi', lat: 28.6, lon: 77.2 },
    members,
    routines,
    home: { cooking: 'lpg_png', habits: [], heating: 'none' },
    lang: 'en',
  };
}
