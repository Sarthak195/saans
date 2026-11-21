import type { AqiToday, Band } from '@/core/aqi';
import { bandOfIndex } from '@/core/aqi';
import type { Plan, RoutineAdvice, Window } from '@/core/plan/types';
import type { Home, Household, Member, Mode, Place, Routine } from '@/core/types';

// Small hand-built plans, so the home, alternatives and community tests do not depend on the plan engine.

export const DELHI: Place = { name: 'Lajpat Nagar', admin1: 'Delhi', lat: 28.6, lon: 77.2 };
export const MUMBAI: Place = { name: 'Andheri', admin1: 'Maharashtra', lat: 19.1, lon: 72.9 };
export const NOIDA: Place = { name: 'Noida', admin1: 'Uttar Pradesh', lat: 28.6, lon: 77.4 };
// Far from every listed city, so it gets the generic bus.
export const SMALL_TOWN: Place = { name: 'Rampur', admin1: 'Uttar Pradesh', lat: 28.8, lon: 79.0 };

export function aqiOk(aqi: number): AqiToday {
  return {
    kind: 'ok',
    aqi,
    band: bandOfIndex(aqi),
    responsible: 'pm25',
    pm25Avg: 100,
    pm10Avg: 150,
    validHours: 24,
    windowEnd: '2026-11-24T10:00',
    gases: {},
  };
}

export const INSUFFICIENT: AqiToday = {
  kind: 'insufficient',
  validHours: 8,
  windowEnd: '2026-11-24T10:00',
};

export function windowOf(level: Band, pm25: number, start = '12:00', end = '15:00'): Window {
  return { start, end, pm25, level };
}

interface PlanOptions {
  place?: Place;
  date?: string;
  aqi?: AqiToday;
  worst?: Window | null;
  best?: Window | null;
  airing?: Plan['glance']['airing'];
  routines?: RoutineAdvice[];
  hourly?: Plan['air']['hourly'];
}

export function makePlan(options: PlanOptions = {}): Plan {
  const date = options.date ?? '2026-11-24';
  return {
    place: options.place ?? DELHI,
    day: { date, weekday: 'tue', relative: 'today', label: 'Tue 24 Nov' },
    days: [],
    air: {
      aqi: options.aqi ?? aqiOk(150),
      dataHour: `${date}T10:00`,
      source: 'open-meteo-cams',
      gridLat: 28.6,
      gridLon: 77.2,
      fetchedAt: `${date}T10:07:00+05:30`,
      hourly: options.hourly ?? [],
    },
    severe: false,
    glance: {
      best: options.best === undefined ? windowOf('moderate', 80, '13:00', '16:00') : options.best,
      worst: options.worst === undefined ? windowOf('moderate', 85) : options.worst,
      airing: options.airing ?? { kind: 'normal' },
      topAction: 'Keep outdoor time short.',
    },
    routines: options.routines ?? [],
    members: [],
  };
}

/** `mode: undefined` means a routine with no mode given, which the strict optional type does not allow directly. */
export function makeAdvice(
  overrides: Omit<Partial<RoutineAdvice>, 'mode'> & { mode?: Mode | undefined } = {},
): RoutineAdvice {
  const { mode, ...rest } = overrides;
  const advice: RoutineAdvice = {
    ref: 'routine_1',
    routineId: 'r1',
    memberId: 'm1',
    memberRef: 'member_1',
    memberLabel: 'Parent',
    kind: 'commute',
    slot: 'morning',
    start: '08:30',
    minutes: 45,
    scheduled: true,
    pm25: 85,
    level: 'moderate',
    decision: 'essential',
    reason: {
      ruleId: 'test',
      text: 'test',
      source: { id: 'test', title: 'Saans rule: test', url: '', status: 'APP' },
    },
    protection: [],
    impact: { kind: 'none', text: 'none', numbers: [] },
    ...rest,
  };
  if ('mode' in overrides) {
    if (mode !== undefined) advice.mode = mode;
  } else {
    advice.mode = 'car';
  }
  return advice;
}

export const PARENT: Member = { id: 'm1', label: 'Parent', ageBand: 'adult', conditions: [] };

export function makeRoutine(overrides: Partial<Routine> = {}): Routine {
  return {
    id: 'r1',
    memberId: 'm1',
    kind: 'commute',
    start: '08:30',
    minutes: 45,
    intensity: 'light',
    mode: 'car',
    km: 6,
    days: ['mon', 'tue', 'wed', 'thu', 'fri'],
    flexHours: 0,
    ...overrides,
  };
}

export const BARE_HOME: Home = { cooking: 'lpg_png', habits: [], heating: 'none' };

export function makeHousehold(
  overrides: Omit<Partial<Household>, 'home'> & { home?: Partial<Home> } = {},
): Household {
  const { home, ...rest } = overrides;
  return {
    v: 1,
    place: DELHI,
    members: [PARENT],
    routines: [],
    home: { ...BARE_HOME, ...home },
    lang: 'en',
    ...rest,
  };
}
