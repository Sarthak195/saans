import type { QuestionTarget } from '@/core/plan/types';
import { hoursIn } from '@/core/reader/clock';
import type { QuestionAbout } from '@/core/reader/schema';
import { TODAY_TERMS, SPEAKER_TERMS, hasTerm, mentionsAny } from '@/core/reader/terms';
import { normalizeText, quoteInText } from '@/core/text';
import { termsForValue } from '@/core/text/lexicon';
import type { RoutineKind } from '@/core/types';

/** The members and routines a question can point at, by the ids the plan uses. */
export interface TargetContext {
  members: readonly { id: string; label: string }[];
  routines: readonly { id: string; memberId: string; kind: RoutineKind }[];
}

function memberNamed(quote: string, ctx: TargetContext): string | undefined {
  const named = ctx.members.find((m) => hasTerm(quote, m.label));
  if (named) return named.id;
  const speaks = mentionsAny(quote, SPEAKER_TERMS);
  return speaks ? ctx.members.find((m) => normalizeText(m.label) === 'me')?.id : undefined;
}

function routineOf(
  quote: string,
  memberId: string | undefined,
  ctx: TargetContext,
): string | undefined {
  const byKind = ctx.routines.filter((r) => termsForValue(r.kind).some((t) => hasTerm(quote, t)));
  const mine = byKind.filter((r) => memberId === undefined || r.memberId === memberId);
  if (mine.length === 1) return mine[0]?.id;
  if (mine.length > 1) return undefined;
  if (byKind.length === 1 && memberId === undefined) return byKind[0]?.id;
  // "Can my son play?" names a member who has one routine: that is the routine.
  const ofMember = ctx.routines.filter((r) => r.memberId === memberId);
  return memberId !== undefined && ofMember.length === 1 ? ofMember[0]?.id : undefined;
}

/**
 * What a question points at, from the words the family quoted. A member or routine counts only
 * when its name or activity is in the quote, an hour only when the quote has that clock time, and
 * "today" only when the quote says so. Everything else is left out rather than guessed.
 */
export function resolveTarget(
  text: string,
  about: QuestionAbout,
  ctx: TargetContext,
): QuestionTarget {
  const target: QuestionTarget = {};
  const named = about.about;
  if (named && quoteInText(text, named.quote)) {
    const memberId = memberNamed(named.quote, ctx);
    const routineId = routineOf(named.quote, memberId, ctx);
    if (routineId !== undefined) {
      target.routineId = routineId;
      const owner = ctx.routines.find((r) => r.id === routineId)?.memberId ?? memberId;
      if (owner !== undefined) target.memberId = owner;
    } else if (memberId !== undefined) {
      target.memberId = memberId;
    }
  }
  const hour = about.hour;
  if (hour && quoteInText(text, hour.quote) && hoursIn(hour.quote).includes(hour.value)) {
    target.hour = hour.value;
  }
  const today = about.today;
  if (today?.value && quoteInText(text, today.quote) && mentionsAny(today.quote, TODAY_TERMS)) {
    target.aboutToday = true;
  }
  return target;
}

/** True when a target points at a member or routine the household really has. */
export function hasSubject(target: QuestionTarget): boolean {
  return target.routineId !== undefined || target.memberId !== undefined;
}
