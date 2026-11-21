import type { Quoted, ReaderOutput } from '@/core/reader/schema';
import { SPEAKER_TERMS, hasTerm, mentionsAny, roleBand } from '@/core/reader/terms';
import { normalizeText, quoteInText, valueSupportedByQuote } from '@/core/text';
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

function ageOf(
  text: string,
  draft: ReaderOutput['members'][number],
  label: string,
  notes: string[],
): AgeBand {
  const years = draft.years;
  if (
    years &&
    quoteInText(text, years.quote) &&
    valueSupportedByQuote(years.value, years.quote) &&
    years.value >= 0 &&
    years.value <= 110
  ) {
    return ageBandOfYears(years.value);
  }
  const word = draft.ageWord;
  if (word && quoteInText(text, word.quote) && valueSupportedByQuote(word.value, word.quote)) {
    return word.value;
  }
  // An unknown age is guessed from the role: son and daughter are children, grandparents are
  // older, anyone else an adult. The guess is always listed, so the family can correct it.
  const band = isSpeaker(label) ? 'adult' : (roleBand(label) ?? 'adult');
  notes.push(`Assumed ${BAND_PHRASE[band]} for ${label.toLowerCase()}. Change it in the form.`);
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
