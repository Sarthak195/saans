import type { AirSeries, HourStamp, StationReading } from '@/core/air/types';
import type { AqiToday, Band } from '@/core/aqi';
import type { Decision } from '@/core/decision';
import type { SourceRef } from '@/core/source';
import type { PlanDay } from '@/core/time';
import type { CommunityKind, Mode, Place, RoutineKind, Sensitivity } from '@/core/types';

export type DaySlot = 'morning' | 'afternoon' | 'evening';

/** The rule that produced a piece of advice and where that rule comes from. */
export interface Reason {
  ruleId: string;
  text: string;
  source: SourceRef;
}

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

export interface RoutineAdvice {
  /** Placeholder sent to Gemini instead of names, 'routine_1' and up in household order. */
  ref: string;
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
  window?: Window;
  protection: string[];
  impact: Impact;
}

export interface MemberSummary {
  memberId: string;
  memberRef: string;
  label: string;
  sensitivity: Sensitivity;
  /** Sum over outdoor routine hours of PM2.5 x hours, as usual and with this plan. */
  exposureUsual: number;
  exposurePlan: number;
  percentLess: number;
}

export type Airing =
  | { kind: 'normal' }
  | { kind: 'window'; start: string; end: string; pm25: number }
  | { kind: 'keep_shut'; leastBadHour: string; pm25: number };

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

export interface AirSummary {
  aqi: AqiToday;
  dataHour: HourStamp;
  source: AirSeries['source'];
  gridLat: number;
  gridLon: number;
  fetchedAt: string;
  recordedOn?: string;
  /** The nearby monitor's latest reading, shown beside the model value and never part of the AQI. */
  station?: StationReading;
  precaution?: StationPrecaution;
  /** The plan day's hours from 06:00 to 22:00. */
  hourly: { hour: HourStamp; pm25: number | null; level: Band | null }[];
}

export interface Plan {
  place: Place;
  day: PlanDay;
  days: PlanDay[];
  air: AirSummary;
  /** AQI today of 301 or more, or any plan-day block at Very Poor or worse. */
  severe: boolean;
  glance: Glance;
  routines: RoutineAdvice[];
  members: MemberSummary[];
  answer?: QuestionAnswer;
}

export interface HomeAdvice {
  id: string;
  /** Lower comes first; life-safety items use 0. */
  priority: number;
  title: string;
  body: string;
  reason: Reason;
  impact?: Impact;
  myth?: boolean;
  safety?: boolean;
}

export interface Alternative {
  id: string;
  routineRef: string;
  title: string;
  body: string;
  reason: Reason;
  impact: Impact;
}

export interface GrapNote {
  stage: 1 | 2 | 3 | 4;
  text: string;
  source: SourceRef;
}

export interface CommunityAction {
  id: string;
  title: string;
  body: string;
  reason: Reason;
}

export interface CommunityPlan {
  kind: CommunityKind;
  actions: CommunityAction[];
  bestOutdoorWindow: Window | null;
  aggregate?: Impact;
}
