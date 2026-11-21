import { z } from 'zod';

export const MAX_MEMBERS = 6;
export const MAX_ROUTINES = 8;
export const MAX_TEXT = 1500;
export const MAX_LABEL = 40;
const MAX_NAME = 80;

// India's bounding box. A profile outside it is refused so the app never claims to cover a
// place its data and guidance do not.
export const INDIA_LAT = { min: 6, max: 38 } as const;
export const INDIA_LON = { min: 68, max: 98 } as const;

export const AGE_BANDS = ['infant', 'under5', 'child', 'teen', 'adult', 'older'] as const;
export const CONDITIONS = ['asthma_copd', 'heart', 'pregnancy'] as const;
export const ROUTINE_KINDS = [
  'school_run',
  'outdoor_play',
  'sport',
  'walk',
  'commute',
  'errand',
] as const;
export const INTENSITIES = ['light', 'moderate', 'vigorous'] as const;
export const MODES = ['walk', 'cycle', 'two_wheeler', 'auto', 'car', 'bus', 'metro_rail'] as const;
export const WEEKDAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;
export const COOKING = ['lpg_png', 'electric', 'biomass', 'kerosene'] as const;
export const HABITS = ['incense', 'mosquito_coil', 'smoking', 'candles'] as const;
export const HEATING = ['none', 'electric', 'angithi_coal', 'gas'] as const;
export const COMMUNITY_KINDS = ['society', 'school', 'office'] as const;
export const LANGUAGES = ['en', 'hi'] as const;

const ageBandSchema = z.enum(AGE_BANDS);
const conditionSchema = z.enum(CONDITIONS);
const routineKindSchema = z.enum(ROUTINE_KINDS);
const intensitySchema = z.enum(INTENSITIES);
const modeSchema = z.enum(MODES);
const weekdaySchema = z.enum(WEEKDAYS);

const idSchema = z
  .string()
  .min(1)
  .max(32)
  .regex(/^[A-Za-z0-9_-]+$/, 'Use letters, digits, hyphen or underscore');

/** 24-hour clock time, as typed into a time input. */
const clockSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:MM, 24-hour');

/** Coordinates are kept to one decimal (about 11 km) so a profile never pins down a home. */
function coordinate(range: { readonly min: number; readonly max: number }): z.ZodNumber {
  return z
    .number()
    .min(range.min)
    .max(range.max)
    .refine((v) => Math.abs(v * 10 - Math.round(v * 10)) < 1e-6, 'Round to 0.1 degree');
}

export const placeSchema = z.strictObject({
  name: z.string().trim().min(1).max(MAX_NAME),
  admin1: z.string().trim().min(1).max(MAX_NAME),
  lat: coordinate(INDIA_LAT),
  lon: coordinate(INDIA_LON),
});

export const memberSchema = z.strictObject({
  id: idSchema,
  label: z.string().trim().min(1).max(MAX_LABEL),
  ageBand: ageBandSchema,
  conditions: z
    .array(conditionSchema)
    .max(CONDITIONS.length)
    .refine((list) => new Set(list).size === list.length, 'List each condition once'),
});

export const routineSchema = z
  .strictObject({
    id: idSchema,
    memberId: idSchema,
    kind: routineKindSchema,
    start: clockSchema,
    minutes: z.number().int().min(1).max(480),
    intensity: intensitySchema,
    mode: modeSchema.optional(),
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

export const communitySchema = z.strictObject({
  kind: z.enum(COMMUNITY_KINDS),
  households: z.number().int().min(1).max(10_000).optional(),
  outdoorSlots: z.array(routineSchema).max(MAX_ROUTINES),
});

function hasDuplicates(values: readonly string[]): boolean {
  return new Set(values).size !== values.length;
}

export const householdSchema = z
  .strictObject({
    v: z.literal(1),
    place: placeSchema,
    members: z.array(memberSchema).min(1).max(MAX_MEMBERS),
    routines: z.array(routineSchema).max(MAX_ROUTINES),
    home: homeSchema,
    question: z.string().trim().max(MAX_TEXT).optional(),
    lang: z.enum(LANGUAGES),
    community: communitySchema.optional(),
  })
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
