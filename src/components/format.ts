// Wording for the codes the plan uses, and small text formatters for the page components. Written
// for a parent, not for a developer. UI layer: pure string work, no clock and no environment.
import type { Band } from '@/core/aqi';
import type { Decision } from '@/core/decision';
import type { DaySlot } from '@/core/plan/types';
import type { Mode, RoutineKind, Weekday } from '@/core/types';

/** The words for each decision on a routine, shown beside its drawing. */
export const DECISION_WORD: Record<Decision, string> = {
  keep: 'Keep it',
  lighten: 'Lighten it',
  move: 'Move it',
  indoors: 'Do it indoors',
  essential: 'Go, with protection',
};

/** The part-of-day names for the morning, afternoon and evening slots. */
export const SLOT_LABEL: Record<DaySlot, string> = {
  morning: 'Morning',
  afternoon: 'Afternoon',
  evening: 'Evening',
};

/** What a family reads for each kind of routine, such as 'School run'. Also the form's choices. */
export const KIND_LABEL: Record<RoutineKind, string> = {
  school_run: 'School run',
  outdoor_play: 'Outdoor play',
  sport: 'Sport',
  walk: 'Walk',
  commute: 'Commute',
  errand: 'Errand',
};

/** What a family reads for each way of travelling. Also the form's travel choices. */
export const MODE_LABEL: Record<Mode, string> = {
  walk: 'Walk',
  cycle: 'Cycle',
  two_wheeler: 'Two-wheeler',
  auto: 'Auto',
  car: 'Car',
  bus: 'Bus',
  metro_rail: 'Metro or train',
};

/** Full weekday names, keyed by the short code the household stores. */
export const WEEKDAY_LONG: Record<Weekday, string> = {
  mon: 'Monday',
  tue: 'Tuesday',
  wed: 'Wednesday',
  thu: 'Thursday',
  fri: 'Friday',
  sat: 'Saturday',
  sun: 'Sunday',
};

// Short English month names, indexed from 0 for January.
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** The CSS class suffix of a band: 'very_poor' becomes 'very-poor'. */
export function bandClass(band: Band): string {
  return band.replace('_', '-');
}

/** 'HH:MM' from a stamp such as '2026-11-24T21:00' or '2026-11-24T21:07:12+05:30'. */
export function clockOf(stamp: string): string {
  // Characters 11 to 15 (counting from 0) are the 'HH:MM' part of the stamp.
  return stamp.slice(11, 16);
}

/** '2026-11-21' as '21 Nov 2026'. */
export function dateLabel(date: string): string {
  const [y, m, d] = date.split('-');
  const month = MONTHS[Number(m) - 1] ?? '';
  return `${String(Number(d))} ${month} ${y ?? ''}`.trim();
}

/** A number rounded to a whole number and written as text, such as 12.6 as '13'. */
export function whole(value: number): string {
  return String(Math.round(value));
}

/** One decimal for a map coordinate: 28.6 stays 28.6 and 13 becomes 13.0. */
export function coordinate(value: number): string {
  return value.toFixed(1);
}
