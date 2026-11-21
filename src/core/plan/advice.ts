import { BAND_LABEL, pm25Level } from '@/core/aqi';
import type { Decision } from '@/core/decision';
import { indoorsImpact, intensityImpact, noChangeImpact, timingImpact } from '@/core/impact';
import { WEEKDAY_FULL, toMinutes } from '@/core/plan/clock';
import { atLeast, displayPm25, meanOver } from '@/core/plan/pm25';
import type { PmIndex } from '@/core/plan/pm25';
import { protectionFor } from '@/core/plan/protection';
import { ESSENTIAL_KINDS, GRID, NOT_SCHEDULED, NO_DATA, NO_WINDOW } from '@/core/plan/rules-data';
import type { DefaultRow } from '@/core/plan/rules-data';
import { sensitivityOf } from '@/core/plan/sensitivity';
import type { DaySlot, Impact, RoutineAdvice, Window } from '@/core/plan/types';
import { findCleanerWindow } from '@/core/plan/windows';
import { fill } from '@/core/plan/words';
import { firstMatch } from '@/core/rules/evaluate';
import type { PlanDay } from '@/core/time';
import { hoursOf } from '@/core/time';
import type { Member, Routine } from '@/core/types';

export interface DayContext {
  day: PlanDay;
  pm: PmIndex;
  /** The plan day as a whole is Poor or worse. */
  poorDay: boolean;
  /** Minutes after midnight now when the plan day is today, else 0. */
  notBefore: number;
}

/** One routine's advice plus the unrounded means the member totals need. */
export interface Evaluated {
  advice: RoutineAdvice;
  /** Mean PM2.5 as usual, or null when there is no data or the routine is not on the plan day. */
  usual: number | null;
  /** Mean PM2.5 breathed with the plan: 0 when moved indoors, the window mean when moved. */
  planned: number | null;
  /** The plan asked for another time and none was good enough. */
  moveFailed: boolean;
}

export function slotOf(start: string): DaySlot {
  const minutes = toMinutes(start);
  return minutes < 12 * 60 ? 'morning' : minutes < 17 * 60 ? 'afternoon' : 'evening';
}

const TRIP_STAYS =
  'This trip stays, so protection lowers what you breathe in but does not avoid the outdoor air.';

function impactFor(
  decision: Decision,
  member: Member,
  routine: Routine,
  usual: number,
  moved: number | null,
): Impact {
  switch (decision) {
    case 'move':
      return moved === null ? noChangeImpact('No change.') : timingImpact(usual, moved);
    case 'indoors':
      return indoorsImpact();
    case 'lighten':
      return intensityImpact(member.ageBand, routine.intensity);
    case 'essential':
      return noChangeImpact(TRIP_STAYS);
    case 'keep':
      return noChangeImpact('No change.');
  }
}

function plain(
  base: Omit<RoutineAdvice, 'pm25' | 'level' | 'decision' | 'reason' | 'protection' | 'impact'>,
  row: DefaultRow,
  text: string,
): Evaluated {
  const advice: RoutineAdvice = {
    ...base,
    pm25: null,
    level: null,
    decision: 'keep',
    reason: { ruleId: row.id, text, source: row.source },
    protection: [],
    impact: noChangeImpact('No change.'),
  };
  return { advice, usual: null, planned: null, moveFailed: false };
}

export function adviseRoutine(
  routine: Routine,
  member: Member,
  numbers: { routine: number; member: number },
  ctx: DayContext,
): Evaluated {
  const base = {
    ref: `routine_${String(numbers.routine)}`,
    routineId: routine.id,
    memberId: member.id,
    memberRef: `member_${String(numbers.member)}`,
    memberLabel: member.label,
    kind: routine.kind,
    ...(routine.mode === undefined ? {} : { mode: routine.mode }),
    slot: slotOf(routine.start),
    start: routine.start,
    minutes: routine.minutes,
    scheduled: routine.days.includes(ctx.day.weekday),
  };

  if (!base.scheduled) {
    const weekdays = `${WEEKDAY_FULL[ctx.day.weekday]}s`;
    return plain(base, NOT_SCHEDULED, fill(NOT_SCHEDULED.text, { weekdays }));
  }
  const usual = meanOver(ctx.pm, hoursOf(ctx.day, routine.start, routine.minutes), false);
  if (usual === null) return plain(base, NO_DATA, NO_DATA.text);

  const level = pm25Level(usual);
  const rule = firstMatch(GRID, {
    level,
    sensitivity: sensitivityOf(member),
    intensity: routine.intensity,
    essential: ESSENTIAL_KINDS.includes(routine.kind),
  });
  if (!rule) throw new Error(`No rule covers ${level} for routine ${routine.id}`);

  let decision = rule.then.decision;
  let window: Window | undefined;
  let moved: number | null = null;
  let moveFailed = false;
  if (decision === 'move') {
    const found = findCleanerWindow({
      routine,
      member,
      day: ctx.day,
      pm: ctx.pm,
      original: usual,
      poorDay: ctx.poorDay || atLeast(level, 'poor'),
      notBefore: ctx.notBefore,
    });
    if (found) {
      window = found.window;
      moved = found.mean;
    } else {
      decision = rule.then.fallback ?? 'indoors';
      moveFailed = true;
    }
  }

  const note =
    moveFailed && (decision === 'indoors' || decision === 'lighten') ? NO_WINDOW[decision] : '';
  const text = fill(rule.then.text, { level: BAND_LABEL[level] });
  const advice: RoutineAdvice = {
    ...base,
    pm25: displayPm25(usual),
    level,
    decision,
    reason: { ruleId: rule.id, text: note === '' ? text : `${text} ${note}`, source: rule.source },
    ...(window ? { window } : {}),
    protection: decision === 'essential' ? protectionFor(routine.mode, member.ageBand) : [],
    impact: impactFor(decision, member, routine, usual, moved),
  };
  return { advice, usual, planned: decision === 'indoors' ? 0 : (moved ?? usual), moveFailed };
}
