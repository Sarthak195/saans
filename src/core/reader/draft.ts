import { MAX_TEXT, householdSchema } from '@/core/profile/schema';
import type { QuestionTarget } from '@/core/plan/types';
import { readHome } from '@/core/reader/home';
import { readMembers } from '@/core/reader/members';
import { readRoutines } from '@/core/reader/routines';
import type { ReaderOutput } from '@/core/reader/schema';
import { hasSubject, resolveTarget } from '@/core/reader/target';
import { hasTerm, mentionsAny } from '@/core/reader/terms';
import { quoteInText } from '@/core/text';
import type { Home, Household, Language, Member, Place, Routine } from '@/core/types';

/** What survived checking, before a place is attached. */
export interface HouseholdDraft {
  /** Where the family said they live; resolved to a place by the caller. */
  placeQuery?: string;
  members: Member[];
  routines: Routine[];
  home: Home;
  question?: string;
  target?: QuestionTarget;
  notes: string[];
}

const DEVANAGARI = /\p{Script=Devanagari}/gu;
const LETTERS = /\p{L}/gu;

/** Hindi when most of the letters are Devanagari; Hinglish in Latin letters stays English. */
export function detectLang(text: string): Language {
  const letters = text.match(LETTERS)?.length ?? 0;
  const hindi = text.match(DEVANAGARI)?.length ?? 0;
  return letters > 0 && hindi / letters > 0.3 ? 'hi' : 'en';
}

// A sentence asks something when it has a question mark or a question word. "My dadi walks at 7"
// is a statement, even if the model echoes it back as the question.
const QUESTION_WORDS = [
  'what',
  'when',
  'where',
  'which',
  'who',
  'why',
  'how',
  'can',
  'could',
  'should',
  'would',
  'will',
  'shall',
  'is it',
  'are they',
  'kya',
  'kab',
  'kahan',
  'kaun',
  'kaise',
  'kyun',
  'kyon',
  'क्या',
  'कब',
  'कहाँ',
  'कौन',
  'कैसे',
  'क्यों',
];

// A question can open with one of these and carry no question mark: "Is my son safe to play".
const QUESTION_OPENERS = new Set([
  'is',
  'are',
  'am',
  'do',
  'does',
  'did',
  'was',
  'were',
  'have',
  'has',
  'any',
  'safe',
  'ok',
  'okay',
]);

function asksSomething(question: string): boolean {
  const first =
    question
      .trim()
      .split(/\s+/u)[0]
      ?.toLowerCase()
      .replace(/[^\p{L}]/gu, '') ?? '';
  return (
    /[?？]/u.test(question) || QUESTION_OPENERS.has(first) || mentionsAny(question, QUESTION_WORDS)
  );
}

function placeQueryOf(text: string, output: ReaderOutput): string | undefined {
  const place = output.place;
  if (!place || !quoteInText(text, place.quote)) return undefined;
  const city = place.value.split(',')[0] ?? place.value;
  return hasTerm(place.quote, city) ? place.value : undefined;
}

/**
 * Turns what the model returned into only what the family's own words support. Each value must
 * have a quote that is really in the text and that says it; ages become age bands, times come
 * from the quoted words, and anything missing gets a stated default with a note.
 */
export function readDraft(text: string, output: ReaderOutput): HouseholdDraft {
  const members = readMembers(text, output);
  const routines = readRoutines(text, output, members);
  const home = readHome(text, output);
  const placeQuery = placeQueryOf(text, output);

  const context = {
    members: members.members,
    routines: routines.routines,
  };
  const asked = output.question;
  const target = asked ? resolveTarget(text, asked, context) : undefined;
  // A question is kept only when it points at someone in the household. An instruction that
  // slipped into the text points at no one, so it is left out.
  const kept =
    asked &&
    target &&
    hasSubject(target) &&
    quoteInText(text, asked.text.value) &&
    asksSomething(asked.text.value)
      ? asked.text.value
      : undefined;

  return {
    ...(placeQuery === undefined ? {} : { placeQuery }),
    members: members.members,
    routines: routines.routines,
    home: home.home,
    ...(kept === undefined || kept.length > MAX_TEXT ? {} : { question: kept.trim() }),
    ...(kept === undefined || target === undefined ? {} : { target }),
    notes: [...members.notes, ...routines.notes, ...home.notes],
  };
}

export type FinishedDraft =
  | { ok: true; household: Household; target?: QuestionTarget; notes: string[] }
  | { ok: false; reason: string };

/** Attaches the place, sets the language and checks the whole household against the profile schema. */
export function finishHousehold(draft: HouseholdDraft, place: Place, text: string): FinishedDraft {
  const parsed = householdSchema.safeParse({
    v: 1,
    place,
    members: draft.members,
    routines: draft.routines,
    home: draft.home,
    ...(draft.question === undefined ? {} : { question: draft.question }),
    ...(draft.target === undefined ? {} : { questionTarget: draft.target }),
    lang: detectLang(text),
  });
  if (!parsed.success) {
    return { ok: false, reason: 'We could not turn your text into a complete family profile.' };
  }
  return {
    ok: true,
    household: parsed.data,
    ...(draft.target === undefined ? {} : { target: draft.target }),
    notes: draft.notes,
  };
}
