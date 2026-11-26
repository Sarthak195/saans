// Decides what to advise for one routine of one member on the plan day: reads the air over the
// routine's hours, matches the decision grid, applies the poor-day hours and looks for a
// cleaner time. Core layer: pure. The caller passes in the day and the hourly air.
import { BAND_LABEL, pm25Level } from '@/core/aqi';
import type { Decision } from '@/core/decision';
import { indoorsImpact, intensityImpact, noChangeImpact, timingImpact } from '@/core/impact';
import { displayPm25, fillTemplate, fromMinutes, toMinutes } from '@/core/format';
import { WEEKDAY_FULL } from '@/core/plan/clock';
import { atLeast, meanOver } from '@/core/plan/pm25';
import type { PmIndex } from '@/core/plan/pm25';
import { protectionFor } from '@/core/plan/protection';
import {
  ESSENTIAL_KINDS,
  GRID,
  NOT_SCHEDULED,
  NO_DATA,
  NO_WINDOW,
  POOR_DAY,
} from '@/core/plan/rules-data';
import type { DefaultRow } from '@/core/plan/rules-data';
import { sensitivityOf } from '@/core/plan/sensitivity';
import type { DaySlot, Impact, RoutineAdvice, Window } from '@/core/plan/types';
import { findCleanerWindow } from '@/core/plan/windows';
import { firstMatch } from '@/core/rules/evaluate';
import type { PlanDay } from '@/core/time';
import { hoursOf } from '@/core/time';
import type { Member, Routine } from '@/core/types';

/** What advice needs to know about the plan day, worked out once and shared by every routine. */
interface DayContext {
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

// Names the part of the day a routine starts in: before 12:00 is morning, before 17:00 is
// afternoon, else evening.
function slotOf(start: string): DaySlot {
  const minutes = toMinutes(start);
  return minutes < 12 * 60 ? 'morning' : minutes < 17 * 60 ? 'afternoon' : 'evening';
}

// Rule id shown when the poor-day hours replace the grid's advice.
const POOR_DAY_RULE_ID = 'poor-day-hours';

/** The routine starts before, or runs past, the hours MoHFW leaves open for exercise on a poor day. */
function outsideDayHours(routine: Routine): boolean {
  const start = toMinutes(routine.start);
  return start < POOR_DAY.earliestHour * 60 || start + routine.minutes > POOR_DAY.latestHour * 60;
}

// Sentence for an essential trip, which stays on the plan.
const TRIP_STAYS =
  'This trip stays, so protection lowers what you breathe in but does not avoid the outdoor air.';

// Works out the effect of the final decision, with the numbers it shows.
function impactFor(
  decision: Decision,
  member: Member,
  routine: Routine,
  usual: number,
  moved: number | null,
): Impact {
  switch (decision) {
    case 'move':
      // A move carries the mean of its window. Without one there is nothing to compare.
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

// Advice for a routine with no air to act on (not on the plan day, or no data): keep, with no
// level, protection or effect.
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

/**
 * Advice for one routine of one member on the plan day: the decision, its reason and source, a
 * cleaner window when it moves, protection lines for an essential trip and the computed effect.
 * `numbers` holds the 1-based positions of the routine and the member in the household. A routine
 * not on the plan day, or with no air data, is kept and shows no PM2.5 or level. Throws when no
 * grid row matches.
 */
export function adviseRoutine(
  routine: Routine,
  member: Member,
  numbers: { routine: number; member: number },
  ctx: DayContext,
): Evaluated {
  // Fields every result carries whatever the decision. Refs are placeholders ('routine_1',
  // 'member_1') so names stay out of text sent to the writer.
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

  // A routine not on the plan day's weekday gets a plain line naming that weekday in the plural,
  // such as 'Mondays'.
  if (!base.scheduled) {
    const weekdays = `${WEEKDAY_FULL[ctx.day.weekday]}s`;
    return plain(base, NOT_SCHEDULED, fillTemplate(NOT_SCHEDULED.text, { weekdays }));
  }
  // Mean PM2.5 over the routine's hours, unrounded. Levels come from this, never from the rounded
  // value shown.
  const usual = meanOver(ctx.pm, hoursOf(ctx.day, routine.start, routine.minutes), false);
  if (usual === null) return plain(base, NO_DATA, NO_DATA.text);

  const level = pm25Level(usual);
  const essential = ESSENTIAL_KINDS.includes(routine.kind);
  const rule = firstMatch(GRID, {
    level,
    sensitivity: sensitivityOf(member),
    intensity: routine.intensity,
    essential,
  });
  // The grid is meant to cover every level, so no match is a mistake in the data.
  if (!rule) throw new Error(`No rule covers ${level} for routine ${routine.id}`);

  // The routine's own air at Poor or worse also makes it a poor day for this routine.
  const poorDay = ctx.poorDay || atLeast(level, 'poor');
  const label = BAND_LABEL[level];
  let decision = rule.then.decision;
  let fallback = rule.then.fallback;
  let ruleId = rule.id;
  let source = rule.source;
  let text = fillTemplate(rule.then.text, { level: label });
  // On a Poor or worse day the advice is no morning or late-evening exercise, so the routine's own
  // hours count too, not only the hours offered instead.
  const outside = poorDay && !essential && outsideDayHours(routine);
  const lightOutside = outside && routine.intensity === 'light';
  // A light routine outside the open hours keeps its decision and gets a note. For any other
  // routine outside them, a keep or a lighten becomes a move.
  if (outside && !lightOutside) {
    if (decision === 'keep' || decision === 'lighten') {
      decision = 'move';
      ruleId = POOR_DAY_RULE_ID;
      source = POOR_DAY.adviceSource;
      text = fillTemplate(POOR_DAY.moveText, {
        level: label,
        from: fromMinutes(POOR_DAY.earliestHour * 60),
        to: fromMinutes(POOR_DAY.latestHour * 60),
      });
    }
    // If no cleaner time is found, the routine goes indoors.
    if (decision === 'move') fallback = 'indoors';
  }

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
      poorDay,
      notBefore: ctx.notBefore,
    });
    if (found) {
      window = found.window;
      moved = found.mean;
    } else {
      // No time was good enough: use the grid's fallback, or indoors when it names none.
      decision = fallback ?? 'indoors';
      moveFailed = true;
    }
  }

  // The reason text is the rule's sentence plus any notes that apply.
  const parts = [text];
  if (lightOutside && (decision === 'keep' || decision === 'lighten' || decision === 'move')) {
    parts.push(POOR_DAY.lightNote);
  }
  // Say why a move turned into indoors or a lighter routine.
  if (moveFailed && (decision === 'indoors' || decision === 'lighten')) {
    parts.push(NO_WINDOW[decision]);
  }
  const advice: RoutineAdvice = {
    ...base,
    pm25: displayPm25(usual),
    level,
    decision,
    reason: { ruleId, text: parts.join(' '), source },
    ...(window ? { window } : {}),
    // Only an essential trip gets protection lines.
    protection: decision === 'essential' ? protectionFor(routine.mode, member.ageBand, level) : [],
    impact: impactFor(decision, member, routine, usual, moved),
  };
  // Planned exposure is zero when indoors, the window mean when moved, else the usual mean.
  return { advice, usual, planned: decision === 'indoors' ? 0 : (moved ?? usual), moveFailed };
}
