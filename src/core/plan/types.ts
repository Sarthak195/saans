// The shapes of a Plan and the pieces it is made of: advice for each routine, the day at a
// glance, the air summary and the extra advice that sits beside it. Types only, so nothing
// here runs. Core layer.
import type { AirSeries, HourStamp, StationReading } from '@/core/air/types';
import type { AqiToday, Band } from '@/core/aqi';
import type { Decision } from '@/core/decision';
import type { SourceRef } from '@/core/source';
import type { PlanDay } from '@/core/time';
import type { CommunityKind, Mode, Place, RoutineKind, Sensitivity } from '@/core/types';

/** The part of the day a routine starts in. */
export type DaySlot = 'morning' | 'afternoon' | 'evening';

/** The rule that produced a piece of advice and where that rule comes from. */
export interface Reason {
  ruleId: string;
  text: string;
  source: SourceRef;
}

/**
 * What an Impact measures: a change of time, mode, intensity, indoors, a purifier, a distance or
 * nothing.
 */
export type ImpactKind =
  'timing' | 'mode' | 'intensity' | 'indoors' | 'purifier' | 'distance' | 'none';

/** The computed effect of following a piece of advice, with every number it shows listed in `numbers`. */
export interface Impact {
  kind: ImpactKind;
  text: string;
  numbers: number[];
  percentLess?: number;
  source?: SourceRef;
}

/** A span of the plan day in 'HH:MM' wall-clock times, with its mean hourly PM2.5. */
export interface Window {
  start: string;
  end: string;
  pm25: number;
  level: Band;
}

/** The plan's advice for one routine of one member on the plan day. */
export interface RoutineAdvice {
  /** Placeholder sent to Gemini instead of names, 'routine_1' and up in household order. */
  ref: string;
  /** The id of the routine in the household profile. */
  routineId: string;
  memberId: string;
  memberRef: string;
  memberLabel: string;
  kind: RoutineKind;
  mode?: Mode;
  slot: DaySlot;
  start: string;
  minutes: number;
  /** False when the routine does not happen on the plan day's weekday. */
  scheduled: boolean;
  /** Mean hourly PM2.5 over the routine's hours, rounded to the nearest 5 for display. */
  pm25: number | null;
  level: Band | null;
  decision: Decision;
  reason: Reason;
  /** The cleaner time offered, only when the decision is to move. */
  window?: Window;
  /** Protection lines for an essential trip. Empty for every other decision. */
  protection: string[];
  impact: Impact;
}

/** One member's exposure to PM2.5 over their outdoor routines, as usual and with the plan. */
export interface MemberSummary {
  memberId: string;
  memberRef: string;
  label: string;
  sensitivity: Sensitivity;
  /** Sum over outdoor routine hours of PM2.5 x hours, as usual and with this plan. */
  exposureUsual: number;
  exposurePlan: number;
  /** How much lower the planned exposure is than the usual one, in percent. */
  percentLess: number;
}

/**
 * Advice on airing the home: no special advice, the hour to open windows, or to keep them shut
 * with the least bad hour.
 */
export type Airing =
  | { kind: 'normal' }
  | { kind: 'window'; start: string; end: string; pm25: number }
  | { kind: 'keep_shut'; leastBadHour: string; pm25: number };

/** The day in one look: the best and worst spans, airing advice and the single top action. */
export interface Glance {
  best: Window | null;
  worst: Window | null;
  airing: Airing;
  topAction: string;
  /** A hard exercise or outdoor play routine goes ahead (kept, lightened or moved), so no line may say all of it stays indoors. */
  activeStays: boolean;
}

/** What a family's question points at, once read: a routine, a member, an hour, or today rather than the plan day. */
export interface QuestionTarget {
  routineId?: string;
  memberId?: string;
  hour?: number;
  aboutToday?: boolean;
}

/** The reply to a family's question, built from the plan's own numbers. */
export interface QuestionAnswer {
  text: string;
  routineRef?: string;
  /** The level of the day the sentence is about, which is a later day for a routine not on the plan day. */
  level: Band | null;
  numbers: number[];
  /** True when the question was about a time already past, so the answer is for the next day. */
  shiftedToNextDay: boolean;
}

/** The nearby monitor reads a worse level than the model for the same hour, so today's next few hours use the worse one. */
export interface StationPrecaution {
  stationLevel: Band;
  modelLevel: Band;
  /** The first and last hours covered, as hour stamps on the plan day. */
  fromHour: HourStamp;
  toHour: HourStamp;
}

/**
 * The air data behind a plan: today's AQI, where the data came from and the hourly strip, with the
 * nearby monitor shown beside it.
 */
export interface AirSummary {
  aqi: AqiToday;
  /** The last hour the AQI today covers. */
  dataHour: HourStamp;
  source: AirSeries['source'];
  /** Latitude and longitude of the model grid point the data is for, in degrees. */
  gridLat: number;
  gridLon: number;
  /** When the series was fetched. */
  fetchedAt: string;
  /** The day a recorded series was recorded. Absent for live data. */
  recordedOn?: string;
  /** The nearby monitor's latest reading, shown beside the model value and never part of the AQI. */
  station?: StationReading;
  precaution?: StationPrecaution;
  /** The plan day's hours from 06:00 to 22:00. */
  hourly: { hour: HourStamp; pm25: number | null; level: Band | null }[];
}

/**
 * The complete plan for one household on one plan day: what to do about each routine, the day at a
 * glance and the totals for each member.
 */
export interface Plan {
  place: Place;
  day: PlanDay;
  /** The days a plan can be read for. */
  days: PlanDay[];
  air: AirSummary;
  /** AQI today of 301 or more, or any plan-day block at Very Poor or worse. */
  severe: boolean;
  glance: Glance;
  routines: RoutineAdvice[];
  members: MemberSummary[];
  /** Present only when the family asked a question. */
  answer?: QuestionAnswer;
}

/** One piece of advice about the home, with its reason. */
export interface HomeAdvice {
  id: string;
  /** Lower comes first; life-safety items use 0. */
  priority: number;
  title: string;
  body: string;
  reason: Reason;
  impact?: Impact;
  /** True when the item corrects a common belief. */
  myth?: boolean;
  /** True for life-safety advice. */
  safety?: boolean;
}

/** An alternative offered for a routine, tied to it by routineRef, with its reason and effect. */
export interface Alternative {
  id: string;
  routineRef: string;
  title: string;
  body: string;
  reason: Reason;
  impact: Impact;
}

/** The GRAP stage listed for the day's AQI in Delhi NCR, with the source of that schedule. */
export interface GrapNote {
  stage: 1 | 2 | 3 | 4;
  text: string;
  source: SourceRef;
}

/** One action for a society, school or office, with its reason. */
export interface CommunityAction {
  id: string;
  title: string;
  body: string;
  reason: Reason;
}

/**
 * Actions for a community of one kind, with the best outdoor span of the day and the combined
 * effect when there is one.
 */
export interface CommunityPlan {
  kind: CommunityKind;
  actions: CommunityAction[];
  bestOutdoorWindow: Window | null;
  aggregate?: Impact;
}
