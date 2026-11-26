// The facts the community rules can test, as one type. Pure core: types only, with no clock,
// network or environment, so the rule data and the code that builds the facts agree on the names.
import type { FactValue } from '@/core/rules/evaluate';
import type { PlanLevel } from '@/core/advice/level';
import type { CommunityKind } from '@/core/types';

/**
 * What the community rules can test. `level` is the same one the home advice uses (the worst
 * 3-hour block of the plan day), and `ncr` is true for places in Delhi NCR, where GRAP and the
 * city reporting apps apply.
 */
export interface CommunityFacts extends Record<string, FactValue> {
  /** A housing society, school or office. */
  kind: CommunityKind;
  level: PlanLevel;
  ncr: boolean;
  /** The place is in the state of Delhi, where the city reporting apps work. */
  delhi: boolean;
}
