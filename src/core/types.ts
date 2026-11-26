// The core's shared domain types, all inferred from the profile schema. Types only, so nothing
// here runs. Core layer.
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
  HABITS,
  HEATING,
  INTENSITIES,
  LANGUAGES,
  MODES,
  ROUTINE_KINDS,
  WEEKDAYS,
} from '@/core/profile/schema';

// One canonical type per concept, all inferred from the schema so the form, the sealed link
// and the plan can never disagree about what a household is.
/** A member's age band, from the AGE_BANDS list (infant to older adult). */
export type AgeBand = (typeof AGE_BANDS)[number];
/** A health condition a member can have, from the CONDITIONS list. */
export type Condition = (typeof CONDITIONS)[number];
/** What a routine is, such as a commute or a school run, from the ROUTINE_KINDS list. */
export type RoutineKind = (typeof ROUTINE_KINDS)[number];
/** How hard a routine is: light, moderate or vigorous. */
export type Intensity = (typeof INTENSITIES)[number];
/** How a trip is made, from the MODES list. */
export type Mode = (typeof MODES)[number];
/** A day of the week as a three-letter code, 'mon' to 'sun'. */
export type Weekday = (typeof WEEKDAYS)[number];
/** How a home cooks, from the COOKING list. */
export type Cooking = (typeof COOKING)[number];
/** A household habit from the HABITS list, such as burning incense. */
export type Habit = (typeof HABITS)[number];
/** How a home is heated, from the HEATING list. */
export type Heating = (typeof HEATING)[number];
/** The kind of community: society, school or office. */
export type CommunityKind = (typeof COMMUNITY_KINDS)[number];
/** A language choice, 'en' or 'hi', from the LANGUAGES list. */
export type Language = (typeof LANGUAGES)[number];

/** Where a household is, as parsed by placeSchema. */
export type Place = z.infer<typeof placeSchema>;
/** One person in a household, as parsed by memberSchema. */
export type Member = z.infer<typeof memberSchema>;
/** One outdoor routine of a member, as parsed by routineSchema. */
export type Routine = z.infer<typeof routineSchema>;
/** The household's home details, as parsed by homeSchema. */
export type Home = z.infer<typeof homeSchema>;
/** The community details of a household, as parsed by communitySchema. */
export type Community = z.infer<typeof communitySchema>;
/** A whole household profile, as parsed by householdSchema. */
export type Household = z.infer<typeof householdSchema>;

/** Derived from age band and conditions when a plan is built; never stored in a profile. */
export type Sensitivity = 'high' | 'raised' | 'general';
