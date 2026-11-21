import { INDIA_LAT, INDIA_LON, MAX_TEXT } from '@/core/profile/schema';
import type { Place } from '@/core/types';
import { draftPath, pickedPlace, planPath, toPlace } from '@/server/edits';
import { userMessage } from '@/server/errors';
import { readHousehold } from '@/server/genai';
import { nearestStaticPlace, resolvePlace } from '@/server/geo/geocode';
import type { PlaceMatch } from '@/server/geo/geocode';
import { ASK_MAX_BYTES, field, handleForm, readGuardedForm, seeOther } from '@/server/http';
import { sealDraft, sealHousehold } from '@/server/seal';

const NO_TEXT = "Write a few lines about your family's day first, or use the form.";

function inIndia(lat: number, lon: number): boolean {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lon) &&
    lat >= INDIA_LAT.min &&
    lat <= INDIA_LAT.max &&
    lon >= INDIA_LON.min &&
    lon <= INDIA_LON.max
  );
}

type Located = { place: PlaceMatch } | { problem: string } | { choose: Place[] } | undefined;

/** The place the family gave, if any: a pick from a sealed list, typed text, or a rounded device location. */
async function placeFrom(form: FormData): Promise<Located> {
  const picked = pickedPlace(form);
  if (picked !== undefined) return { place: { ...picked, source: 'geocoder' } };

  const typed = field(form, 'place', 80);
  if (typed !== '') {
    const found = await resolvePlace(typed);
    if (found.kind === 'one') return { place: found.place };
    if (found.kind === 'many') return { choose: found.options.map(toPlace) };
    const message = userMessage('geocode_none');
    return { problem: `${message.body} ${message.nextAction}` };
  }

  const lat = Number(field(form, 'lat', 12));
  const lon = Number(field(form, 'lon', 12));
  if (field(form, 'lat', 12) === '' || field(form, 'lon', 12) === '') return undefined;
  if (!inIndia(lat, lon)) return { problem: 'Saans covers India. Type a place in India.' };
  const named = nearestStaticPlace(lat, lon);
  return {
    place: named ?? { name: 'Your location', admin1: 'India', lat, lon, source: 'geocoder' },
  };
}

/** Reads a family's own words into a plan, or sends them to the one thing still needed. */
export function POST(request: Request): Promise<Response> {
  return handleForm(async () => {
    const now = new Date();
    const form = await readGuardedForm(request, now, ASK_MAX_BYTES);
    const text = field(form, 'text', MAX_TEXT);
    const toForm = (reason: string): Response =>
      seeOther(draftPath('/household', { text, options: [], reason }));
    if (text === '') return toForm(NO_TEXT);

    const located = await placeFrom(form);
    if (located !== undefined && 'problem' in located) return toForm(located.problem);
    if (located !== undefined && 'choose' in located) {
      return seeOther(`/choose/${sealDraft({ text, options: located.choose })}`);
    }

    const result = await readHousehold({
      text,
      now,
      ...(located === undefined ? {} : { place: located.place }),
    });
    switch (result.kind) {
      case 'household': {
        const household =
          result.target === undefined
            ? result.household
            : { ...result.household, questionTarget: result.target };
        // The notes quote the family's own labels, so only a fixed key goes into the address.
        const query = result.notes.length === 0 ? {} : { note: 'filled' };
        const anchor = household.questionTarget === undefined ? 'plan-title' : 'answer';
        return seeOther(planPath(sealHousehold(household), { ...query, status: 'made' }, anchor));
      }
      case 'choose_place':
        return seeOther(
          `/choose/${sealDraft({ text: result.text, options: result.options.map(toPlace) })}`,
        );
      case 'form':
        return toForm(result.reason);
    }
  });
}
