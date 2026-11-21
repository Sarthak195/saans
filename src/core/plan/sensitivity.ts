import type { Member, Sensitivity } from '@/core/types';

/**
 * High: infants, under-5s, older adults and anyone with a listed condition (MoHFW and CPCB name these
 * groups). Raised: children and teenagers (US EPA names them). General: an adult with no condition.
 */
export function sensitivityOf(member: Member): Sensitivity {
  if (
    member.ageBand === 'infant' ||
    member.ageBand === 'under5' ||
    member.ageBand === 'older' ||
    member.conditions.length > 0
  ) {
    return 'high';
  }
  return member.ageBand === 'child' || member.ageBand === 'teen' ? 'raised' : 'general';
}
