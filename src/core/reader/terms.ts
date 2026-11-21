import type { AgeBand, Cooking, Habit, Heating, Intensity, Weekday } from '@/core/types';
import { normalizeText } from '@/core/text';

// Word lists for the values the shared lexicon has no rows for. A value read from a family's own
// words is kept only when its quote contains one of these terms, so the model cannot add
// anything the text does not say.

const WORD = String.raw`[\p{L}\p{M}\p{N}]`;
// Inflections people write: "candles", "smoking", "walked".
const ENDINGS = '(?:s|es|ing|ning|ting|ping|ed)?';

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
  { terms: ['every day', 'everyday', 'daily', 'roz', 'rozana', 'रोज'], days: WEEK_ORDER },
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
