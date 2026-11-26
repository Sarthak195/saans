// Per-member exposure totals for a plan: as usual, with the plan, and the share removed.
// Layer: core (pure). Works only from the advice already computed for each routine.
import { roundToFive } from '@/core/format';
import type { Evaluated } from '@/core/plan/advice';
import { percentLess } from '@/core/plan/pm25';
import { sensitivityOf } from '@/core/plan/sensitivity';
import type { MemberSummary } from '@/core/plan/types';
import type { Member } from '@/core/types';

/**
 * Total PM2.5 breathed outdoors in a day: for each routine the mean PM2.5 times its hours.
 * A routine with no data, or not on the plan day, has a null mean and adds nothing.
 */
function sum(evaluated: Evaluated[], memberId: string, field: 'usual' | 'planned'): number {
  return evaluated
    .filter((e) => e.advice.memberId === memberId)
    .reduce((total, e) => total + (e[field] ?? 0) * (e.advice.minutes / 60), 0);
}

/**
 * The exposure index for each member as usual and with the plan; shown values are rounded to the
 * nearest 5. A member with no routines gets zero for both and a cut of 0 percent.
 */
export function summariseMembers(members: Member[], evaluated: Evaluated[]): MemberSummary[] {
  return members.map((member, index) => {
    const usual = sum(evaluated, member.id, 'usual');
    const planned = sum(evaluated, member.id, 'planned');
    return {
      memberId: member.id,
      // Placeholder such as member_1 used in place of the label in the facts sent to Gemini; the
      // label is put back only after the written text has been checked.
      memberRef: `member_${String(index + 1)}`,
      label: member.label,
      sensitivity: sensitivityOf(member),
      exposureUsual: roundToFive(usual),
      exposurePlan: roundToFive(planned),
      percentLess: percentLess(usual, planned),
    };
  });
}
