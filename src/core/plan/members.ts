import type { Evaluated } from '@/core/plan/advice';
import { percentLess } from '@/core/plan/pm25';
import { sensitivityOf } from '@/core/plan/sensitivity';
import type { MemberSummary } from '@/core/plan/types';
import type { Member } from '@/core/types';

/** Total PM2.5 breathed outdoors in a day: for each routine the mean PM2.5 times its hours. */
function sum(evaluated: Evaluated[], memberId: string, field: 'usual' | 'planned'): number {
  return evaluated
    .filter((e) => e.advice.memberId === memberId)
    .reduce((total, e) => total + (e[field] ?? 0) * (e.advice.minutes / 60), 0);
}

/** The exposure index for each member as usual and with the plan; shown values are rounded to 5. */
export function summariseMembers(members: Member[], evaluated: Evaluated[]): MemberSummary[] {
  return members.map((member, index) => {
    const usual = sum(evaluated, member.id, 'usual');
    const planned = sum(evaluated, member.id, 'planned');
    return {
      memberId: member.id,
      memberRef: `member_${String(index + 1)}`,
      label: member.label,
      sensitivity: sensitivityOf(member),
      exposureUsual: Math.round(usual / 5) * 5,
      exposurePlan: Math.round(planned / 5) * 5,
      percentLess: percentLess(usual, planned),
    };
  });
}
