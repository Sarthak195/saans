import 'server-only';

import type { AirSeries } from '@/core/air/types';
import { buildAlternatives, grapNote, transitOptionsFor } from '@/core/alternatives';
import type { TransitOption } from '@/core/alternatives';
import { buildCommunity } from '@/core/community';
import { buildHomeAdvice } from '@/core/home';
import { buildPlan } from '@/core/plan/build-plan';
import { planFacts } from '@/core/plan/facts';
import type {
  Alternative,
  CommunityPlan,
  GrapNote,
  HomeAdvice,
  Plan,
  QuestionTarget,
} from '@/core/plan/types';
import { defaultPlanDay, istParts, planDays } from '@/core/time';
import type { PlanDay } from '@/core/time';
import type { Household } from '@/core/types';
import { getAirSeries } from '@/server/air/get-air';
import { fetchRecordedSeries } from '@/server/air/recorded';
import { SMOG_DAY_ID } from '@/server/air/recorded-targets';
import { AppError } from '@/server/errors';
import type { AppErrorKind } from '@/server/errors';

export type AirMode = 'live' | 'smog-day';

export interface PlanView {
  household: Household;
  plan: Plan;
  home: HomeAdvice[];
  alternatives: Alternative[];
  /** Operators with a web page, for the place the alternatives name. */
  transit: TransitOption[];
  grap: GrapNote | null;
  community?: CommunityPlan;
  /** Every number the page shows, for checking written text against. */
  facts: number[];
  mode: AirMode;
  /** Why there is no air data, when the plan was built without any. */
  unavailable?: AppErrorKind;
}

export interface PlanViewInput {
  household: Household;
  now: Date;
  day?: PlanDay['relative'] | undefined;
  air?: AirMode | undefined;
  /** Build the community view even when the household has none of its own. */
  withCommunity?: boolean | undefined;
}

// The recorded smog day is a Delhi day, so the household is planned as if in Delhi on it.
const DELHI = { name: 'Delhi', admin1: 'Delhi', lat: 28.6, lon: 77.2 } as const;

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/**
 * A recording is read on its own date. Keeping the real time of day means "this evening" still
 * means the evening of the recorded day, and no hour already gone is offered as a window.
 */
export function anchoredTo(now: Date, recordedOn: string): Date {
  const parts = istParts(now);
  return new Date(`${recordedOn}T${pad(parts.hour)}:${pad(parts.minute)}:00+05:30`);
}

/**
 * The air data for the household's place. When it cannot be had, the plan is still built, from an
 * empty series, so the home advice and the alternatives (which need no readings) still show.
 */
async function seriesFor(
  household: Household,
  air: AirMode,
  now: Date,
  planDay: PlanDay['relative'] | undefined,
): Promise<{ series: AirSeries; unavailable?: AppErrorKind }> {
  if (air === 'smog-day') return { series: await fetchRecordedSeries(SMOG_DAY_ID) };
  try {
    // A nearby monitor only changes today's advice, so no other day asks for one.
    const today =
      (planDays(now).find((d) => d.relative === planDay) ?? defaultPlanDay(now)).relative ===
      'today';
    return {
      series: await getAirSeries(household.place.lat, household.place.lon, { station: today }),
    };
  } catch (error) {
    if (!(error instanceof AppError) || error.kind === 'outside_india') throw error;
    const series: AirSeries = {
      source: 'open-meteo-cams',
      gridLat: household.place.lat,
      gridLon: household.place.lon,
      hours: [],
      fetchedAt: now.toISOString(),
    };
    return { series, unavailable: error.kind };
  }
}

/** The schema allows an explicit undefined that the plan's own type does not, so the keys are copied when set. */
function targetOf(target: Household['questionTarget']): QuestionTarget | undefined {
  if (target === undefined) return undefined;
  return {
    ...(target.routineId === undefined ? {} : { routineId: target.routineId }),
    ...(target.memberId === undefined ? {} : { memberId: target.memberId }),
    ...(target.hour === undefined ? {} : { hour: target.hour }),
    ...(target.aboutToday === undefined ? {} : { aboutToday: target.aboutToday }),
  };
}

/** Everything a plan page shows, built from the air data and the household in one place. */
export async function loadPlanView(input: PlanViewInput): Promise<PlanView> {
  const mode = input.air ?? 'live';
  const household: Household =
    mode === 'smog-day' ? { ...input.household, place: { ...DELHI } } : input.household;
  const { series, unavailable } = await seriesFor(household, mode, input.now, input.day);

  const now =
    series.source === 'recorded' && series.recordedOn !== undefined
      ? anchoredTo(input.now, series.recordedOn)
      : input.now;
  // The recording has one day of its own, so it is always read as "today".
  const day = mode === 'smog-day' ? 'today' : input.day;

  const plan = buildPlan({
    household,
    series,
    now,
    day,
    question: targetOf(household.questionTarget),
  });
  const home = buildHomeAdvice({ household, plan });
  const alternatives = buildAlternatives({ household, plan });
  const grap = grapNote(plan.place, plan.air.aqi);
  const community =
    household.community !== undefined || input.withCommunity === true
      ? buildCommunity({ household, plan })
      : undefined;

  return {
    household,
    plan,
    home,
    alternatives,
    transit: transitOptionsFor(plan.place).options.filter((o) => o.url !== ''),
    grap,
    ...(community === undefined ? {} : { community }),
    facts: planFacts(plan, { home, alternatives, community, grap }),
    mode,
    ...(unavailable === undefined ? {} : { unavailable }),
  };
}
