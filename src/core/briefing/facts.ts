// Turns a computed plan into the small, anonymous fact sheets the AI writer is given. Pure: it
// only reshapes data the plan already holds, so every number and time here is the plan's own.
import { BAND_LABEL } from '@/core/aqi';
import type { Band } from '@/core/aqi';
import { ACTIVITY_HI, BAND_HI, DECISION_HI, dayHindi } from '@/core/briefing/hindi';
import type {
  Alternative,
  CommunityPlan,
  HomeAdvice,
  Plan,
  RoutineAdvice,
  Window,
} from '@/core/plan/types';
import type { Sensitivity } from '@/core/types';

// What Gemini is shown. Members and routines are placeholders (member_1, routine_2): no names,
// no ages and no health conditions beyond the plan's own sensitivity word, so nothing about a
// family leaves the server except what the briefing needs.

// How many home actions and alternatives a briefing is given, so the text stays short.
const MAX_HOME = 3;
const MAX_ALTERNATIVES = 2;

// A stretch of the day as the model sees it: start and end times as text, PM2.5 in micrograms
// per cubic metre, and the level name in the briefing's language.
interface WindowFacts {
  from: string;
  to: string;
  pm25: number;
  level: string;
}

/** What the model is told about one routine: the plan's decision for it, with times and numbers. */
export interface RoutineFacts {
  /** The placeholder the model uses for this routine, such as routine_1. */
  ref: string;
  /** The placeholder of the member the routine belongs to, such as member_1. */
  member: string;
  activity: string;
  /** The decision as a code, or as a Hindi phrase when the briefing is in Hindi. */
  decision: string;
  /** The routine's start time as the plan shows it. */
  at: string;
  /** How long the routine lasts, in minutes. */
  minutes: number;
  /** False when the routine does not happen on the plan day's weekday. */
  onThisDay: boolean;
  /** Mean PM2.5 over the routine's hours, micrograms per cubic metre, rounded to the nearest 5. */
  pm25?: number;
  level?: string;
  /** A cleaner time for the routine, present only when the plan found one. */
  cleanerWindow?: WindowFacts;
  /** The plan's own sentences (reason, protection, effect); only sent when `prose` is on. */
  why?: string;
  protection?: string[];
  effect?: string;
  /** How much lower the planned exposure is than the usual one, in percent, when worked out. */
  percentLess?: number;
}

/** The facts for a household briefing: the day, the air, the members and each routine. */
export interface BriefingFacts {
  day: string;
  severe: boolean;
  /** The day's AQI (index points) and level name; null when the plan has no daily AQI. */
  aqi: { value: number; level: string } | null;
  cleanestWindow: WindowFacts | null;
  worstWindow: WindowFacts | null;
  topAction?: string;
  members: { ref: string; sensitivity: Sensitivity }[];
  routines: RoutineFacts[];
  /** Present only when the family asked a question; `routine` is the routine it was about. */
  question?: { answer?: string; routine?: string };
  home?: string[];
  alternatives?: string[];
}

/** The facts for a community notice (a society, school or office), always in English. */
export interface NoticeFacts {
  audience: CommunityPlan['kind'];
  day: string;
  severe: boolean;
  aqi: { value: number; level: string } | null;
  cleanestOutdoorWindow: WindowFacts | null;
  actions: string[];
  /** The plan's own sentence on the combined effect for the group; absent when it has none. */
  weeklyEffect?: string;
}

// Level names: English by default, CPCB's Hindi names for a Hindi briefing.
function labelOf(band: Band, hindi: boolean): string {
  return hindi ? BAND_HI[band] : BAND_LABEL[band];
}

// A plan window as window facts, or null when the plan has none.
function windowOf(w: Window | null, hindi = false): WindowFacts | null {
  return w === null
    ? null
    : { from: w.start, to: w.end, pm25: w.pm25, level: labelOf(w.level, hindi) };
}

// A level name, or undefined when the routine has no level.
function levelOf(band: Band | null, hindi: boolean): string | undefined {
  return band === null ? undefined : labelOf(band, hindi);
}

// The day's AQI and level name, or null when the air data is not enough for a daily AQI.
function aqiOf(plan: Plan, hindi = false): { value: number; level: string } | null {
  return plan.air.aqi.kind === 'ok'
    ? { value: plan.air.aqi.aqi, level: labelOf(plan.air.aqi.band, hindi) }
    : null;
}

// One routine's facts. Optional fields are left out, not set to undefined, when there is no value.
function routineFacts(r: RoutineAdvice, prose: boolean, hindi: boolean): RoutineFacts {
  const window = windowOf(r.window ?? null, hindi);
  const level = levelOf(r.level, hindi);
  return {
    ref: r.ref,
    member: r.memberRef,
    activity: hindi ? ACTIVITY_HI[r.kind] : r.kind.replace('_', ' '),
    decision: hindi ? DECISION_HI[r.decision] : r.decision,
    at: r.start,
    minutes: r.minutes,
    onThisDay: r.scheduled,
    ...(r.pm25 === null ? {} : { pm25: r.pm25 }),
    ...(level === undefined ? {} : { level }),
    ...(window === null ? {} : { cleanerWindow: window }),
    ...(prose ? { why: r.reason.text, protection: r.protection, effect: r.impact.text } : {}),
    ...(r.impact.percentLess === undefined ? {} : { percentLess: r.impact.percentLess }),
  };
}

/**
 * The facts for a briefing. With `prose` the plan's own English sentences go along, for the model
 * to put in its own words; without it only the structure goes (decisions, times, numbers), which
 * is what a Hindi briefing needs, because a model asked to translate prose tends to copy it. With
 * `hindi` the decisions, level names, activities and the day come as Hindi words from the code, so
 * the model has nothing in English to carry over.
 */
export function briefingFacts(
  input: { plan: Plan; home: HomeAdvice[]; alternatives: Alternative[] },
  prose = true,
  hindi = false,
): BriefingFacts {
  const { plan } = input;
  const answer = plan.answer;
  return {
    day: hindi ? dayHindi(plan.day) : plan.day.label,
    severe: plan.severe,
    aqi: aqiOf(plan, hindi),
    cleanestWindow: windowOf(plan.glance.best, hindi),
    worstWindow: windowOf(plan.glance.worst, hindi),
    ...(prose ? { topAction: plan.glance.topAction } : {}),
    members: plan.members.map((m) => ({ ref: m.memberRef, sensitivity: m.sensitivity })),
    routines: plan.routines.map((r) => routineFacts(r, prose, hindi)),
    // The question block exists only when the family asked something; its text goes with prose.
    ...(answer === undefined
      ? {}
      : {
          question: {
            ...(prose ? { answer: answer.text } : {}),
            ...(answer.routineRef === undefined ? {} : { routine: answer.routineRef }),
          },
        }),
    ...(prose
      ? {
          // The most urgent few, so the briefing stays short; each is a line the plan shows.
          home: [...input.home]
            .sort((a, b) => a.priority - b.priority)
            .slice(0, MAX_HOME)
            .map((h) => h.title),
          alternatives: input.alternatives.slice(0, MAX_ALTERNATIVES).map((a) => a.title),
        }
      : {}),
  };
}

/**
 * The facts for a community notice. Always English, and it carries the plan's own action titles,
 * so the model has only to word them as a short notice.
 */
export function noticeFacts(input: { plan: Plan; community: CommunityPlan }): NoticeFacts {
  const { plan, community } = input;
  return {
    audience: community.kind,
    day: plan.day.label,
    severe: plan.severe,
    aqi: aqiOf(plan),
    cleanestOutdoorWindow: windowOf(community.bestOutdoorWindow),
    actions: community.actions.map((a) => a.title),
    ...(community.aggregate === undefined ? {} : { weeklyEffect: community.aggregate.text }),
  };
}
