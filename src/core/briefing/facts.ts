import { BAND_LABEL } from '@/core/aqi';
import type { Band } from '@/core/aqi';
import type { Decision } from '@/core/decision';
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

const MAX_HOME = 3;
const MAX_ALTERNATIVES = 2;

interface WindowFacts {
  from: string;
  to: string;
  pm25: number;
  level: string;
}

export interface RoutineFacts {
  ref: string;
  member: string;
  activity: string;
  decision: Decision;
  at: string;
  minutes: number;
  onThisDay: boolean;
  pm25?: number;
  level?: string;
  cleanerWindow?: WindowFacts;
  why?: string;
  protection?: string[];
  effect?: string;
  percentLess?: number;
}

export interface BriefingFacts {
  day: string;
  severe: boolean;
  aqi: { value: number; level: string } | null;
  cleanestWindow: WindowFacts | null;
  worstWindow: WindowFacts | null;
  topAction?: string;
  members: { ref: string; sensitivity: Sensitivity }[];
  routines: RoutineFacts[];
  question?: { answer?: string; routine?: string };
  home?: string[];
  alternatives?: string[];
}

export interface NoticeFacts {
  audience: CommunityPlan['kind'];
  day: string;
  severe: boolean;
  aqi: { value: number; level: string } | null;
  cleanestOutdoorWindow: WindowFacts | null;
  actions: string[];
  weeklyEffect?: string;
}

function windowOf(w: Window | null): WindowFacts | null {
  return w === null ? null : { from: w.start, to: w.end, pm25: w.pm25, level: BAND_LABEL[w.level] };
}

function levelOf(band: Band | null): string | undefined {
  return band === null ? undefined : BAND_LABEL[band];
}

function aqiOf(plan: Plan): { value: number; level: string } | null {
  return plan.air.aqi.kind === 'ok'
    ? { value: plan.air.aqi.aqi, level: BAND_LABEL[plan.air.aqi.band] }
    : null;
}

function routineFacts(r: RoutineAdvice, prose: boolean): RoutineFacts {
  const window = windowOf(r.window ?? null);
  const level = levelOf(r.level);
  return {
    ref: r.ref,
    member: r.memberRef,
    activity: r.kind.replace('_', ' '),
    decision: r.decision,
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
 * is what a Hindi briefing needs, because a model asked to translate prose tends to copy it.
 */
export function briefingFacts(
  input: { plan: Plan; home: HomeAdvice[]; alternatives: Alternative[] },
  prose = true,
): BriefingFacts {
  const { plan } = input;
  const answer = plan.answer;
  return {
    day: plan.day.label,
    severe: plan.severe,
    aqi: aqiOf(plan),
    cleanestWindow: windowOf(plan.glance.best),
    worstWindow: windowOf(plan.glance.worst),
    ...(prose ? { topAction: plan.glance.topAction } : {}),
    members: plan.members.map((m) => ({ ref: m.memberRef, sensitivity: m.sensitivity })),
    routines: plan.routines.map((r) => routineFacts(r, prose)),
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
