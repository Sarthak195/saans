import { normalizeText } from '@/core/text/normalize';

type Kind = 'unit' | 'teen' | 'tens' | 'hundred';
type Lang = 'en' | 'hi';
interface Word {
  value: number;
  kind: Kind;
  lang: Lang;
}
interface Run {
  value: number;
  last: Kind;
  lang: Lang;
}

const WORDS = new Map<string, Word>();

function add(lang: Lang, kind: Kind, entries: Record<number, readonly string[]>): void {
  for (const [value, spellings] of Object.entries(entries)) {
    for (const spelling of spellings) {
      WORDS.set(normalizeText(spelling), { value: Number(value), kind, lang });
    }
  }
}

add('en', 'unit', {
  1: ['one'],
  2: ['two'],
  3: ['three'],
  4: ['four'],
  5: ['five'],
  6: ['six'],
  7: ['seven'],
  8: ['eight'],
  9: ['nine'],
});
// Ten, like the teens, fills the tens and units places at once, so nothing may follow it.
add('en', 'teen', {
  10: ['ten'],
  11: ['eleven'],
  12: ['twelve'],
  13: ['thirteen'],
  14: ['fourteen'],
  15: ['fifteen'],
  16: ['sixteen'],
  17: ['seventeen'],
  18: ['eighteen'],
  19: ['nineteen'],
});
add('en', 'tens', {
  20: ['twenty'],
  30: ['thirty'],
  40: ['forty', 'fourty'],
  50: ['fifty'],
  60: ['sixty'],
  70: ['seventy'],
  80: ['eighty'],
  90: ['ninety'],
});
add('en', 'hundred', { 100: ['hundred'] });

add('hi', 'unit', {
  1: ['ek', 'एक'],
  2: ['do', 'दो'],
  3: ['teen', 'तीन'],
  4: ['char', 'chaar', 'चार'],
  5: ['paanch', 'panch', 'पाँच', 'पांच'],
  6: ['chhe', 'chhah', 'chheh', 'छह', 'छः', 'छे'],
  7: ['saat', 'सात'],
  8: ['aath', 'आठ'],
  9: ['nau', 'नौ'],
});
add('hi', 'teen', {
  10: ['das', 'दस'],
  11: ['gyarah', 'gyaarah', 'ग्यारह'],
  12: ['barah', 'baarah', 'बारह'],
  13: ['terah', 'तेरह'],
  14: ['chaudah', 'चौदह'],
  15: ['pandrah', 'पंद्रह', 'पन्द्रह'],
  16: ['solah', 'सोलह'],
  17: ['satrah', 'सत्रह'],
  18: ['atharah', 'अठारह'],
  19: ['unnis', 'unnees', 'उन्नीस'],
});
add('hi', 'tens', {
  20: ['bees', 'बीस'],
  30: ['tees', 'तीस'],
  40: ['chaalis', 'chalis', 'चालीस'],
  50: ['pachaas', 'pachas', 'पचास'],
  60: ['saath', 'साठ'],
  70: ['sattar', 'सत्तर'],
  80: ['assi', 'अस्सी'],
  90: ['nabbe', 'नब्बे'],
});
add('hi', 'hundred', { 100: ['sau', 'सौ'] });

function canContinue(run: Run, word: Word): boolean {
  switch (word.kind) {
    case 'unit':
      return (
        run.last === 'hundred' || (run.last === 'tens' && run.lang === 'en' && word.lang === 'en')
      );
    case 'teen':
    case 'tens':
      return run.last === 'hundred';
    case 'hundred':
      return run.last === 'unit' && run.value < 10;
  }
}

/**
 * Finds numbers spelled as words in English, Hindi (Devanagari) and romanised Hindi, reading the
 * already normalised tokens of a text.
 *
 * Words for one to ten are skipped unless `includeSmall` is set: they occur naturally in prose
 * ("two children", "do bacche"), and flagging each one would reject honest briefings. Digits are
 * always extracted. Eleven and above are rarely incidental, so a model that writes "twenty" where
 * the data says 245 is caught. `includeSmall` is for checking a user's own words, where "saat saal"
 * has to support the value 7.
 *
 * Words combine the way speakers combine them: "twenty five", "two hundred forty", "do sau
 * pachaas". English tens accept an English unit after them; Hindi tens do not, because Hindi has
 * a separate word for every number to 100 and "bees paanch" is two numbers.
 */
export function extractWordNumbers(tokens: readonly string[], includeSmall: boolean): number[] {
  const found: number[] = [];
  const state: { run: Run | null } = { run: null };

  const flush = (): void => {
    if (state.run && (includeSmall || state.run.value >= 11)) found.push(state.run.value);
    state.run = null;
  };

  for (const raw of tokens) {
    const word = WORDS.get(raw.replace(/^[.:%]+|[.:%]+$/g, ''));
    if (!word) {
      flush();
      continue;
    }
    if (state.run && !canContinue(state.run, word)) flush();
    const run = state.run;
    if (!run) {
      state.run = { value: word.value, last: word.kind, lang: word.lang };
    } else if (word.kind === 'hundred') {
      state.run = { value: run.value * 100, last: 'hundred', lang: word.lang };
    } else {
      state.run = { value: run.value + word.value, last: word.kind, lang: word.lang };
    }
    // A sentence or clause end ("twenty. Five more") closes the number.
    if (/[.:]$/.test(raw)) flush();
  }
  flush();
  return found;
}
