import 'server-only';

import { withQuery } from '@/components/links';
import { MODES } from '@/core/profile/schema';
import type { Household, Mode, Place } from '@/core/types';
import { field } from '@/server/http';
import type { PlaceMatch } from '@/server/geo/geocode';
import { sealDraft } from '@/server/seal';
import type { Draft } from '@/server/seal';

const CLOCK = /^([01]\d|2[0-3]):[0-5]\d$/;
const DAYS = ['today', 'tomorrow', 'day_after'] as const;

export function validClock(value: string): boolean {
  return CLOCK.test(value);
}

export function modeOf(value: string): Mode | undefined {
  return MODES.find((m) => m === value);
}

/** One decimal, the precision a household keeps for a place. */
function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

export function toPlace(match: Pick<PlaceMatch, 'name' | 'admin1' | 'lat' | 'lon'>): Place {
  return {
    name: match.name,
    admin1: match.admin1,
    lat: round1(match.lat),
    lon: round1(match.lon),
  };
}

/** The day and air choices a form carried along, checked, as query values for the next page. */
export function keepFromForm(form: FormData): { day?: string; air?: string } {
  const day = field(form, 'day', 12);
  const air = field(form, 'air', 12);
  return {
    ...(DAYS.some((d) => d === day) ? { day } : {}),
    ...(air === 'smog-day' ? { air } : {}),
  };
}

/** A household with one routine moved to a new start time or given a new mode. */
export function withRoutineChange(
  household: Household,
  change: { routineId: string; newStart?: string | undefined; newMode?: Mode | undefined },
): Household | undefined {
  const index = household.routines.findIndex((r) => r.id === change.routineId);
  const routine = household.routines[index];
  if (routine === undefined) return undefined;
  const changed = {
    ...routine,
    ...(change.newStart !== undefined && validClock(change.newStart)
      ? { start: change.newStart }
      : {}),
    ...(change.newMode === undefined ? {} : { mode: change.newMode }),
  };
  return {
    ...household,
    routines: household.routines.map((r, i) => (i === index ? changed : r)),
  };
}

/** The address of a plan: its sealed household in the path, with the query and anchor given. */
export function planPath(
  token: string,
  query: Readonly<Record<string, string | undefined>>,
  anchor: string,
): string {
  return `${withQuery(`/plan/${token}`, query)}#${anchor}`;
}

/** A page of its own for a step that needs one more answer, carrying our own words in a sealed draft. */
export function draftPath(
  path: string,
  draft: Draft,
  extra: Readonly<Record<string, string | undefined>> = {},
): string {
  return withQuery(path, { ...extra, draft: sealDraft(draft) });
}
