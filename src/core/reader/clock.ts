import { normalizeText } from '@/core/text';
import { extractNumbersWithSmallWords } from '@/core/text/numbers';
import type { Weekday } from '@/core/types';
import {
  DAY_GROUPS,
  EVENING_TERMS,
  MORNING_TERMS,
  WEEK_ORDER,
  WEEKDAY_NAMES,
  hasTerm,
  mentionsAny,
} from '@/core/reader/terms';

// valueSupportedByQuote reads "5 pm" as the number 5, which is not the time 17:00, so times,
// durations and days are read here, in code, from the words the family wrote.

// A hyphen or dash between words, built from code points so this file holds none itself.
const DASH_BETWEEN = new RegExp(
  String.raw`\s*[-${String.fromCodePoint(0x2013)}${String.fromCodePoint(0x2014)}]\s*`,
  'g',
);

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function clock(hour: number, minute: number): string {
  return `${pad(hour)}:${pad(minute)}`;
}

/** An 'H:MM' or 'HH:MM' string as 'HH:MM', or undefined when it is not a clock time. */
export function tidyClock(value: string): string | undefined {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return undefined;
  const [hour, minute] = [Number(match[1]), Number(match[2])];
  return hour <= 23 && minute <= 59 ? clock(hour, minute) : undefined;
}

// "5 pm", "5pm", "6:30 am", "17:00", "8:30", "5 baje"; the lookahead keeps "5 km" and "45 minutes" out.
const TIME =
  /(?<![\d:.])(\d{1,2})(?::([0-5]\d))?\s*(am|pm|baje|बजे)?(?![\d:]|\s*(?:km|min|minutes?|hours?|hrs?|years?|saal|sal|%|m\b))/gu;
const AT_BARE =
  /\b(?:at|around|by)\s+(\d{1,2})(?![\d:]|\s*(?:am|pm|baje|बजे|km|min|minutes?|hours?|years?|saal|%))/gu;

function hoursFor(hour: number, suffix: string | undefined, leadingZero: boolean): number[] {
  if (suffix === 'am') return hour > 12 ? [] : [hour % 12];
  if (suffix === 'pm') return hour > 12 ? [] : [hour === 12 ? 12 : hour + 12];
  if (hour > 23) return [];
  if (hour === 0 || hour >= 12 || leadingZero) return [hour];
  return [hour, hour + 12];
}

/** The day-part words in a text narrow an ambiguous hour: "6 baje, subah" is 06:00, not 18:00. */
function narrowByDayPart(hours: number[], text: string): number[] {
  if (hours.length < 2) return hours;
  const wantMorning = mentionsAny(text, MORNING_TERMS);
  const wantLater = mentionsAny(text, EVENING_TERMS);
  if (wantMorning === wantLater) return hours;
  const kept = hours.filter((h) => (wantMorning ? h < 12 : h >= 12));
  return kept.length > 0 ? kept : hours;
}

/**
 * Every clock time a quote can mean, in the order written. A time with am or pm has one reading;
 * a bare "8:30" or "9 baje" can be morning or evening unless the words around it say which.
 */
export function clockTimes(quote: string): string[] {
  const text = normalizeText(quote).replace(/\b([ap])\.m\.?/g, '$1m');
  const found: string[] = [];
  const add = (hour: number, minute: number, suffix: string | undefined, raw: string): void => {
    const leadingZero = raw.length === 2 && raw.startsWith('0');
    const hours = narrowByDayPart(hoursFor(hour, suffix, leadingZero), text);
    for (const h of hours) {
      const value = clock(h, minute);
      if (!found.includes(value)) found.push(value);
    }
  };
  for (const m of text.matchAll(TIME)) {
    const [, h = '', minutes, suffix] = m;
    // A bare number with no colon and no marker is a count, not a time.
    if (minutes === undefined && suffix === undefined) continue;
    add(Number(h), Number(minutes ?? 0), suffix, h);
  }
  for (const m of text.matchAll(AT_BARE)) {
    const [, h = ''] = m;
    add(Number(h), 0, undefined, h);
  }
  if (hasTerm(text, 'noon') && !found.includes('12:00')) found.push('12:00');
  return found;
}

/** A quote that is only an hour ("6"): the times it can mean, kept when the text itself gives that time. */
export function bareClockTimes(quote: string, text: string): string[] {
  const hour = /^\s*(\d{1,2})\s*$/.exec(quote)?.[1];
  if (hour === undefined) return [];
  const own = narrowByDayPart(hoursFor(Number(hour), undefined, false), normalizeText(text));
  const stated = clockTimes(text);
  return own.map((h) => clock(h, 0)).filter((t) => stated.includes(t));
}

/** A time of day named only by a part of the day: used, with a note, when no hour is given. */
export function dayPartClock(quote: string): string | undefined {
  const text = normalizeText(quote);
  if (mentionsAny(text, ['subah', 'morning', 'सुबह'])) return '07:00';
  if (mentionsAny(text, ['dopahar', 'afternoon', 'दोपहर'])) return '14:00';
  if (mentionsAny(text, ['shaam', 'sham', 'evening', 'शाम'])) return '17:00';
  if (mentionsAny(text, ['raat', 'night', 'रात'])) return '20:00';
  return undefined;
}

/** The hours (0 to 23) a quote's clock times can mean. */
export function hoursIn(quote: string): number[] {
  return [...new Set(clockTimes(quote).map((t) => Number(t.slice(0, 2))))];
}

const HOUR_WORDS = ['hour', 'hours', 'hr', 'hrs', 'ghanta', 'ghante', 'घंटा', 'घंटे'];
const MINUTE_WORDS = ['min', 'mins', 'minute', 'minutes', 'minat', 'मिनट'];

/** Durations in minutes a quote states: "45 minutes", "an hour", "1.5 hours", "half an hour". */
export function minutesIn(quote: string): number[] {
  const tokens = normalizeText(quote).split(' ');
  const found: number[] = [];
  tokens.forEach((token, i) => {
    const isHour = HOUR_WORDS.includes(token);
    if (!isHour && !MINUTE_WORDS.includes(token)) return;
    const prev = tokens[i - 1] ?? '';
    if (prev === 'half' || prev === 'aadha' || (prev === 'an' && tokens[i - 2] === 'half')) {
      found.push(30);
      return;
    }
    const amount = /^\d+(?:\.\d+)?$/.test(prev)
      ? Number(prev)
      : (extractNumbersWithSmallWords(prev)[0] ?? (prev === 'an' || prev === 'a' ? 1 : undefined));
    if (amount !== undefined) found.push(Math.round(amount * (isHour ? 60 : 1)));
  });
  return [...new Set(found)];
}

function daysBetween(from: Weekday, to: Weekday): Weekday[] {
  const start = WEEK_ORDER.indexOf(from);
  const out: Weekday[] = [];
  for (let step = 0; step < WEEK_ORDER.length; step += 1) {
    const day = WEEK_ORDER[(start + step) % WEEK_ORDER.length];
    if (day === undefined) break;
    out.push(day);
    if (day === to) break;
  }
  return out;
}

function dayOf(word: string): Weekday | undefined {
  return WEEK_ORDER.find((day) => WEEKDAY_NAMES[day].includes(word.replace(/s$/, '')));
}

/** The weekdays a quote names: "Mon to Fri", "weekdays", "every day", "Sat and Sun". Empty when none. */
export function daysIn(quote: string): Weekday[] {
  // A hyphen between two day names is a range ("Mon-Fri"), which normalising would turn into a list.
  const text = normalizeText(quote.replace(DASH_BETWEEN, ' to '));
  // The first group is "every day"; it only applies when nothing narrower is named.
  const [daily, ...narrower] = DAY_GROUPS;
  const group = narrower.find((g) => mentionsAny(text, g.terms));
  const names = text.split(' ').map(dayOf);
  const tokens = text.split(' ');
  const days = new Set<Weekday>(group?.days ?? []);
  names.forEach((day, i) => {
    if (day === undefined) return;
    const bridge = tokens[i + 1];
    const end =
      bridge !== undefined && ['to', 'se', 'till', 'through', 'tak'].includes(bridge)
        ? names[i + 2]
        : undefined;
    for (const d of end === undefined ? [day] : daysBetween(day, end)) days.add(d);
  });
  if (days.size === 0 && daily !== undefined && mentionsAny(text, daily.terms))
    return [...daily.days];
  return WEEK_ORDER.filter((day) => days.has(day));
}
