import 'server-only';

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

export const MEMBER_ROWS = MAX_MEMBERS;
export const ROUTINE_ROWS = MAX_ROUTINES;

/** The household form as text by field name. Several choices in one field are joined with commas. */
export type FormValues = Record<string, string>;

export interface FormError {
  field: string;
  message: string;
}

const WEEKDAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;
const CLOCK = /^([01]\d|2[0-3]):[0-5]\d$/;

export function collectValues(form: FormData): FormValues {
  const values: FormValues = {};
  for (const [name, value] of form.entries()) {
    if (typeof value !== 'string' || name === 'formToken') continue;
    const text = value.trim().slice(0, 200);
    if (text === '') continue;
    values[name] = name in values ? `${values[name] ?? ''},${text}` : text;
  }
  return values;
}

/** The form values that describe a household, for editing one. Ids become m1.. and r1.. */
export function valuesOfHousehold(household: Household): FormValues {
  const v: FormValues = {
    place: `${household.place.name}, ${household.place.admin1}`,
    lang: household.lang,
    cooking: household.home.cooking,
    heating: household.home.heating,
  };
  const set = (key: string, value: string | number | undefined): void => {
    if (value !== undefined && value !== '') v[key] = String(value);
  };
  set('habits', household.home.habits.join(','));
  set('roomSqft', household.home.roomSqft);
  set('ceilingFt', household.home.ceilingFt);
  set('purifierCadrCfm', household.home.purifierCadrCfm);
  household.members.forEach((m, i) => {
    set(`m${String(i + 1)}_label`, m.label);
    set(`m${String(i + 1)}_age`, m.ageBand);
    set(`m${String(i + 1)}_cond`, m.conditions.join(','));
  });
  household.routines.forEach((r, i) => {
    const p = `r${String(i + 1)}_`;
    set(`${p}member`, `m${String(household.members.findIndex((m) => m.id === r.memberId) + 1)}`);
    set(`${p}kind`, r.kind);
    set(`${p}start`, r.start);
    set(`${p}minutes`, r.minutes);
    set(`${p}intensity`, r.intensity);
    set(`${p}mode`, r.mode);
    set(`${p}km`, r.km);
    set(`${p}days`, r.days.join(','));
    set(`${p}flex`, r.flexHours);
    set(`${p}freeFrom`, r.freeFrom);
    set(`${p}freeTo`, r.freeTo);
  });
  return v;
}

function list(value: string | undefined): string[] {
  return value === undefined || value === '' ? [] : value.split(',');
}

function pick<T extends string>(options: readonly T[], value: string | undefined): T | undefined {
  return options.find((o) => o === value);
}

interface NumberRule {
  min: number;
  max: number;
  int?: boolean;
  what: string;
}

function numberField(
  values: FormValues,
  key: string,
  rule: NumberRule,
  errors: FormError[],
): number | undefined {
  const raw = values[key];
  if (raw === undefined) return undefined;
  const n = Number(raw);
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

function members(values: FormValues, errors: FormError[]): { rows: number[]; list: Member[] } {
  const rows: number[] = [];
  const out: Member[] = [];
  for (let row = 1; row <= MEMBER_ROWS; row += 1) {
    const key = `m${String(row)}_`;
    const label = values[`${key}label`];
    if (label === undefined) continue;
    const ageBand = pick(AGE_BANDS, values[`${key}age`]);
    if (ageBand === undefined) {
      errors.push({ field: `${key}age`, message: `Choose an age group for ${label}.` });
      continue;
    }
    const conditions = list(values[`${key}cond`]).flatMap((c) => {
      const found = pick(['asthma_copd', 'heart', 'pregnancy'] as const, c);
      return found === undefined ? [] : [found];
    });
    rows.push(row);
    out.push({ id: `m${String(row)}`, label: label.slice(0, 40), ageBand, conditions });
  }
  if (out.length === 0 && !errors.some((e) => e.field.endsWith('_age'))) {
    errors.push({ field: 'm1_label', message: 'Add at least one person.' });
  }
  return { rows, list: out };
}

function routines(
  values: FormValues,
  memberIds: ReadonlySet<string>,
  errors: FormError[],
): Routine[] {
  const out: Routine[] = [];
  for (let row = 1; row <= ROUTINE_ROWS; row += 1) {
    const p = `r${String(row)}_`;
    const kind = pick(ROUTINE_KINDS, values[`${p}kind`]);
    if (kind === undefined) continue;
    const before = errors.length;
    const memberId = values[`${p}member`];
    if (memberId === undefined || !memberIds.has(memberId)) {
      errors.push({ field: `${p}member`, message: 'Choose who does this routine.' });
    }
    const start = values[`${p}start`];
    if (start === undefined || !CLOCK.test(start)) {
      errors.push({ field: `${p}start`, message: 'Give a start time, such as 17:30.' });
    }
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
    const flexHours =
      numberField(
        values,
        `${p}flex`,
        { min: 0, max: 4, int: true, what: 'Flexible hours' },
        errors,
      ) ?? 0;
    const km = numberField(values, `${p}km`, { min: 0.1, max: 200, what: 'Distance' }, errors);
    const mode = pick(MODES, values[`${p}mode`]);
    const freeFrom = values[`${p}freeFrom`];
    const freeTo = values[`${p}freeTo`];
    if ((freeFrom === undefined) !== (freeTo === undefined)) {
      errors.push({ field: `${p}freeTo`, message: 'Give both free hours, or leave both empty.' });
    }
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

/** Checks the form field by field, in plain words, then once more against the household schema. */
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
  const cadr = numberField(
    values,
    'purifierCadrCfm',
    { min: 1, max: 2000, what: 'Purifier air flow' },
    errors,
  );
  const cooking = pick(COOKING, values.cooking) ?? 'lpg_png';
  const heating = pick(HEATING, values.heating) ?? 'none';
  const habits = list(values.habits).flatMap((h) => {
    const found = pick(HABITS, h);
    return found === undefined ? [] : [found];
  });
  if (errors.length > 0) return { errors };

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
