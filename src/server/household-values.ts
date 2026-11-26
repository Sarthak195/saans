// The reverse of the household form parser: a household turned back into form values, so the form
// can be shown filled in for editing. Server layer: pure data in, data out, nothing stored.
import 'server-only';

import type { Household, Place } from '@/core/types';
import { DEVICE_PLACE_NAME } from '@/server/geo/geocode';
import type { FormValues } from '@/server/household-form';

/**
 * The place fields that bring a place back on the household form: "name, state", which the
 * place search reads back to the same place, or, for a device location no listed place names,
 * its rounded coordinates, because "Your location" is not a name any search can find.
 */
export function valuesOfPlace(place: Place): FormValues {
  return place.name === DEVICE_PLACE_NAME
    ? { lat: String(place.lat), lon: String(place.lon) }
    : { place: `${place.name}, ${place.admin1}` };
}

/** The form values that describe a household, for editing one. Ids become m1.. and r1.. */
export function valuesOfHousehold(household: Household): FormValues {
  // Fields with a value on every household come first; the optional ones are added below.
  const v: FormValues = {
    ...valuesOfPlace(household.place),
    lang: household.lang,
    cooking: household.home.cooking,
    heating: household.home.heating,
  };
  // Adds a field only when it has a value, so an empty field stays out of the form values.
  const set = (key: string, value: string | number | undefined): void => {
    if (value !== undefined && value !== '') v[key] = String(value);
  };
  set('habits', household.home.habits.join(','));
  set('roomSqft', household.home.roomSqft);
  set('ceilingFt', household.home.ceilingFt);
  set('purifierCadrCfm', household.home.purifierCadrCfm);
  // Rows are numbered from 1 in the order the household lists them, as the form names them.
  household.members.forEach((m, i) => {
    set(`m${String(i + 1)}_label`, m.label);
    set(`m${String(i + 1)}_age`, m.ageBand);
    set(`m${String(i + 1)}_cond`, m.conditions.join(','));
  });
  household.routines.forEach((r, i) => {
    const p = `r${String(i + 1)}_`;
    // The routine's person is named by their new row id, so it matches the renumbered rows above.
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
