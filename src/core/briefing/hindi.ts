// Hindi wording for the Hindi briefing: decisions, level names, activities and the day. Pure data
// and one small function; the plan decides, this file only names.
import type { Band } from '@/core/aqi';
import type { Decision } from '@/core/decision';
import type { PlanDay } from '@/core/time';
import type { RoutineKind } from '@/core/types';

// The Hindi words a Hindi briefing is built from. The model is handed these instead of English
// codes, because a model asked to translate a code tends to copy it. Band names are CPCB's own
// Hindi category names. Plain constants: nothing here is a number or a decision of its own.

/** What each routine decision says in Hindi, as a short phrase for the model to build on. */
export const DECISION_HI: Record<Decision, string> = {
  keep: 'जैसा तय है वैसा करें',
  lighten: 'छोटा और हल्का करें',
  move: 'साफ़ हवा वाले समय पर करें',
  indoors: 'घर के अंदर करें',
  essential: 'सिर्फ़ ज़रूरी हो तो, बचाव के साथ जाएँ',
};

/** The Hindi name of each AQI level, using CPCB's own category names. */
export const BAND_HI: Record<Band, string> = {
  good: 'अच्छा',
  satisfactory: 'संतोषजनक',
  moderate: 'मध्यम प्रदूषित',
  poor: 'ख़राब',
  very_poor: 'बहुत ख़राब',
  severe: 'गंभीर',
};

/** What each kind of routine is called in Hindi, such as the school run or a walk. */
export const ACTIVITY_HI: Record<RoutineKind, string> = {
  school_run: 'स्कूल छोड़ना',
  outdoor_play: 'बाहर खेलना',
  sport: 'खेल',
  walk: 'सैर',
  commute: 'आना-जाना',
  errand: 'बाहर का काम',
};

// Weekday names in Hindi, keyed by the plan day's weekday code.
const WEEKDAY_HI: Record<PlanDay['weekday'], string> = {
  mon: 'सोमवार',
  tue: 'मंगलवार',
  wed: 'बुधवार',
  thu: 'गुरुवार',
  fri: 'शुक्रवार',
  sat: 'शनिवार',
  sun: 'रविवार',
};

// Month names in Hindi, January first, so the list is indexed by month number minus one.
const MONTH_HI = [
  'जनवरी',
  'फ़रवरी',
  'मार्च',
  'अप्रैल',
  'मई',
  'जून',
  'जुलाई',
  'अगस्त',
  'सितंबर',
  'अक्तूबर',
  'नवंबर',
  'दिसंबर',
];

/**
 * The plan day written in Hindi, such as "बुधवार, 25 नवंबर" for 2026-11-25, with the date in ASCII
 * digits and no leading zero. A month outside 1 to 12 leaves the month word empty.
 */
export function dayHindi(day: PlanDay): string {
  // The date is "YYYY-MM-DD": counting from 0, positions 5 and 6 are the month, 8 and 9 the day.
  const month = MONTH_HI[Number(day.date.slice(5, 7)) - 1] ?? '';
  return `${WEEKDAY_HI[day.weekday]}, ${String(Number(day.date.slice(8, 10)))} ${month}`;
}
