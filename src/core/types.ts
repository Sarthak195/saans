import type { z } from 'zod';

import type {
  communitySchema,
  homeSchema,
  householdSchema,
  memberSchema,
  placeSchema,
  routineSchema,
  AGE_BANDS,
  COMMUNITY_KINDS,
  CONDITIONS,
  COOKING,
  HEATING,
  INTENSITIES,
  LANGUAGES,
  MODES,
  ROUTINE_KINDS,
  WEEKDAYS,
} from '@/core/profile/schema';

// One canonical type per concept, all inferred from the schema so the form, the sealed link
// and the plan can never disagree about what a household is.
export type AgeBand = (typeof AGE_BANDS)[number];
export type Condition = (typeof CONDITIONS)[number];
export type RoutineKind = (typeof ROUTINE_KINDS)[number];
export type Intensity = (typeof INTENSITIES)[number];
export type Mode = (typeof MODES)[number];
export type Weekday = (typeof WEEKDAYS)[number];
export type Cooking = (typeof COOKING)[number];
export type Heating = (typeof HEATING)[number];
export type CommunityKind = (typeof COMMUNITY_KINDS)[number];
export type Language = (typeof LANGUAGES)[number];

export type Place = z.infer<typeof placeSchema>;
export type Member = z.infer<typeof memberSchema>;
export type Routine = z.infer<typeof routineSchema>;
export type Home = z.infer<typeof homeSchema>;
export type Community = z.infer<typeof communitySchema>;
export type Household = z.infer<typeof householdSchema>;

/** Derived from age band and conditions when a plan is built; never stored in a profile. */
export type Sensitivity = 'high' | 'raised' | 'general';
