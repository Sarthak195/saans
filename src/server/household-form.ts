// Turns the household form, as posted text, into a checked household, with each mistake named in
// plain words next to its field. Server layer: no network and no state. The household schema
// checks the result once more, so the form checks here are for the family's benefit.
import 'server-only';

import { M3H_PER_CFM } from '@/core/home/purifier';
import {
  AGE_BANDS,
  COOKING,
  HABITS,
  HEATING,
  INTENSITIES,
  LANGUAGES,
  MAX_MEMBERS,
  MAX_ROUTINES,
  MODES,
  ROUTINE_KINDS,
  householdSchema,
} from '@/core/profile/schema';
import type { Household, Member, Place, Routine } from '@/core/types';

/** How many person rows are read from the form: the most people a household may hold. */
export const MEMBER_ROWS = MAX_MEMBERS;
/** How many routine rows are read from the form: the most routines a household may hold. */
export const ROUTINE_ROWS = MAX_ROUTINES;

/** The household form as text by field name. Several choices in one field are joined with commas. */
export type FormValues = Record<string, string>;

/** What was typed, and what was wrong with it, by field name. */
export interface FormState {
  values: Readonly<FormValues>;
  errors: readonly FormError[];
}

/** One problem with the form: the name of the field it belongs to, and what to tell the family. */
export interface FormError {
  field: string;
  message: string;
}

// The weekday codes a routine's days may use.
const WEEKDAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;
// A 24-hour clock time written "HH:MM", from 00:00 to 23:59: "17:30" matches, "7:30" does not.
const CLOCK = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * Reads every text field of a posted form into one record by field name. Empty fields, uploads
 * and the form token are left out, each value is trimmed and cut to 200 characters, and a field
 * sent more than once (a group of ticked boxes) becomes one value joined with commas.
 */
export function collectValues(form: FormData): FormValues {
  const values: FormValues = {};
  for (const [name, value] of form.entries()) {
    // A file is not text, and the token is not something the family typed.
    if (typeof value !== 'string' || name === 'formToken') continue;
    const text = value.trim().slice(0, 200);
    if (text === '') continue;
    values[name] = name in values ? `${values[name] ?? ''},${text}` : text;
  }
  return values;
}

/** The comma-joined choices of one field as a list; a missing or empty field is an empty list. */
function list(value: string | undefined): string[] {
  return value === undefined || value === '' ? [] : value.split(',');
}

/** The option equal to the value, or undefined: this narrows text to a known choice safely. */
function pick<T extends string>(options: readonly T[], value: string | undefined): T | undefined {
  return options.find((o) => o === value);
}

// The limits and the plain name of a number field, for the message when it is out of range.
interface NumberRule {
  min: number;
  max: number;
  int?: boolean;
  what: string;
}

/**
 * Reads a number field within its limits. A missing field gives undefined with no error; a value
 * that is not a finite number, is out of range, or is not whole when it must be, adds an error.
 */
function numberField(
  values: FormValues,
  key: string,
  rule: NumberRule,
  errors: FormError[],
): number | undefined {
  const raw = values[key];
  if (raw === undefined) return undefined;
  const n = Number(raw);
  // Text that is not a number reads as NaN, which is not finite, so it fails here.
  const bad =
    !Number.isFinite(n) ||
    n < rule.min ||
    n > rule.max ||
    (rule.int === true && !Number.isInteger(n));
  if (bad) {
    const kind = rule.int === true ? 'a whole number' : 'a number';
    errors.push({
      field: key,
      message: `${rule.what} must be ${kind} from ${String(rule.min)} to ${String(rule.max)}.`,
    });
    return undefined;
  }
  return n;
}

/** The purifier rating in cfm, converted from m3/h when that is the unit chosen. */
function purifierCfm(values: FormValues, errors: FormError[]): number | undefined {
  const perHour = values.purifierUnit === 'm3h';
  const factor = perHour ? M3H_PER_CFM : 1;
  // A household holds at most 2000 cfm, so the limit in m3/h is that times the conversion factor.
  const rating = numberField(
    values,
    'purifierCadrCfm',
    { min: 1, max: Math.round(2000 * factor), what: 'Purifier air flow' },
    errors,
  );
  // The rating in cfm, rounded and kept within 1 to 2000.
  return rating === undefined
    ? undefined
    : Math.min(2000, Math.max(1, Math.round(rating / factor)));
}

/**
 * The people on the form, as members with ids m1, m2 and so on by row, and the row numbers that
 * were used. A row with no name is skipped; a named row needs an age group.
 */
function members(values: FormValues, errors: FormError[]): { rows: number[]; list: Member[] } {
  const rows: number[] = [];
  const out: Member[] = [];
  for (let row = 1; row <= MEMBER_ROWS; row += 1) {
    const key = `m${String(row)}_`;
    const label = values[`${key}label`];
    // An unused row has no name and is not an error.
    if (label === undefined) continue;
    const ageBand = pick(AGE_BANDS, values[`${key}age`]);
    if (ageBand === undefined) {
      errors.push({ field: `${key}age`, message: `Choose an age group for ${label}.` });
      continue;
    }
    // Unknown condition values are dropped rather than reported.
    const conditions = list(values[`${key}cond`]).flatMap((c) => {
      const found = pick(['asthma_copd', 'heart', 'pregnancy'] as const, c);
      return found === undefined ? [] : [found];
    });
    rows.push(row);
    // 40 characters is the longest name the household schema accepts.
    out.push({ id: `m${String(row)}`, label: label.slice(0, 40), ageBand, conditions });
  }
  // An age error already explains why nobody was added, so "add a person" is not said as well.
  if (out.length === 0 && !errors.some((e) => e.field.endsWith('_age'))) {
    errors.push({ field: 'm1_label', message: 'Add at least one person.' });
  }
  return { rows, list: out };
}

/**
 * The routines on the form, with ids r1, r2 and so on by row. A row counts only when it has a
 * kind; a row with any mistake adds its errors and is left out of the result.
 */
function routines(
  values: FormValues,
  memberIds: ReadonlySet<string>,
  errors: FormError[],
): Routine[] {
  const out: Routine[] = [];
  for (let row = 1; row <= ROUTINE_ROWS; row += 1) {
    const p = `r${String(row)}_`;
    const kind = pick(ROUTINE_KINDS, values[`${p}kind`]);
    // A row with no kind is an unused row.
    if (kind === undefined) continue;
    // Remembered so the row can tell afterwards whether it added any error of its own.
    const before = errors.length;
    const memberId = values[`${p}member`];
    if (memberId === undefined || !memberIds.has(memberId)) {
      errors.push({ field: `${p}member`, message: 'Choose who does this routine.' });
    }
    const start = values[`${p}start`];
    if (start === undefined || !CLOCK.test(start)) {
      errors.push({ field: `${p}start`, message: 'Give a start time, such as 17:30.' });
    }
    // Whole minutes, from 1 to 480 (8 hours), as the household schema allows.
    const minutes = numberField(
      values,
      `${p}minutes`,
      { min: 1, max: 480, int: true, what: 'Minutes' },
      errors,
    );
    if (values[`${p}minutes`] === undefined) {
      errors.push({ field: `${p}minutes`, message: 'Say how many minutes it takes.' });
    }
    const intensity = pick(INTENSITIES, values[`${p}intensity`]);
    if (intensity === undefined) {
      errors.push({ field: `${p}intensity`, message: 'Choose how hard the activity is.' });
    }
    const days = list(values[`${p}days`]).flatMap((d) => {
      const found = pick(WEEKDAYS, d);
      return found === undefined ? [] : [found];
    });
    if (days.length === 0) errors.push({ field: `${p}days`, message: 'Choose at least one day.' });
    // Flexible hours are optional and default to none; the schema allows 0 to 4 whole hours.
    const flexHours =
      numberField(
        values,
        `${p}flex`,
        { min: 0, max: 4, int: true, what: 'Flexible hours' },
        errors,
      ) ?? 0;
    // Trip length in kilometres, optional.
    const km = numberField(values, `${p}km`, { min: 0.1, max: 200, what: 'Distance' }, errors);
    const mode = pick(MODES, values[`${p}mode`]);
    const freeFrom = values[`${p}freeFrom`];
    const freeTo = values[`${p}freeTo`];
    // The free hours come as a pair: both or neither.
    if ((freeFrom === undefined) !== (freeTo === undefined)) {
      errors.push({ field: `${p}freeTo`, message: 'Give both free hours, or leave both empty.' });
    }
    // A row with any mistake is left out. The undefined tests also narrow the types.
    if (
      errors.length > before ||
      memberId === undefined ||
      start === undefined ||
      minutes === undefined ||
      intensity === undefined
    )
      continue;
    out.push({
      id: `r${String(row)}`,
      memberId,
      kind,
      start,
      minutes,
      intensity,
      ...(mode === undefined ? {} : { mode }),
      ...(km === undefined ? {} : { km }),
      days,
      flexHours,
      ...(freeFrom !== undefined && freeTo !== undefined ? { freeFrom, freeTo } : {}),
    });
  }
  return out;
}

/**
 * Checks the form field by field, in plain words, then once more against the household schema.
 * Returns the household, or every mistake found, so the family can fix them in one go. The place
 * is passed in already resolved.
 */
export function parseHouseholdForm(
  values: FormValues,
  place: Place,
): { household: Household } | { errors: FormError[] } {
  const errors: FormError[] = [];
  const people = members(values, errors);
  const plan = routines(values, new Set(people.list.map((m) => m.id)), errors);
  const roomSqft = numberField(
    values,
    'roomSqft',
    { min: 20, max: 5000, what: 'Room size' },
    errors,
  );
  const ceilingFt = numberField(
    values,
    'ceilingFt',
    { min: 6, max: 30, what: 'Ceiling height' },
    errors,
  );
  const cadr = purifierCfm(values, errors);
  // Choices left out or not recognised fall back to the common case: cooking on LPG or piped
  // gas, no heating, English.
  const cooking = pick(COOKING, values.cooking) ?? 'lpg_png';
  const heating = pick(HEATING, values.heating) ?? 'none';
  const habits = list(values.habits).flatMap((h) => {
    const found = pick(HABITS, h);
    return found === undefined ? [] : [found];
  });
  if (errors.length > 0) return { errors };

  // v is the version of the household shape.
  const parsed = householdSchema.safeParse({
    v: 1,
    place,
    members: people.list,
    routines: plan,
    home: {
      ...(roomSqft === undefined ? {} : { roomSqft }),
      ...(ceilingFt === undefined ? {} : { ceilingFt }),
      ...(cadr === undefined ? {} : { purifierCadrCfm: cadr }),
      cooking,
      habits,
      heating,
    },
    lang: pick(LANGUAGES, values.lang) ?? 'en',
  });
  if (parsed.success) return { household: parsed.data };
  // The checks above cover every field a person types, so this is a catch-all that should not show.
  return {
    errors: [{ field: 'form', message: 'Something in the form does not fit. Check each section.' }],
  };
}
