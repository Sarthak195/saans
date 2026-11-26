// The shape of a household profile and the limits on it, as zod schemas.
// Layer: core (pure). The sample households are checked against the same schemas.
import { z } from 'zod';

// Size limits on a profile: how many people and routines, and how long the written parts may be.
/** The most people in one household. */
export const MAX_MEMBERS = 6;
/** The most routines in one household (and in one community's outdoor slots). */
export const MAX_ROUTINES = 8;
/** The most characters of written text a family can send, such as a question. */
export const MAX_TEXT = 1500;
/** The most characters in a person's label. */
export const MAX_LABEL = 40;
// The most characters in a place name or its state.
const MAX_NAME = 80;

// India's bounding box. A profile outside it is refused so the app never claims to cover a
// place its data and guidance do not.
/** Latitude range, in degrees, of the area the app covers. */
export const INDIA_LAT = { min: 6, max: 38 } as const;
/** Longitude range, in degrees, of the area the app covers. */
export const INDIA_LON = { min: 68, max: 98 } as const;

// The allowed values for the choice fields of a profile, each exported for the form to list.
/** Age bands a household member can be in. */
export const AGE_BANDS = ['infant', 'under5', 'child', 'teen', 'adult', 'older'] as const;
/** Health conditions a member can list. */
export const CONDITIONS = ['asthma_copd', 'heart', 'pregnancy'] as const;
/** Kinds of outdoor routine. */
export const ROUTINE_KINDS = [
  'school_run',
  'outdoor_play',
  'sport',
  'walk',
  'commute',
  'errand',
] as const;
/** How hard a routine is on the body. */
export const INTENSITIES = ['light', 'moderate', 'vigorous'] as const;
/** How a trip is made. */
export const MODES = ['walk', 'cycle', 'two_wheeler', 'auto', 'car', 'bus', 'metro_rail'] as const;
/** Short weekday names, Monday first. */
export const WEEKDAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;
/** Cooking fuels at home. */
export const COOKING = ['lpg_png', 'electric', 'biomass', 'kerosene'] as const;
/** Indoor smoke habits a household can list. */
export const HABITS = ['incense', 'mosquito_coil', 'smoking', 'candles'] as const;
/** Kinds of heating at home. */
export const HEATING = ['none', 'electric', 'angithi_coal', 'gas'] as const;
/** Kinds of community a plan can be made for. */
export const COMMUNITY_KINDS = ['society', 'school', 'office'] as const;
/** Languages the written text can be in: English and Hindi. */
export const LANGUAGES = ['en', 'hi'] as const;

// One schema for each list above, shared by the object schemas below.
const ageBandSchema = z.enum(AGE_BANDS);
const conditionSchema = z.enum(CONDITIONS);
const routineKindSchema = z.enum(ROUTINE_KINDS);
const intensitySchema = z.enum(INTENSITIES);
const modeSchema = z.enum(MODES);
const weekdaySchema = z.enum(WEEKDAYS);

// Member and routine ids: 1 to 32 letters, digits, hyphens or underscores.
const idSchema = z
  .string()
  .min(1)
  .max(32)
  .regex(/^[A-Za-z0-9_-]+$/, 'Use letters, digits, hyphen or underscore');

/** 24-hour clock time, as typed into a time input. */
const clockSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:MM, 24-hour');

/**
 * Coordinates are kept to one decimal (about 11 km) so a profile never pins down a home. The
 * refine accepts any value within a tiny margin of a multiple of 0.1, for floating-point error.
 */
function coordinate(range: { readonly min: number; readonly max: number }): z.ZodNumber {
  return z
    .number()
    .min(range.min)
    .max(range.max)
    .refine((v) => Math.abs(v * 10 - Math.round(v * 10)) < 1e-6, 'Round to 0.1 degree');
}

/** A place in India: its name, its state and a coordinate rounded to 0.1 degree. */
export const placeSchema = z.strictObject({
  name: z.string().trim().min(1).max(MAX_NAME),
  admin1: z.string().trim().min(1).max(MAX_NAME),
  lat: coordinate(INDIA_LAT),
  lon: coordinate(INDIA_LON),
});

/** One person in the household. Conditions are listed once each. */
export const memberSchema = z.strictObject({
  id: idSchema,
  label: z.string().trim().min(1).max(MAX_LABEL),
  ageBand: ageBandSchema,
  conditions: z
    .array(conditionSchema)
    .max(CONDITIONS.length)
    .refine((list) => new Set(list).size === list.length, 'List each condition once'),
});

/**
 * One outdoor routine: who does it, when, for how many minutes and how hard. `flexHours` is how
 * many whole hours it can move either way; `freeFrom` and `freeTo` are the hours the person is
 * free, and are given together or not at all.
 */
export const routineSchema = z
  .strictObject({
    id: idSchema,
    memberId: idSchema,
    kind: routineKindSchema,
    start: clockSchema,
    // Whole minutes, up to 8 hours.
    minutes: z.number().int().min(1).max(480),
    intensity: intensitySchema,
    mode: modeSchema.optional(),
    // The trip length in kilometres.
    km: z.number().positive().max(200).optional(),
    days: z
      .array(weekdaySchema)
      .min(1)
      .max(WEEKDAYS.length)
      .refine((list) => new Set(list).size === list.length, 'List each day once'),
    flexHours: z.number().int().min(0).max(4),
    freeFrom: clockSchema.optional(),
    freeTo: clockSchema.optional(),
  })
  .refine((r) => (r.freeFrom === undefined) === (r.freeTo === undefined), {
    message: 'Give both free hours or neither',
    path: ['freeTo'],
  });

/**
 * The home: room size, ceiling height and purifier rating in CADR cfm (all optional), plus
 * cooking, smoke habits and heating.
 */
export const homeSchema = z.strictObject({
  roomSqft: z.number().min(20).max(5000).optional(),
  ceilingFt: z.number().min(6).max(30).optional(),
  purifierCadrCfm: z.number().positive().max(2000).optional(),
  cooking: z.enum(COOKING),
  habits: z
    .array(z.enum(HABITS))
    .max(HABITS.length)
    .refine((list) => new Set(list).size === list.length, 'List each habit once'),
  heating: z.enum(HEATING),
});

/** A society, school or office, with an optional household count and its outdoor slots. */
export const communitySchema = z.strictObject({
  kind: z.enum(COMMUNITY_KINDS),
  households: z.number().int().min(1).max(10_000).optional(),
  outdoorSlots: z.array(routineSchema).max(MAX_ROUTINES),
});

// True when a list of ids repeats a value.
function hasDuplicates(values: readonly string[]): boolean {
  return new Set(values).size !== values.length;
}

/**
 * A whole household profile: place, members, routines, home and optional question and community.
 * `v` is the profile version. Member ids and routine ids must be unique, and every routine must
 * belong to a member who is in the household.
 */
export const householdSchema = z
  .strictObject({
    v: z.literal(1),
    place: placeSchema,
    members: z.array(memberSchema).min(1).max(MAX_MEMBERS),
    routines: z.array(routineSchema).max(MAX_ROUTINES),
    home: homeSchema,
    // The family's own words, if they wrote any, and which routine, member or hour they are about.
    question: z.string().trim().max(MAX_TEXT).optional(),
    questionTarget: z
      .strictObject({
        routineId: idSchema.optional(),
        memberId: idSchema.optional(),
        hour: z.number().int().min(0).max(23).optional(),
        aboutToday: z.boolean().optional(),
      })
      .optional(),
    lang: z.enum(LANGUAGES),
    community: communitySchema.optional(),
  })
  // Checks that span fields, so they cannot sit on a single field's schema.
  .superRefine((household, ctx) => {
    if (hasDuplicates(household.members.map((m) => m.id))) {
      ctx.addIssue({ code: 'custom', message: 'Member ids must be unique', path: ['members'] });
    }
    if (hasDuplicates(household.routines.map((r) => r.id))) {
      ctx.addIssue({ code: 'custom', message: 'Routine ids must be unique', path: ['routines'] });
    }
    const memberIds = new Set(household.members.map((m) => m.id));
    household.routines.forEach((routine, index) => {
      if (!memberIds.has(routine.memberId)) {
        ctx.addIssue({
          code: 'custom',
          message: 'Routine refers to a member who is not in the household',
          path: ['routines', index, 'memberId'],
        });
      }
    });
  });
