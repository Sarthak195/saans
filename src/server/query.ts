import type { PlanDay } from '@/core/time';

export type SearchParams = Record<string, string | string[] | undefined>;

/** The first value of a query parameter, whether the framework gave one or a list. */
export function first(params: SearchParams, name: string): string | undefined {
  const value = params[name];
  const one = Array.isArray(value) ? value[0] : value;
  return one === '' ? undefined : one;
}

/** The query values a plan page understands. Anything else in the address is ignored. */
export function readPlanQuery(params: SearchParams): {
  day?: string | undefined;
  air?: string | undefined;
  lang?: string | undefined;
  status?: string | undefined;
  from?: string | undefined;
  r?: string | undefined;
  note?: string | undefined;
  /** A sealed written summary from the explain step. */
  b?: string | undefined;
} {
  return {
    day: first(params, 'day'),
    air: first(params, 'air'),
    lang: first(params, 'lang'),
    status: first(params, 'status'),
    from: first(params, 'from'),
    r: first(params, 'r'),
    note: first(params, 'note'),
    b: first(params, 'b'),
  };
}

const DAYS: readonly PlanDay['relative'][] = ['today', 'tomorrow', 'day_after'];

/** A day choice from a query or a form, or none when it is not one of the three. */
export function dayOf(value: string | undefined): PlanDay['relative'] | undefined {
  return DAYS.find((d) => d === value);
}

/** The recorded smog day when asked for by name; every other value means live air. */
export function airOf(value: string | undefined): 'smog-day' | undefined {
  return value === 'smog-day' ? 'smog-day' : undefined;
}
