// Turns a sample place's data into the household its plan page is built from. Server layer. It
// reads nothing and holds no state.
import 'server-only';

import type { Sample } from '@/core/profile/samples';
import type { Household } from '@/core/types';

/**
 * A sample's household, with the question its card was written around. A sample with no question
 * gives its household unchanged.
 */
export function householdOfSample(sample: Sample): Household {
  return sample.question === undefined
    ? sample.household
    : { ...sample.household, questionTarget: sample.question };
}
