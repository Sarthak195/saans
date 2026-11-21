import { clockTimes, daysIn, minutesIn } from '@/core/reader/clock';
import type { ReaderOutput } from '@/core/reader/schema';
import {
  ROLE_TERMS,
  SPEAKER_TERMS,
  TODAY_TERMS,
  firstTerm,
  hasTerm,
  mentionsAny,
} from '@/core/reader/terms';
import { normalizeText } from '@/core/text';
import { extractNumbersWithSmallWords } from '@/core/text/numbers';
import { LEXICON_ENTRIES, termsForValue } from '@/core/text/lexicon';
import type { Mode, RoutineKind } from '@/core/types';

/** A listed place and the other names people use for it. */
export interface PlaceName {
  name: string;
  aliases: readonly string[];
}

type Draft = ReaderOutput;
type DraftMember = Draft['members'][number];
type DraftRoutine = Draft['routines'][number];

const CLAUSE_BREAK = /[.,;!?\n।]+|\s+(?:and|aur|but|lekin|while)\s+/giu;
const AGE = /(\d{1,3}|[\p{L}]+)\s*(?:-\s*)?(?:years?|yrs?|saal|sal|साल|वर्ष)(?:\s*old)?/iu;
// "My son is 7": a bare number after is, am or aged, unless a unit or time follows it.
const AGE_IS = /\b(?:is|am|aged?)\s+(\d{1,3})\b(?!\s*(?:km|am|pm|baje|:|minutes?|hours?))/iu;
const KM = /(\d+(?:\.\d+)?)\s*(?:km|kms|kilometres?|kilometers?)\b/iu;
const LIVING = [
  'live',
  'living',
  'stay',
  'staying',
  'rehta',
  'rehti',
  'rehte',
  'based',
  'रहता',
  'रहती',
  'रहते',
];
const ROLE_WORDS = ROLE_TERMS.flatMap((r) => r.terms);
const COMMUTE_MODES: readonly Mode[] = ['car', 'two_wheeler', 'auto', 'bus', 'metro_rail', 'cycle'];

function clauses(text: string): string[] {
  return text
    .split(CLAUSE_BREAK)
    .map((c) => c.trim())
    .filter((c) => c !== '');
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);
}

/** The listed place the family lives in: the one near a "live in" word, else the first one named. */
function placeOf(
  text: string,
  places: readonly PlaceName[],
): { value: string; quote: string } | undefined {
  const hits: { name: string; quote: string; at: number }[] = [];
  for (const place of places) {
    for (const name of [place.name, ...place.aliases]) {
      const match = new RegExp(
        `(?<![\\p{L}\\p{N}])${escapeRegex(name)}(?![\\p{L}\\p{N}])`,
        'iu',
      ).exec(text);
      if (match) hits.push({ name: place.name, quote: match[0], at: match.index });
    }
  }
  // A locality is named with its city ("Lajpat Nagar, Delhi"): prefer the longer name at the same spot.
  hits.sort((a, b) => a.at - b.at || b.quote.length - a.quote.length);
  const near = hits.find((h) =>
    LIVING.some((w) => hasTerm(text.slice(Math.max(0, h.at - 30), h.at), w)),
  );
  const chosen = near ?? hits[0];
  return chosen && { value: chosen.name, quote: chosen.quote };
}

function ageIn(clause: string): number | undefined {
  const plain = AGE_IS.exec(clause)?.[1];
  if (plain !== undefined) return Number(plain);
  const raw = AGE.exec(clause)?.[1];
  if (raw === undefined) return undefined;
  return /^\d+$/.test(raw) ? Number(raw) : extractNumbersWithSmallWords(raw)[0];
}

function kindsIn(clause: string): RoutineKind[] {
  return LEXICON_ENTRIES.flatMap((e) =>
    e.category === 'routine' && mentionsAny(clause, termsForValue(e.value)) ? [e.value] : [],
  );
}

function modeIn(clause: string): Mode | undefined {
  return COMMUTE_MODES.find((mode) => mentionsAny(clause, termsForValue(mode)));
}

/**
 * Reads the plain facts out of a family's text with word lists and patterns, for when the AI
 * reader is not available: the place, who is in the family and how old, and what they do when.
 * It returns the same shape the AI reader does, so the same checks and defaults apply to it.
 */
export function keywordOutput(text: string, places: readonly PlaceName[]): Draft {
  const members: DraftMember[] = [];
  const routines: DraftRoutine[] = [];
  const place = placeOf(text, places);
  let current: string | undefined;
  let question: Draft['question'];

  const memberFor = (clause: string): string | undefined => {
    const role = firstTerm(clause, ROLE_WORDS);
    const speaker = firstTerm(clause, SPEAKER_TERMS);
    const label = role ?? (speaker === undefined ? current : 'me');
    if (label === undefined) return undefined;
    let member = members.find((m) => normalizeText(m.label.value) === normalizeText(label));
    if (!member) {
      member = { label: { value: label, quote: role ?? speaker ?? label }, conditions: [] };
      members.push(member);
    }
    const years = ageIn(clause);
    if (years !== undefined && member.years === undefined)
      member.years = { value: years, quote: clause };
    for (const entry of LEXICON_ENTRIES) {
      const found = entry.category === 'condition' ? firstTerm(clause, entry.terms) : undefined;
      if (entry.category === 'condition' && found !== undefined) {
        member.conditions.push({ value: entry.value, quote: found });
      }
    }
    current = label;
    return label;
  };

  for (const clause of clauses(text)) {
    const who = memberFor(clause);
    const mode = modeIn(clause);
    const kind = kindsIn(clause)[0] ?? (mode === undefined ? undefined : 'commute');
    const time = clockTimes(clause)[0];
    if (kind !== undefined && who !== undefined && time !== undefined) {
      const minutes = minutesIn(clause)[0];
      const km = KM.exec(clause);
      const days = daysIn(clause);
      routines.push({
        who: { value: who, quote: firstTerm(clause, [...ROLE_WORDS, ...SPEAKER_TERMS]) ?? who },
        kind: { value: kind, quote: clause },
        start: { value: time, quote: clause },
        ...(minutes === undefined ? {} : { minutes: { value: minutes, quote: clause } }),
        ...(mode === undefined ? {} : { mode: { value: mode, quote: clause } }),
        ...(km?.[1] === undefined ? {} : { km: { value: Number(km[1]), quote: clause } }),
        ...(days.length === 0 ? {} : { days: { value: days, quote: clause } }),
      });
    }
  }

  // The last sentence that asks something is the family's question.
  const asking = text
    .split(/(?<=[.?!])\s+/u)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.endsWith('?'))
    .at(-1);
  if (asking !== undefined) {
    const hour = clockTimes(asking)[0];
    question = {
      text: { value: asking, quote: asking },
      about: { value: asking, quote: asking },
      ...(hour === undefined ? {} : { hour: { value: Number(hour.slice(0, 2)), quote: asking } }),
      ...(mentionsAny(asking, TODAY_TERMS) ? { today: { value: true, quote: asking } } : {}),
    };
  }
  return {
    ...(place === undefined ? {} : { place }),
    members,
    routines,
    home: { habits: [] },
    ...(question === undefined ? {} : { question }),
  };
}
