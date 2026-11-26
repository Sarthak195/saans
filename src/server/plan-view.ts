// Builds everything a plan page shows from a household and the air data: the plan, home advice,
// alternatives, community view and the numbers a written text may use. Server layer: it fetches
// the air series, then hands it to the pure core. It holds no state between requests.
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
import { istParts } from '@/core/time';
import type { PlanDay } from '@/core/time';
import type { Household } from '@/core/types';
import { getAirSeries } from '@/server/air/get-air';
import { fetchRecordedSeries } from '@/server/air/recorded';
import { SMOG_DAY_ID } from '@/server/air/recorded-targets';
import { AppError } from '@/server/errors';
import type { AppErrorKind } from '@/server/errors';

/** Which air data a plan uses: the live forecast, or the one recorded smog day for comparison. */
export type AirMode = 'live' | 'smog-day';

/** The finished result for one page view: the plan and everything shown beside it. */
export interface PlanView {
  /** The household as planned (placed in Delhi in smog-day mode). */
  household: Household;
  /** The plan, built in code from the air data. */
  plan: Plan;
  /** Advice about the home, each item with its reason. */
  home: HomeAdvice[];
  /** Alternatives offered for the plan's routines, each tied to one routine. */
  alternatives: Alternative[];
  /** Operators with a web page, for the place the alternatives name. */
  transit: TransitOption[];
  /** The GRAP stage listed for the day's AQI, for places in Delhi NCR only. Null elsewhere. */
  grap: GrapNote | null;
  /** The society, school or office view. Present only when asked for or the household has one. */
  community?: CommunityPlan;
  /** Every number the page shows, for checking written text against. */
  facts: number[];
  /** Whether the air data was live or the recorded smog day. */
  mode: AirMode;
  /** Why there is no air data, when the plan was built without any. */
  unavailable?: AppErrorKind;
}

/** What loadPlanView needs: the household, the current time, and optional day and air. */
export interface PlanViewInput {
  household: Household;
  /** The current time, passed in so nothing here reads the clock. */
  now: Date;
  /** Which day to plan: today, tomorrow or the day after. The plan's default day when left out. */
  day?: PlanDay['relative'] | undefined;
  /** Live air when left out. */
  air?: AirMode | undefined;
  /** Build the community view even when the household has none of its own. */
  withCommunity?: boolean | undefined;
}

// The recorded smog day is a Delhi day, so the household is planned as if in Delhi on it.
const DELHI = { name: 'Delhi', admin1: 'Delhi', lat: 28.6, lon: 77.2 } as const;

/** A whole number as two digits, for building a clock time such as 07:05. */
function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/**
 * A recording is read on its own date. Keeping the real time of day means "this evening" still
 * means the evening of the recorded day, and no hour already gone is offered as a window.
 * The date is the recording's date (YYYY-MM-DD); the time of day is the IST time of `now`.
 */
export function anchoredTo(now: Date, recordedOn: string): Date {
  const parts = istParts(now);
  // +05:30 is the IST offset, so the result is that IST date and time as one moment.
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
): Promise<{ series: AirSeries; unavailable?: AppErrorKind }> {
  // The smog day is read from the saved recording, with no network call.
  if (air === 'smog-day') return { series: await fetchRecordedSeries(SMOG_DAY_ID) };
  try {
    // A nearby monitor describes the air now, so every plan day shows it; only today's advice
    // uses it.
    return {
      series: await getAirSeries(household.place.lat, household.place.lon, { station: true }),
    };
  } catch (error) {
    // A bug, or a place outside India, is not hidden behind an empty plan.
    if (!(error instanceof AppError) || error.kind === 'outside_india') throw error;
    // An empty series with no hours, so the plan builds with no air readings. The reason is
    // returned beside it for the page to explain.
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

/**
 * The schema allows an explicit undefined that the plan's own type does not, so the keys are
 * copied when set.
 */
function targetOf(target: Household['questionTarget']): QuestionTarget | undefined {
  if (target === undefined) return undefined;
  return {
    ...(target.routineId === undefined ? {} : { routineId: target.routineId }),
    ...(target.memberId === undefined ? {} : { memberId: target.memberId }),
    ...(target.hour === undefined ? {} : { hour: target.hour }),
    ...(target.aboutToday === undefined ? {} : { aboutToday: target.aboutToday }),
  };
}

/**
 * Everything a plan page shows, built from the air data and the household in one place. Fetches
 * air data (or reads the recording), so it can throw an AppError, but an air data failure other
 * than a place outside India gives a plan with `unavailable` set instead.
 */
export async function loadPlanView(input: PlanViewInput): Promise<PlanView> {
  const mode = input.air ?? 'live';
  // The recorded smog day is a Delhi day, so the household is moved to Delhi for it.
  const household: Household =
    mode === 'smog-day' ? { ...input.household, place: { ...DELHI } } : input.household;
  const { series, unavailable } = await seriesFor(household, mode, input.now);

  // A recording is read on its own date; live air uses the real time.
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
  // Home advice, alternatives and the GRAP note all follow from the plan just built.
  const home = buildHomeAdvice({ household, plan });
  const alternatives = buildAlternatives({ household, plan });
  const grap = grapNote(plan.place, plan.air.aqi);
  // The community view is built only for a household that has one, or when the caller asks.
  const community =
    household.community !== undefined || input.withCommunity === true
      ? buildCommunity({ household, plan })
      : undefined;

  // Optional keys are added only when set, so an absent value is never an explicit undefined.
  // Transit keeps only operators that have a web page. `facts` is every number the page shows.
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
