import type { Quoted, ReaderOutput } from '@/core/reader/schema';
import {
  SPEAKER_TERMS,
  escapeRegex,
  hasTerm,
  mentionsAny,
  roleBand,
  wordsOf,
} from '@/core/reader/terms';
import { ageYearsFromQuote, normalizeText, quoteInText, valueSupportedByQuote } from '@/core/text';
import type { AgeBand, Member } from '@/core/types';

const MAX_LABEL = 40;
const MAX_ID = 24;

/** Age in whole years to the band the plan uses: under 1, 1 to 4, 5 to 12, 13 to 17, 18 to 59, 60 and over. */
export function ageBandOfYears(years: number): AgeBand {
  if (years < 1) return 'infant';
  if (years < 5) return 'under5';
  if (years < 13) return 'child';
  if (years < 18) return 'teen';
  return years < 60 ? 'adult' : 'older';
}

const BAND_PHRASE: Record<AgeBand, string> = {
  infant: 'a baby under 1',
  under5: 'a child under 5',
  child: 'a child aged 5 to 12',
  teen: 'a teenager',
  adult: 'an adult',
  older: 'an older adult, 60 or more',
};

function isSpeaker(label: string): boolean {
  return ['me', 'i', 'myself'].includes(normalizeText(label));
}

/** A label counts when its own quote contains it, or it is "me" and the quote is a word for "I". */
function labelIsQuoted(text: string, label: Quoted<string>): boolean {
  if (!quoteInText(text, label.quote)) return false;
  if (isSpeaker(label.value))
    return mentionsAny(label.quote, SPEAKER_TERMS) && hasTerm(text, label.quote);
  return hasTerm(label.quote, label.value);
}

function displayLabel(raw: string): string {
  const label = raw.trim().slice(0, MAX_LABEL);
  const shown = isSpeaker(label) ? 'me' : label;
  return shown.charAt(0).toUpperCase() + shown.slice(1);
}

function slug(label: string, taken: ReadonlySet<string>): string {
  const base =
    normalizeText(label)
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, MAX_ID) || 'member';
  let id = base;
  for (let n = 2; taken.has(id); n += 1) id = `${base}-${String(n)}`;
  return id;
}

export interface ReadMembers {
  members: Member[];
  /** The label as the family wrote it, to match a routine's owner. */
  names: Map<string, string>;
  notes: string[];
}

const YEAR_WORDS = new Set([
  'year',
  'years',
  'yr',
  'yrs',
  'yo',
  'saal',
  'sal',
  'saalon',
  'साल',
  'वर्ष',
]);
// Words after a number that make it a time, a distance, a length of time or a size, not an age.
const NOT_AN_AGE = new Set([
  'am',
  'pm',
  'baje',
  'bje',
  'bajey',
  'बजे',
  'oclock',
  'km',
  'kms',
  'kilometre',
  'kilometres',
  'kilometer',
  'kilometers',
  'minute',
  'minutes',
  'min',
  'mins',
  'hour',
  'hours',
  'hr',
  'hrs',
  'day',
  'days',
  'week',
  'weeks',
  'month',
  'months',
  'mahine',
  'mahina',
  'hafte',
  'hafta',
  'sq',
  'ft',
  'cfm',
  'aqi',
  'percent',
  'times',
  'kids',
  'people',
  'members',
]);
// "is 72", "aged 72", "umar 72": the word that says the number that follows is how old someone is.
const AGE_MARKERS = new Set([
  'is',
  'am',
  'are',
  'aged',
  'age',
  'hai',
  'hain',
  'hoon',
  'umar',
  'उम्र',
]);
// A bare number is an age only when it suits the role: a "son" of 72 is far likelier a slip.
const PLAUSIBLE: Record<AgeBand, readonly [number, number] | undefined> = {
  infant: undefined,
  under5: [1, 4],
  child: [1, 17],
  teen: [10, 19],
  adult: [16, 110],
  older: [40, 110],
};
// "father also is 72": the marker may sit a word or two after the label, and a filler may follow it.
const MARKER_REACH = 2;
const FILLERS = new Set(['about', 'around', 'nearly', 'almost', 'just', 'only', 'abhi']);
const CLAUSE_END = /(?:[.;!?\n।]+(?=\s|$))|\s+(?:and|aur|but|lekin|while)\s+/giu;

/** The ages in years a text states about one person: next to a year word, after "is", or between commas. */
function statedAgeFor(text: string, who: Quoted<string>, claimed: number): boolean {
  const bare = String(claimed);
  const label = wordsOf(who.quote);
  for (const clause of text.split(CLAUSE_END)) {
    const words = wordsOf(clause);
    const at = words.findIndex((_, i) => label.every((w, k) => words[i + k] === w));
    if (at < 0) continue;
    const afterLabel = at + label.length;
    const appositive = new RegExp(String.raw`${escapeRegex(who.quote)}\s*,\s*${bare}\s*,`, 'iu');
    if (appositive.test(clause)) return plausible(who.value, claimed);
    for (const [i, word] of words.entries()) {
      if (word !== bare) continue;
      const next = words[i + 1] ?? '';
      if (YEAR_WORDS.has(next)) return true;
      if (NOT_AN_AGE.has(next)) continue;
      let before = i - 1;
      while (before > at && FILLERS.has(words[before] ?? '')) before -= 1;
      const markerNear = before >= afterLabel && before - afterLabel <= MARKER_REACH;
      if (markerNear && AGE_MARKERS.has(words[before] ?? '') && plausible(who.value, claimed)) {
        return true;
      }
    }
  }
  return false;
}

function plausible(label: string, years: number): boolean {
  const band = isSpeaker(label) ? undefined : roleBand(label);
  const range = band === undefined ? ([1, 110] as const) : PLAUSIBLE[band];
  return range !== undefined && years >= range[0] && years <= range[1];
}

function ageOf(
  text: string,
  draft: ReaderOutput['members'][number],
  label: string,
  notes: string[],
): AgeBand {
  const years = draft.years;
  if (years && quoteInText(text, years.quote) && years.value >= 0 && years.value <= 110) {
    // The quote must carry a year word next to the number; months or weeks read as under one.
    const supported = ageYearsFromQuote(years.value, years.quote);
    if (supported !== undefined) return ageBandOfYears(supported);
    // The quote may be only the number ("72"): the text around it then has to say it is an age.
    if (
      valueSupportedByQuote(years.value, years.quote) &&
      statedAgeFor(text, draft.label, years.value)
    ) {
      return ageBandOfYears(years.value);
    }
  }
  const word = draft.ageWord;
  if (word && quoteInText(text, word.quote) && valueSupportedByQuote(word.value, word.quote)) {
    return word.value;
  }
  // An unknown age is guessed from the role: son and daughter are children, grandparents are
  // older, anyone else an adult. The guess is always listed, so the family can correct it.
  const band = isSpeaker(label) ? 'adult' : (roleBand(label) ?? 'adult');
  const who = isSpeaker(label) ? 'you' : label.toLowerCase();
  notes.push(`Assumed ${BAND_PHRASE[band]} for ${who}. Change it in the form.`);
  return band;
}

/** Members whose label, age and conditions trace to the text; the rest of what the model said is dropped. */
export function readMembers(text: string, output: ReaderOutput): ReadMembers {
  const members: Member[] = [];
  const names = new Map<string, string>();
  const notes: string[] = [];
  const ids = new Set<string>();
  for (const draft of output.members) {
    if (members.length >= 6) break;
    if (!labelIsQuoted(text, draft.label)) continue;
    const label = displayLabel(draft.label.value);
    const key = normalizeText(label);
    if (names.has(key)) continue;
    const id = slug(label, ids);
    ids.add(id);
    names.set(key, id);
    const conditions = draft.conditions
      .filter((c) => quoteInText(text, c.quote) && valueSupportedByQuote(c.value, c.quote))
      .map((c) => c.value);
    members.push({
      id,
      label,
      ageBand: ageOf(text, draft, label, notes),
      conditions: [...new Set(conditions)],
    });
  }
  return { members, names, notes };
}
