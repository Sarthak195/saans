import type { Band } from '@/core/aqi';
import type { Decision } from '@/core/decision';
import type { PlanDay } from '@/core/time';
import type { RoutineKind } from '@/core/types';

// The Hindi words a Hindi briefing is built from. The model is handed these instead of English
// codes, because a model asked to translate a code tends to copy it. Band names are CPCB's own
// Hindi category names. Plain constants: nothing here is a number or a decision of its own.

export const DECISION_HI: Record<Decision, string> = {
  keep: 'जैसा तय है वैसा करें',
  lighten: 'छोटा और हल्का करें',
  move: 'साफ़ हवा वाले समय पर करें',
  indoors: 'घर के अंदर करें',
  essential: 'सिर्फ़ ज़रूरी हो तो, बचाव के साथ जाएँ',
};

export const BAND_HI: Record<Band, string> = {
  good: 'अच्छा',
  satisfactory: 'संतोषजनक',
  moderate: 'मध्यम प्रदूषित',
  poor: 'ख़राब',
  very_poor: 'बहुत ख़राब',
  severe: 'गंभीर',
};

export const ACTIVITY_HI: Record<RoutineKind, string> = {
  school_run: 'स्कूल छोड़ना',
  outdoor_play: 'बाहर खेलना',
  sport: 'खेल',
  walk: 'सैर',
  commute: 'आना-जाना',
  errand: 'बाहर का काम',
};

const WEEKDAY_HI: Record<PlanDay['weekday'], string> = {
  mon: 'सोमवार',
  tue: 'मंगलवार',
  wed: 'बुधवार',
  thu: 'गुरुवार',
  fri: 'शुक्रवार',
  sat: 'शनिवार',
  sun: 'रविवार',
};

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

/** "बुधवार, 25 नवंबर" for the day 2026-11-25, with the date in ASCII digits. */
export function dayHindi(day: PlanDay): string {
  const month = MONTH_HI[Number(day.date.slice(5, 7)) - 1] ?? '';
  return `${WEEKDAY_HI[day.weekday]}, ${String(Number(day.date.slice(8, 10)))} ${month}`;
}
