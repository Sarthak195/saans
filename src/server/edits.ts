import 'server-only';

import { withQuery } from '@/components/links';
import { COMMUNITY_KINDS, MODES } from '@/core/profile/schema';
import type { CommunityKind, Household, Mode, Place } from '@/core/types';
import { field } from '@/server/http';
import { placeFromInput, type GivenPlace, type PlaceMatch } from '@/server/geo/geocode';
import { AppError, userMessage } from '@/server/errors';
import { openDraft, sealDraft } from '@/server/seal';
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

/**
 * The place a family picked from a list: the sealed list we made and the position they chose, so
 * a client cannot name a place of its own. None when the form is not a pick.
 */
export function pickedPlace(form: FormData): Place | undefined {
  const draft = field(form, 'draft', 2000);
  if (draft === '') return undefined;
  const index = field(form, 'option', 2);
  const place = /^\d$/.test(index) ? openDraft(draft).options[Number(index)] : undefined;
  if (place === undefined) throw new AppError('token_invalid', 'no such place in the list');
  return place;
}

/**
 * Where a form says the family is: a pick from a list we sealed, else the typed place, else the
 * rounded device location. The household form, the front door and the change of place all read
 * the place this way, so each accepts the same answers and says the same thing about a problem.
 */
export async function placeOfForm(form: FormData): Promise<GivenPlace> {
  const picked = pickedPlace(form);
  if (picked !== undefined) return { kind: 'one', place: { ...picked, source: 'geocoder' } };
  return placeFromInput({
    typed: field(form, 'place', 80),
    lat: field(form, 'lat', 12),
    lon: field(form, 'lon', 12),
  });
}

/** Said when the place search is down: a listed city still works, because it needs no search. */
const PLACE_UNREACHABLE =
  'We could not look up that place just now. Try again in a minute, or type the nearest city.';

/** The line a family reads when the place they gave cannot be used, or none when it can. */
export function placeProblem(given: GivenPlace): string | undefined {
  switch (given.kind) {
    case 'none':
    case 'outside_india': {
      const message = userMessage(given.kind === 'none' ? 'geocode_none' : 'outside_india');
      return `${message.body} ${message.nextAction}`;
    }
    case 'unreachable':
      return PLACE_UNREACHABLE;
    case 'one':
    case 'many':
    case 'not_given':
      return undefined;
  }
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

/** A community kind from a query or a form, or the fallback when it is not one of the three. */
export function communityKindOf(value: string | undefined, fallback: CommunityKind): CommunityKind {
  return COMMUNITY_KINDS.find((k) => k === value) ?? fallback;
}

/** The household as a society, school or office sees it: same family, the audience chosen. */
export function withCommunityKind(household: Household, kind: CommunityKind): Household {
  return {
    ...household,
    community: { kind, outdoorSlots: household.community?.outdoorSlots ?? [] },
  };
}
