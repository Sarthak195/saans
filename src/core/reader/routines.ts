import { WEEKDAYS } from '@/core/profile/schema';
import { clockTimes, dayPartClock, daysIn, minutesIn, tidyClock } from '@/core/reader/clock';
import type { ReadMembers } from '@/core/reader/members';
import type { Quoted, ReaderOutput } from '@/core/reader/schema';
import {
  INTENSITY_TERMS,
  SPEAKER_TERMS,
  firstTerm,
  hasTerm,
  mentionsAny,
} from '@/core/reader/terms';
import { normalizeText, quoteInText, valueSupportedByQuote } from '@/core/text';
import { LEXICON_ENTRIES, termsForValue } from '@/core/text/lexicon';
import type { Intensity, Mode, Routine, RoutineKind, Weekday } from '@/core/types';

const DEFAULT_MINUTES = 60;
const DEFAULT_INTENSITY: Record<RoutineKind, Intensity> = {
  school_run: 'light',
  outdoor_play: 'moderate',
  sport: 'vigorous',
  walk: 'light',
  commute: 'light',
  errand: 'light',
};
// A trip to somewhere has no fixed time slack; other routines can move a little either side.
const FLEX_HOURS: Record<RoutineKind, number> = {
  school_run: 0,
  outdoor_play: 2,
  sport: 2,
  walk: 2,
  commute: 0,
  errand: 2,
};
const MAX_KM = 200;
const KM_WORDS = ['km', 'kms', 'kilometre', 'kilometer', 'kilometres', 'kilometers', 'किमी'];
const INTENSITY_ORDER: readonly Intensity[] = ['vigorous', 'moderate', 'light'];

type RoutineDraft = ReaderOutput['routines'][number];

function inText(text: string, q: Quoted<unknown> | undefined): boolean {
  return q !== undefined && quoteInText(text, q.quote);
}

/** All the words the model quoted for one routine, so a value can be found in any of them. */
function quotesOf(draft: RoutineDraft): string[] {
  return [
    draft.kind.quote,
    draft.start?.quote,
    draft.minutes?.quote,
    draft.intensity?.quote,
    draft.mode?.quote,
    draft.km?.quote,
    draft.days?.quote,
  ].filter((q): q is string => q !== undefined);
}

function kindFromLexicon(quote: string): RoutineKind | undefined {
  return LEXICON_ENTRIES.find(
    (e) => e.category === 'routine' && mentionsAny(quote, termsForValue(e.value)),
  )?.value as RoutineKind | undefined;
}

/** The activity as the family would name it, for the notes: "cricket", not "outdoor_play". */
function nameOf(kind: RoutineKind, quote: string): string {
  return firstTerm(quote, termsForValue(kind)) ?? kind.replace('_', ' ');
}

function modeOf(text: string, draft: RoutineDraft): Mode | undefined {
  const mode = draft.mode;
  return mode && inText(text, mode) && valueSupportedByQuote(mode.value, mode.quote)
    ? mode.value
    : undefined;
}

function startOf(
  text: string,
  draft: RoutineDraft,
  quotes: string[],
): { start: string; assumed: boolean } | undefined {
  const claimed = draft.start ? tidyClock(draft.start.value) : undefined;
  const times = quotes.filter((q) => quoteInText(text, q)).flatMap(clockTimes);
  if (claimed !== undefined && times.includes(claimed)) return { start: claimed, assumed: false };
  const first = times[0];
  if (first !== undefined) return { start: first, assumed: false };
  const part = quotes.map(dayPartClock).find((t) => t !== undefined);
  return part === undefined ? undefined : { start: part, assumed: true };
}

function minutesOf(text: string, draft: RoutineDraft, quotes: string[]): number | undefined {
  const heard = quotes.filter((q) => quoteInText(text, q)).flatMap(minutesIn);
  const claimed = draft.minutes?.value;
  const pick = claimed !== undefined && heard.includes(claimed) ? claimed : heard[0];
  return pick !== undefined && pick >= 1 && pick <= 480 ? pick : undefined;
}

function kmOf(text: string, draft: RoutineDraft): number | undefined {
  const km = draft.km;
  if (!km || !inText(text, km) || !mentionsAny(km.quote, KM_WORDS)) return undefined;
  const ok = valueSupportedByQuote(km.value, km.quote) && km.value > 0 && km.value <= MAX_KM;
  return ok ? km.value : undefined;
}

function intensityOf(text: string, draft: RoutineDraft, quotes: string[]): Intensity | undefined {
  const heard = quotes.filter((q) => quoteInText(text, q)).join(' ');
  const claimed = draft.intensity;
  if (
    claimed &&
    mentionsAny(claimed.quote, INTENSITY_TERMS[claimed.value]) &&
    inText(text, claimed)
  ) {
    return claimed.value;
  }
  return INTENSITY_ORDER.find((level) => mentionsAny(heard, INTENSITY_TERMS[level]));
}

function daysOf(text: string, draft: RoutineDraft, quotes: string[]): Weekday[] | undefined {
  const named = draft.days;
  const heard = named && inText(text, named) ? daysIn(named.quote) : [];
  const derived =
    heard.length > 0 ? heard : quotes.filter((q) => quoteInText(text, q)).flatMap(daysIn);
  const unique = WEEKDAYS.filter((d) => derived.includes(d));
  return unique.length > 0 ? unique : undefined;
}

function ownerOf(text: string, who: Quoted<string>, members: ReadMembers): string | undefined {
  if (inText(text, who)) {
    const me = members.names.get('me');
    if (me !== undefined && mentionsAny(who.quote, SPEAKER_TERMS)) return me;
    for (const [name, id] of members.names) {
      if (hasTerm(who.quote, name) || hasTerm(who.value, name) || normalizeText(who.value) === name)
        return id;
    }
  }
  return members.members.length === 1 ? members.members[0]?.id : undefined;
}

export interface ReadRoutines {
  routines: Routine[];
  notes: string[];
}

/** Routines whose kind, time and owner trace to the text; every missing value gets a listed default. */
export function readRoutines(
  text: string,
  output: ReaderOutput,
  members: ReadMembers,
): ReadRoutines {
  const routines: Routine[] = [];
  const notes: string[] = [];
  const everyDay: string[] = [];
  for (const draft of output.routines) {
    if (routines.length >= 8) break;
    const quotes = quotesOf(draft);
    const mode = modeOf(text, draft);
    const kindQuoted = inText(text, draft.kind);
    const claimed = kindQuoted && valueSupportedByQuote(draft.kind.value, draft.kind.quote);
    const fromWords = kindQuoted ? kindFromLexicon(draft.kind.quote) : undefined;
    // "I drive to Gurugram at 8:30" names no activity, but a trip by a verified mode is a commute.
    const byMode = !claimed && fromWords === undefined && mode !== undefined;
    const kind = claimed ? draft.kind.value : (fromWords ?? (byMode ? 'commute' : undefined));
    const memberId = ownerOf(text, draft.who, members);
    if (kind === undefined || memberId === undefined) continue;
    const name = nameOf(kind, draft.kind.quote);
    if (byMode) {
      const word = firstTerm(draft.mode?.quote ?? '', termsForValue(mode)) ?? 'trip';
      notes.push(`Treated the ${word} as a commute. Change it in the form.`);
    }

    const start = startOf(text, draft, quotes);
    if (start === undefined) {
      notes.push(`Left out the ${name} because no time was given. Add it in the form.`);
      continue;
    }
    if (start.assumed) notes.push(`Assumed ${start.start} for the ${name}. Change it in the form.`);

    const minutes = minutesOf(text, draft, quotes);
    if (minutes === undefined)
      notes.push(`Assumed ${String(DEFAULT_MINUTES)} minutes for ${name}. Change it in the form.`);
    const intensity = intensityOf(text, draft, quotes);
    // A walk or a trip is light by nature; only a guess about play or sport is worth a note.
    if (intensity === undefined && (kind === 'outdoor_play' || kind === 'sport')) {
      notes.push(`Assumed ${DEFAULT_INTENSITY[kind]} effort for ${name}. Change it in the form.`);
    }
    const days = daysOf(text, draft, quotes);
    if (days === undefined) everyDay.push(name);
    const km = kmOf(text, draft);

    routines.push({
      id: `${kind}-${String(routines.length + 1)}`,
      memberId,
      kind,
      start: start.start,
      minutes: minutes ?? DEFAULT_MINUTES,
      intensity: intensity ?? DEFAULT_INTENSITY[kind],
      ...(mode === undefined ? {} : { mode }),
      ...(km === undefined ? {} : { km }),
      days: days ?? [...WEEKDAYS],
      flexHours: FLEX_HOURS[kind],
    });
  }
  if (everyDay.length > 0)
    notes.push(`Assumed every day for ${everyDay.join(', ')}. Change it in the form.`);
  return { routines, notes };
}
