import 'server-only';

import type { Sample } from '@/core/profile/samples';
import type { Household } from '@/core/types';

/** A sample's household, with the question its card was written around. */
export function householdOfSample(sample: Sample): Household {
  return sample.question === undefined
    ? sample.household
    : { ...sample.household, questionTarget: sample.question };
}
