import 'server-only';

import type { Household } from '@/core/types';
import type { FormValues } from '@/server/household-form';

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
