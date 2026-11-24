import type { AgeBand, Cooking, Habit, Heating, Intensity, Weekday } from '@/core/types';
import { normalizeText } from '@/core/text';

// Word lists for the values the shared lexicon has no rows for. A value read from a family's own
// words is kept only when its quote contains one of these terms, so the model cannot add
// anything the text does not say.

const WORD = String.raw`[\p{L}\p{M}\p{N}]`;
// Inflections people write: "candles", "smoking", "walked".
const ENDINGS = '(?:s|es|ing|ning|ting|ping|ging|ming|bing|ding|ed|ned|ted|ped|ged)?';

export function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);
}

/** True when `text` contains the term as a whole word (or words), after normalising both. */
export function hasTerm(text: string, term: string): boolean {
  const wanted = normalizeText(term);
  if (wanted === '') return false;
  // A short term takes no ending: "is" must not read as "i".
  const endings = wanted.length < 3 ? '' : ENDINGS;
  const pattern = new RegExp(`(?<!${WORD})${escapeRegex(wanted)}${endings}(?!${WORD})`, 'u');
  return pattern.test(normalizeText(text));
}

export function mentionsAny(text: string, terms: readonly string[]): boolean {
  return terms.some((term) => hasTerm(text, term));
}

/** The longest term of the list that the text contains: "cricket" rather than "play". */
export function firstTerm(text: string, terms: readonly string[]): string | undefined {
  return terms
    .filter((term) => hasTerm(text, term))
    .sort((a, b) => b.length - a.length)
    .at(0);
}

export const INTENSITY_TERMS: Record<Intensity, readonly string[]> = {
  light: ['light', 'gentle', 'slow', 'easy', 'stroll', 'leisurely', 'walk', 'sair', 'टहल'],
  moderate: ['brisk', 'moderate', 'jog', 'cycle', 'cycling'],
  vigorous: [
    'vigorous',
    'hard',
    'intense',
    'fast',
    'sprint',
    'run',
    'cricket',
    'football',
    'badminton',
    'basketball',
    'tennis',
    'kabaddi',
    'match',
    'race',
  ],
};

export const COOKING_TERMS: Record<Cooking, readonly string[]> = {
  lpg_png: ['lpg', 'png', 'gas stove', 'gas cylinder', 'cylinder', 'piped gas'],
  electric: ['induction', 'electric stove', 'electric cooker'],
  biomass: ['chulha', 'chullah', 'firewood', 'wood', 'cow dung', 'dung', 'biomass', 'charcoal'],
  kerosene: ['kerosene', 'mitti ka tel'],
};

export const HABIT_TERMS: Record<Habit, readonly string[]> = {
  incense: ['incense', 'dhoop', 'agarbatti', 'agarbathi', 'अगरबत्ती', 'धूप'],
  mosquito_coil: ['mosquito coil', 'mosquito coils', 'coil'],
  smoking: ['smoke', 'smoking', 'cigarette', 'bidi', 'beedi', 'hookah'],
  candles: ['candle', 'mombatti', 'diya', 'मोमबत्ती'],
};

export const HEATING_TERMS: Record<Heating, readonly string[]> = {
  none: [],
  electric: ['electric heater', 'room heater', 'heater', 'blower'],
  angithi_coal: ['angithi', 'coal', 'sigri', 'sigdi', 'अंगीठी', 'कोयला'],
  gas: ['gas heater'],
};

const DAY_NAMES: Record<Weekday, readonly string[]> = {
  mon: ['mon', 'monday', 'somvar', 'सोमवार'],
  tue: ['tue', 'tues', 'tuesday', 'mangalvar', 'मंगलवार'],
  wed: ['wed', 'wednesday', 'budhvar', 'बुधवार'],
  thu: ['thu', 'thur', 'thurs', 'thursday', 'guruvar', 'veervar', 'गुरुवार'],
  fri: ['fri', 'friday', 'shukravar', 'शुक्रवार'],
  sat: ['sat', 'saturday', 'shanivar', 'शनिवार'],
  sun: ['sun', 'sunday', 'ravivar', 'रविवार'],
};
export const WEEK_ORDER: readonly Weekday[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
export const WEEKDAY_NAMES = DAY_NAMES;
export const DAY_GROUPS: readonly { terms: readonly string[]; days: readonly Weekday[] }[] = [
  {
    terms: [
      'every day',
      'everyday',
      'daily',
      'roz',
      'rozana',
      'रोज',
      'every morning',
      'every evening',
      'every night',
      'each morning',
      'each evening',
      'each day',
    ],
    days: WEEK_ORDER,
  },
  {
    terms: ['weekdays', 'weekday', 'school days', 'working days', 'schooldays'],
    days: ['mon', 'tue', 'wed', 'thu', 'fri'],
  },
  { terms: ['weekend', 'weekends'], days: ['sat', 'sun'] },
];

/** Words a person uses for themselves; the member is then called "Me". */
export const SPEAKER_TERMS = [
  'i',
  'me',
  'my',
  'myself',
  'main',
  'mera',
  'meri',
  'मैं',
  'मेरा',
  'मेरी',
];

/** Terms for someone who is about today, so the question is for the plan's own day. */
export const TODAY_TERMS = [
  'today',
  'tonight',
  'this evening',
  'this morning',
  'this afternoon',
  'aaj',
  'आज',
];

export const MORNING_TERMS = ['morning', 'subah', 'सुबह'];
export const EVENING_TERMS = [
  'evening',
  'afternoon',
  'night',
  'shaam',
  'sham',
  'dopahar',
  'raat',
  'शाम',
  'दोपहर',
  'रात',
];

/** Who a member is, when the family names only a role: the age band assumed, and the words for it. */
export const ROLE_TERMS: readonly { band: AgeBand; terms: readonly string[] }[] = [
  {
    band: 'older',
    terms: [
      'grandmother',
      'grandfather',
      'grandma',
      'grandpa',
      'dadi',
      'dada',
      'nani',
      'nana',
      'दादी',
      'दादा',
      'नानी',
      'नाना',
    ],
  },
  { band: 'infant', terms: ['baby', 'infant', 'newborn'] },
  {
    band: 'child',
    terms: [
      'son',
      'daughter',
      'kid',
      'child',
      'boy',
      'girl',
      'beta',
      'beti',
      'bachcha',
      'bacha',
      'बेटा',
      'बेटी',
      'बच्चा',
      'बच्ची',
    ],
  },
  {
    band: 'adult',
    terms: [
      'mother',
      'father',
      'wife',
      'husband',
      'brother',
      'sister',
      'maa',
      'papa',
      'mummy',
      'माँ',
      'मां',
      'पापा',
    ],
  },
];

export function roleBand(label: string): AgeBand | undefined {
  return ROLE_TERMS.find((role) => mentionsAny(label, role.terms))?.band;
}

// Endings a verb takes in plain writing ("walks", "walked", "jogging", "cycled").
const VERB_ENDINGS = new Set(['s', 'es', 'ed', 'd', 'ing']);
const DOUBLED_ENDINGS = new Set(['ing', 'ed']);
const IRREGULAR: Readonly<Record<string, readonly string[]>> = {
  run: ['ran'],
  go: ['goes', 'going', 'went', 'gone'],
};

function inflectsFrom(base: string, word: string): boolean {
  if (word === base) return true;
  if (IRREGULAR[base]?.includes(word) === true) return true;
  if (base.length < 3) return false;
  if (word.startsWith(base)) {
    const rest = word.slice(base.length);
    if (VERB_ENDINGS.has(rest)) return true;
    // "jogging", "jogged": the last letter doubles.
    const last = base.at(-1) ?? '';
    return rest.startsWith(last) && DOUBLED_ENDINGS.has(rest.slice(1));
  }
  // "cycle" gives "cycling" and "cycled".
  return (
    base.endsWith('e') &&
    word.startsWith(base.slice(0, -1)) &&
    DOUBLED_ENDINGS.has(word.slice(base.length - 1))
  );
}

/** True when two words are the same verb or noun in different forms: walk and walks, run and ran. */
export function sameWord(a: string, b: string): boolean {
  return inflectsFrom(a, b) || inflectsFrom(b, a);
}

/** Words of a phrase as plain tokens, with punctuation gone and digits split from letters. */
export function wordsOf(s: string): string[] {
  const key = normalizeText(s)
    .replace(/(\d)(\p{L})/gu, '$1 $2')
    .replace(/(?<!\d)[.:]|[.:](?!\d)/g, ' ')
    .trim();
  return key === '' ? [] : key.split(/\s+/u);
}

/**
 * True when the quote is in the text word for word, allowing each word to be another form of the
 * same word ("walk" in "my father walks"). Only for words the reader looks up in its own lists;
 * a stated value is still checked with the strict matcher in the text module.
 */
export function quoteInTextAsWords(text: string, quote: string): boolean {
  const wanted = wordsOf(quote);
  if (wanted.length === 0) return false;
  const source = wordsOf(text);
  for (let at = 0; at + wanted.length <= source.length; at += 1) {
    if (wanted.every((word, i) => sameWord(word, source[at + i] ?? ''))) return true;
  }
  return false;
}
