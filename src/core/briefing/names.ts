// Names a family's routines from their own labels, and puts those names in place of the
// placeholders (member_1, routine_2) the model was given. Pure: no clock, network or environment.
import type { Plan, RoutineAdvice } from '@/core/plan/types';

// Matches a placeholder such as member_1 or Routine_12, in any letter case.
const PLACEHOLDER = /\b(routine|member)_(\d+)\b/gi;

// How each kind of routine reads in English inside a name, such as "school run".
const ACTIVITY: Record<RoutineAdvice['kind'], string> = {
  school_run: 'school run',
  outdoor_play: 'outdoor play',
  sport: 'sport',
  walk: 'walk',
  commute: 'commute',
  errand: 'errand',
};

// "Son's" for the label "Son"; "Your" when the label says the member is the reader (me or I).
function possessive(label: string): string {
  const lower = label.trim().toLowerCase();
  return lower === 'me' || lower === 'i' ? 'Your' : `${label.trim()}'s`;
}

/** A routine as the family would call it, such as "Son's outdoor play" or "Your walk". */
export function routineName(routine: RoutineAdvice): string {
  return `${possessive(routine.memberLabel)} ${ACTIVITY[routine.kind]}`;
}

/**
 * Puts the family's own labels back in place of the placeholders the model was given. Run only
 * after the text has passed its checks, so a label can never reach a number or a decision.
 * Returns undefined when a placeholder is left over, so the caller falls back to the template.
 */
export function substituteNames(text: string, plan: Plan): string | undefined {
  // Keys are lower-cased so a placeholder matches whatever letter case the model wrote.
  const byRef = new Map<string, string>();
  for (const member of plan.members) byRef.set(member.memberRef.toLowerCase(), member.label);
  for (const routine of plan.routines) {
    byRef.set(routine.ref.toLowerCase(), routineName(routine));
  }
  // Placeholders with no matching member or routine.
  const unresolved: string[] = [];
  const result = text.replace(PLACEHOLDER, (match) => {
    const name = byRef.get(match.toLowerCase());
    if (name === undefined) unresolved.push(match);
    return name ?? match;
  });
  // A leftover placeholder would show a raw "routine_9" to a family, so no text is returned.
  return unresolved.length > 0 ? undefined : result;
}
