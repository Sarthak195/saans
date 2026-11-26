// Reads the query part of a page address into the few values the app understands. Server layer.
// It has no side effects and imports only a type, so routes and pages can all share it.
import type { PlanDay } from '@/core/time';

/** The query values as Next hands them over: one string, a list when repeated, or nothing. */
export type SearchParams = Record<string, string | string[] | undefined>;

/** The first value of a query parameter, whether the framework gave one or a list. */
export function first(params: SearchParams, name: string): string | undefined {
  const value = params[name];
  const one = Array.isArray(value) ? value[0] : value;
  // An empty value (such as "?day=") counts as absent.
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
  // The values are raw text. dayOf and airOf below check the ones that must be one of a few words.
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

// The three plan days, in order from now.
const DAYS: readonly PlanDay['relative'][] = ['today', 'tomorrow', 'day_after'];

/** A day choice from a query or a form, or none when it is not one of the three. */
export function dayOf(value: string | undefined): PlanDay['relative'] | undefined {
  return DAYS.find((d) => d === value);
}

/** The recorded smog day when asked for by name; every other value means live air. */
export function airOf(value: string | undefined): 'smog-day' | undefined {
  return value === 'smog-day' ? 'smog-day' : undefined;
}
