// Turns a household and a plan day into the facts the home advice rows test. Core layer, pure:
// the date comes from the plan, so no clock is read here.
import type { FactValue } from '@/core/rules/evaluate';
import { planLevel } from '@/core/advice/level';
import type { PlanLevel } from '@/core/advice/level';
import { INDOOR } from '@/core/home/data';
import { checkPurifier } from '@/core/home/purifier';
import type { PurifierFit } from '@/core/home/purifier';
import type { Plan } from '@/core/plan/types';
import type { Cooking, Heating, Household } from '@/core/types';

/**
 * What the home rules can test. `level` is the worst 3-hour block of the plan day (the AQI band
 * stands in when the day has no block, and 'unknown' when there is neither).
 */
export interface HomeFacts extends Record<string, FactValue> {
  level: PlanLevel;
  airing: Plan['glance']['airing']['kind'];
  cooking: Cooking;
  heating: Heating;
  incense: boolean;
  mosquitoCoil: boolean;
  smoking: boolean;
  candles: boolean;
  hasPurifier: boolean;
  roomKnown: boolean;
  purifierFit: PurifierFit;
  festivalSeason: boolean;
}

/** Diwali falls in October or November, so the whole of both months counts as festival season. */
function inFestivalSeason(date: string): boolean {
  // The plan day is 'YYYY-MM-DD', so characters 5 and 6 are the month number.
  return INDOOR.assumptions.festivalMonths.value.includes(Number(date.slice(5, 7)));
}

/** The facts about this household and plan day that the home rows can test. */
export function homeFacts(household: Household, plan: Plan): HomeFacts {
  const { home } = household;
  // Habits become one flag each, and the purifier fit comes from checking the room and the unit.
  return {
    level: planLevel(plan),
    airing: plan.glance.airing.kind,
    cooking: home.cooking,
    heating: home.heating,
    incense: home.habits.includes('incense'),
    mosquitoCoil: home.habits.includes('mosquito_coil'),
    smoking: home.habits.includes('smoking'),
    candles: home.habits.includes('candles'),
    hasPurifier: home.purifierCadrCfm !== undefined,
    roomKnown: home.roomSqft !== undefined,
    purifierFit: checkPurifier(home).fit,
    festivalSeason: inFestivalSeason(plan.day.date),
  };
}
