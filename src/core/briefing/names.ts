import type { Plan, RoutineAdvice } from '@/core/plan/types';

const PLACEHOLDER = /\b(routine|member)_(\d+)\b/gi;

const ACTIVITY: Record<RoutineAdvice['kind'], string> = {
  school_run: 'school run',
  outdoor_play: 'outdoor play',
  sport: 'sport',
  walk: 'walk',
  commute: 'commute',
  errand: 'errand',
};

function possessive(label: string): string {
  const lower = label.trim().toLowerCase();
  return lower === 'me' || lower === 'i' ? 'Your' : `${label.trim()}'s`;
}

/** "Son's outdoor play": a routine as the family would call it. */
export function routineName(routine: RoutineAdvice): string {
  return `${possessive(routine.memberLabel)} ${ACTIVITY[routine.kind]}`;
}

/**
 * Puts the family's own labels back in place of the placeholders the model was given. Run only
 * after the text has passed its checks, so a label can never reach a number or a decision.
 * Returns undefined when a placeholder is left over, so the caller falls back to the template.
 */
export function substituteNames(text: string, plan: Plan): string | undefined {
  const byRef = new Map<string, string>();
  for (const member of plan.members) byRef.set(member.memberRef.toLowerCase(), member.label);
  for (const routine of plan.routines) {
    byRef.set(routine.ref.toLowerCase(), routineName(routine));
  }
  const unresolved: string[] = [];
  const result = text.replace(PLACEHOLDER, (match) => {
    const name = byRef.get(match.toLowerCase());
    if (name === undefined) unresolved.push(match);
    return name ?? match;
  });
  return unresolved.length > 0 ? undefined : result;
}
