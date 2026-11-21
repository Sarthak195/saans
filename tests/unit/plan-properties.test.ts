import { describe, expect, it } from 'vitest';

import { pm25Level } from '@/core/aqi';
import { buildPlan } from '@/core/plan/build-plan';
import { planFacts } from '@/core/plan/facts';
import { planDayBand } from '@/core/plan/glance';
import { atLeast, bandRank, meanOver, pmIndex } from '@/core/plan/pm25';
import { POOR_DAY } from '@/core/plan/rules-data';
import type { Plan } from '@/core/plan/types';
import { toMinutes } from '@/core/plan/clock';
import {
  AGE_BANDS,
  CONDITIONS,
  INTENSITIES,
  MODES,
  ROUTINE_KINDS,
  WEEKDAYS,
} from '@/core/profile/schema';
import { hoursOf } from '@/core/time';
import { numbersIn } from '@/core/plan/words';
import { extractNumbers } from '@/core/text';
import type { Household, Routine } from '@/core/types';
import { DASHES, at, household, seriesOf } from '../helpers/plan';

/** A small seeded generator (mulberry32), so a failure can be replayed from its seed. */
function rng(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(random: () => number, items: readonly T[]): T {
  const item = items[Math.floor(random() * items.length)];
  if (item === undefined) throw new Error('Nothing to pick');
  return item;
}

function clock(totalMinutes: number): string {
  const h = String(Math.floor(totalMinutes / 60)).padStart(2, '0');
  return `${h}:${String(totalMinutes % 60).padStart(2, '0')}`;
}

function randomCase(seed: number) {
  const random = rng(seed);
  // A different daily shape per seed: a base level, a swing and a phase, plus noise and rare gaps.
  const base = 35 + random() * 130;
  const swing = 0.3 + random() * 0.6;
  const phase = random() * 24;
  const series = seriesOf((_date, hour) => {
    if (random() < 0.03) return null;
    const wave = 1 + swing * Math.sin(((hour - phase) / 24) * 2 * Math.PI);
    return Math.max(0, base * wave * (0.9 + random() * 0.2));
  });

  const members = Array.from({ length: 1 + Math.floor(random() * 4) }, (_, i) => ({
    id: `m${String(i + 1)}`,
    label: `Member ${String(i + 1)}`,
    ageBand: pick(random, AGE_BANDS),
    conditions: random() < 0.25 ? [pick(random, CONDITIONS)] : [],
  }));
  const routines: Routine[] = Array.from({ length: 2 + Math.floor(random() * 7) }, (_, i) => {
    const free = random() < 0.25;
    const weekdays = WEEKDAYS.filter(() => random() < 0.7);
    const from = 6 * 60 + Math.floor(random() * 6) * 60;
    return {
      id: `r${String(i + 1)}`,
      memberId: pick(random, members).id,
      kind: pick(random, ROUTINE_KINDS),
      start: clock((5 + Math.floor(random() * 17)) * 60 + pick(random, [0, 15, 30, 45])),
      minutes: 15 + Math.floor(random() * 180),
      intensity: pick(random, INTENSITIES),
      ...(random() < 0.5 ? { mode: pick(random, MODES) } : {}),
      days: weekdays.length > 0 ? weekdays : ['sat'],
      flexHours: 1 + Math.floor(random() * 4),
      ...(free
        ? { freeFrom: clock(from), freeTo: clock(from + (1 + Math.floor(random() * 8)) * 60) }
        : {}),
    };
  });
  const now = at(
    pick(random, ['2026-11-20', '2026-11-21', '2026-11-22']),
    pick(random, ['06:00', '14:00', '21:30', '23:55']),
  );
  const chosen = pick(random, ['default', 'today', 'tomorrow', 'day_after'] as const);
  const day = chosen === 'default' ? undefined : chosen;
  return {
    series,
    household: household(
      members,
      routines.filter((r) => r.days.length > 0),
    ),
    now,
    day,
  };
}

const SEEDS = Array.from({ length: 800 }, (_, i) => 1000 + i * 7919);

function planOf(seed: number): {
  plan: Plan;
  home: Household;
  series: ReturnType<typeof randomCase>['series'];
} {
  const c = randomCase(seed);
  const plan = buildPlan({
    household: c.household,
    series: c.series,
    now: c.now,
    ...(c.day ? { day: c.day } : {}),
  });
  return { plan, home: c.household, series: c.series };
}

describe('plan properties over seeded random days', () => {
  it('never offers a window that is worse, outside the plan day, or against the guards', () => {
    let windows = 0;
    let childWindows = 0;
    for (const seed of SEEDS) {
      const { plan, home, series } = planOf(seed);
      const pm = pmIndex(series);
      const dayBand = planDayBand(series, pm, plan.day);
      for (const advice of plan.routines) {
        if (advice.window === undefined) continue;
        windows += 1;
        if (home.members.find((m) => m.id === advice.memberId)?.ageBand === 'child')
          childWindows += 1;
        const routine = home.routines.find((r) => r.id === advice.routineId);
        const person = home.members.find((m) => m.id === advice.memberId);
        if (!routine || !person) throw new Error(`Seed ${String(seed)}: routine or member missing`);

        const original =
          meanOver(pm, hoursOf(plan.day, routine.start, routine.minutes), false) ?? NaN;
        const moved =
          meanOver(pm, hoursOf(plan.day, advice.window.start, routine.minutes), true) ?? NaN;
        // Never worse than the original, and either a lower level or a cut of at least a fifth.
        expect(moved, `seed ${String(seed)}`).toBeLessThanOrEqual(original);
        const lowered = bandRank(pm25Level(moved)) < bandRank(pm25Level(original));
        expect(lowered || moved <= original * 0.8, `seed ${String(seed)}`).toBe(true);

        // Same length, on the plan day, never crossing midnight.
        const start = toMinutes(advice.window.start);
        const end = toMinutes(advice.window.end);
        expect(end - start).toBe(routine.minutes);
        expect(start).toBeGreaterThanOrEqual(0);
        expect(end).toBeLessThan(24 * 60);
        expect(Math.abs(start - toMinutes(routine.start)) % 60).toBe(0);
        expect(Math.abs(start - toMinutes(routine.start))).toBeLessThanOrEqual(
          routine.flexHours * 60,
        );
        expect(start).not.toBe(toMinutes(routine.start));

        if (['child', 'teen'].includes(person.ageBand)) {
          expect(start).toBeGreaterThanOrEqual(7 * 60);
          expect(end).toBeLessThanOrEqual(19 * 60);
          const free = routine.freeFrom !== undefined;
          if (!free && ['mon', 'tue', 'wed', 'thu', 'fri'].includes(plan.day.weekday)) {
            expect(end <= 8 * 60 || start >= 14 * 60, `seed ${String(seed)}`).toBe(true);
          }
        }
        if (routine.freeFrom !== undefined && routine.freeTo !== undefined) {
          if (toMinutes(routine.freeFrom) < toMinutes(routine.freeTo)) {
            expect(start).toBeGreaterThanOrEqual(toMinutes(routine.freeFrom));
            expect(end).toBeLessThanOrEqual(toMinutes(routine.freeTo));
          }
        }
        if (atLeast(dayBand, 'poor') || atLeast(advice.level, 'poor')) {
          expect(start, `seed ${String(seed)}`).toBeGreaterThanOrEqual(POOR_DAY.earliestHour * 60);
          expect(end).toBeLessThanOrEqual(POOR_DAY.latestHour * 60);
        }
      }
    }
    // The generator has to reach the code it is testing.
    expect(windows).toBeGreaterThan(60);
    expect(childWindows).toBeGreaterThan(5);
  });

  it('keeps every percentage between 0 and 100 in steps of 5, and totals that only go down', () => {
    for (const seed of SEEDS) {
      const { plan } = planOf(seed);
      for (const advice of plan.routines) {
        const percent = advice.impact.percentLess;
        if (percent !== undefined) {
          expect(percent).toBeGreaterThanOrEqual(0);
          expect(percent).toBeLessThanOrEqual(100);
          expect(percent % 5).toBe(0);
        }
        // A window is only ever a move, and a move that finds nothing is not left as one.
        expect(advice.decision === 'move').toBe(advice.window !== undefined);
        if (!advice.scheduled) expect(advice.decision).toBe('keep');
        if (advice.decision === 'essential') {
          expect(advice.window).toBeUndefined();
          expect(advice.protection.length).toBeGreaterThan(0);
        } else {
          expect(advice.protection).toEqual([]);
        }
        if (advice.decision === 'indoors') expect(advice.impact.percentLess).toBeUndefined();
      }
      for (const m of plan.members) {
        expect(m.percentLess).toBeGreaterThanOrEqual(0);
        expect(m.percentLess).toBeLessThanOrEqual(100);
        expect(m.percentLess % 5).toBe(0);
        expect(m.exposurePlan).toBeLessThanOrEqual(m.exposureUsual);
      }
    }
  });

  it('never offers a window before now when the plan day is today', () => {
    for (const seed of SEEDS) {
      const c = randomCase(seed);
      const plan = buildPlan({
        household: c.household,
        series: c.series,
        now: c.now,
        ...(c.day ? { day: c.day } : {}),
      });
      if (plan.day.relative !== 'today') continue;
      const [h, m] = c.now.toISOString().slice(11, 16).split(':').map(Number);
      // The IST clock is the UTC clock plus 5:30.
      const nowMinutes = ((h ?? 0) * 60 + (m ?? 0) + 330) % (24 * 60);
      for (const advice of plan.routines) {
        if (advice.window)
          expect(toMinutes(advice.window.start)).toBeGreaterThanOrEqual(nowMinutes);
      }
    }
  });

  it('is deterministic, plain, and its facts cover every number in its text', () => {
    for (const seed of SEEDS.slice(0, 120)) {
      const { plan } = planOf(seed);
      expect(planOf(seed).plan).toEqual(plan);
      const facts = new Set(planFacts(plan));
      const texts = [
        plan.glance.topAction,
        ...plan.routines.flatMap((r) => [r.reason.text, r.impact.text, ...r.protection]),
      ];
      for (const text of texts) {
        expect(text).not.toMatch(DASHES);
        expect(text).not.toMatch(/\bsafe/i);
        for (const n of extractNumbers(text))
          expect(facts.has(n), `seed ${String(seed)}: ${text}`).toBe(true);
      }
      for (const advice of plan.routines) {
        for (const n of advice.impact.numbers) expect(facts.has(n)).toBe(true);
        // An impact lists every number its text shows, apart from the 2.5 in the name PM2.5.
        for (const n of numbersIn(advice.impact.text)) {
          expect(advice.impact.numbers, advice.impact.text).toContain(n);
        }
        if (advice.pm25 !== null) expect(advice.pm25 % 5).toBe(0);
      }
    }
  });
});
