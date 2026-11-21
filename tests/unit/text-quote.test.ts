import { describe, expect, it } from 'vitest';

import { AGE_BANDS, CONDITIONS, MODES, ROUTINE_KINDS } from '@/core/profile/schema';
import { LEXICON_ENTRIES } from '@/core/text/lexicon';
import { quoteInText, valueSupportedByQuote } from '@/core/text/quote';

describe('quoteInText', () => {
  const source = 'My son plays cricket at 5:00 pm. Grandmother (68) has asthma, walks at 6:30.';

  it('finds an exact quote', () => {
    expect(quoteInText(source, 'plays cricket')).toBe(true);
  });

  it('ignores case and spacing', () => {
    expect(quoteInText(source, 'GRANDMOTHER   (68)\nhas asthma')).toBe(true);
  });

  it('matches smart quotes against straight quotes', () => {
    expect(quoteInText('She said "don\'t go out" today', 'don’t go out')).toBe(true);
    expect(quoteInText('She said “don’t go out” today', '"don\'t go out"')).toBe(true);
  });

  it('applies NFKC so full-width text matches plain text', () => {
    expect(quoteInText('PM２.５ ２４５ today', 'pm2.5 245')).toBe(true);
    expect(quoteInText('PM2.5 245 today', 'ＰＭ２.５ ２４５')).toBe(true);
  });

  it('treats Devanagari digits as ASCII digits', () => {
    expect(quoteInText('मेरा बेटा ७ साल का है', 'बेटा 7 साल')).toBe(true);
    expect(quoteInText('my son is 7', 'my son is ७')).toBe(true);
  });

  it('ignores trailing sentence punctuation in the quote', () => {
    expect(quoteInText('She walks at 6:30 daily', 'walks at 6:30.')).toBe(true);
    expect(quoteInText('She walks daily, then rests', 'walks daily.')).toBe(true);
  });

  it('keeps decimals and times intact when comparing', () => {
    expect(quoteInText('window of 2.5 hours', '2.5 hours')).toBe(true);
    expect(quoteInText('window of 2.5 hours', '25 hours')).toBe(false);
  });

  it('rejects a quote the user never wrote', () => {
    expect(quoteInText(source, 'plays football')).toBe(false);
    expect(quoteInText(source, 'my husband has asthma')).toBe(false);
  });

  it('rejects an empty or punctuation-only quote', () => {
    expect(quoteInText(source, '')).toBe(false);
    expect(quoteInText(source, ' .,! ')).toBe(false);
  });

  it('rejects any quote when the source is empty', () => {
    expect(quoteInText('', 'asthma')).toBe(false);
  });

  it('works for Hindi quotes', () => {
    expect(quoteInText('मेरी दादी को दमा है।', 'दादी को दमा है')).toBe(true);
  });
});

describe('valueSupportedByQuote with numbers', () => {
  it('supports a number written as digits', () => {
    expect(valueSupportedByQuote(68, 'grandmother is 68')).toBe(true);
    expect(valueSupportedByQuote(2.5, 'PM2.5 matters')).toBe(true);
  });

  it('supports a number written as Devanagari digits', () => {
    expect(valueSupportedByQuote(7, 'बेटा ७ साल का है')).toBe(true);
  });

  it('supports English words from one to ten', () => {
    expect(valueSupportedByQuote(7, 'my son is seven')).toBe(true);
    expect(valueSupportedByQuote(10, 'she is ten')).toBe(true);
    expect(valueSupportedByQuote(2, 'two children')).toBe(true);
  });

  it('supports a Hinglish word: mera beta saat saal ka hai gives 7', () => {
    expect(valueSupportedByQuote(7, 'mera beta saat saal ka hai')).toBe(true);
  });

  it('supports each Hindi and Hinglish word for one to ten', () => {
    const cases: [string, number][] = [
      ['ek', 1],
      ['do', 2],
      ['teen', 3],
      ['char', 4],
      ['chaar', 4],
      ['paanch', 5],
      ['chhe', 6],
      ['saat', 7],
      ['aath', 8],
      ['nau', 9],
      ['das', 10],
      ['एक', 1],
      ['दो', 2],
      ['तीन', 3],
      ['चार', 4],
      ['पांच', 5],
      ['छह', 6],
      ['सात', 7],
      ['आठ', 8],
      ['नौ', 9],
      ['दस', 10],
    ];
    for (const [word, value] of cases) {
      expect(valueSupportedByQuote(value, `bacche ki umar ${word} saal`)).toBe(true);
    }
  });

  it('supports larger number words', () => {
    expect(valueSupportedByQuote(68, 'sixty eight years')).toBe(true);
    expect(valueSupportedByQuote(60, 'saath saal')).toBe(true);
  });

  it('supports a time part from a quoted time', () => {
    expect(valueSupportedByQuote(17, 'plays cricket at 17:00')).toBe(true);
    expect(valueSupportedByQuote(30, 'walks at 06:30')).toBe(true);
  });

  it('rejects a number the quote does not contain', () => {
    expect(valueSupportedByQuote(8, 'mera beta saat saal ka hai')).toBe(false);
    expect(valueSupportedByQuote(70, 'grandmother is 68')).toBe(false);
  });

  it('rejects any number for an empty quote', () => {
    expect(valueSupportedByQuote(0, '')).toBe(false);
    expect(valueSupportedByQuote(7, '')).toBe(false);
  });
});

describe('valueSupportedByQuote with lexicon terms', () => {
  it('supports conditions in English, Hinglish and Hindi', () => {
    expect(valueSupportedByQuote('asthma_copd', 'grandmother has asthma')).toBe(true);
    expect(valueSupportedByQuote('asthma_copd', 'unhe saans ki bimari hai')).toBe(true);
    expect(valueSupportedByQuote('asthma_copd', 'दादी को दमा है')).toBe(true);
    expect(valueSupportedByQuote('heart', 'dil ki bimari')).toBe(true);
    expect(valueSupportedByQuote('heart', 'पापा को हृदय रोग है')).toBe(true);
    expect(valueSupportedByQuote('pregnancy', 'she is expecting')).toBe(true);
    expect(valueSupportedByQuote('pregnancy', 'वह गर्भवती है')).toBe(true);
  });

  it('does not let a Delhi mention support a heart condition', () => {
    expect(valueSupportedByQuote('heart', 'हम दिल्ली में रहते हैं')).toBe(false);
    expect(valueSupportedByQuote('heart', 'we live in Dilli')).toBe(false);
  });

  it('supports modes, including multi-word terms and hyphenated spellings', () => {
    expect(valueSupportedByQuote('two_wheeler', 'I ride a two-wheeler')).toBe(true);
    expect(valueSupportedByQuote('two_wheeler', 'bike se jaata hoon')).toBe(true);
    expect(valueSupportedByQuote('metro_rail', 'take the local train')).toBe(true);
    expect(valueSupportedByQuote('car', 'parent drives to Gurugram')).toBe(true);
    expect(valueSupportedByQuote('car', 'gaadi se')).toBe(true);
    expect(valueSupportedByQuote('walk', 'पैदल जाते हैं')).toBe(true);
    expect(valueSupportedByQuote('auto', 'rickshaw')).toBe(true);
  });

  it('supports routine kinds with common inflections', () => {
    expect(valueSupportedByQuote('outdoor_play', 'son plays cricket')).toBe(true);
    expect(valueSupportedByQuote('sport', 'I am running every day')).toBe(true);
    expect(valueSupportedByQuote('sport', 'she runs at 6')).toBe(true);
    expect(valueSupportedByQuote('walk', 'grandmother walks at 6:30')).toBe(true);
    expect(valueSupportedByQuote('walk', 'subah टहलने जाती हैं')).toBe(true);
    expect(valueSupportedByQuote('school_run', 'स्कूल छोड़ना')).toBe(true);
    expect(valueSupportedByQuote('errand', 'sabzi market')).toBe(true);
    expect(valueSupportedByQuote('commute', 'office jaata hoon')).toBe(true);
  });

  it('supports age bands from family words', () => {
    expect(valueSupportedByQuote('child', 'mera beta saat saal ka hai')).toBe(true);
    expect(valueSupportedByQuote('older', 'meri dadi 68 ki hain')).toBe(true);
    expect(valueSupportedByQuote('infant', 'we have a baby')).toBe(true);
    expect(valueSupportedByQuote('adult', 'my mother')).toBe(true);
  });

  it('rejects a term that is only a fragment of another word', () => {
    expect(valueSupportedByQuote('bus', 'I run a business')).toBe(false);
    expect(valueSupportedByQuote('car', 'take care')).toBe(false);
    expect(valueSupportedByQuote('sport', 'transport')).toBe(false);
  });

  it('rejects a value whose terms are not in the quote', () => {
    expect(valueSupportedByQuote('asthma_copd', 'my son plays cricket')).toBe(false);
    expect(valueSupportedByQuote('cycle', 'I drive a car')).toBe(false);
  });

  it('rejects a value the lexicon does not know', () => {
    expect(valueSupportedByQuote('submarine', 'submarine')).toBe(false);
    expect(valueSupportedByQuote('', 'anything')).toBe(false);
  });

  it('rejects any term for an empty quote', () => {
    expect(valueSupportedByQuote('car', '')).toBe(false);
  });
});

describe('lexicon data', () => {
  it('gives every row an app-defined source titled Saans vocabulary', () => {
    expect(LEXICON_ENTRIES.length).toBeGreaterThan(20);
    for (const entry of LEXICON_ENTRIES) {
      expect(entry.source.status).toBe('APP');
      expect(entry.source.title).toBe('Saans vocabulary');
    }
  });

  it('covers every profile value a reader can extract', () => {
    const covered = (category: string): Set<string> =>
      new Set(LEXICON_ENTRIES.filter((e) => e.category === category).map((e) => e.value));
    for (const [category, values] of [
      ['condition', CONDITIONS],
      ['mode', MODES],
      ['routine', ROUTINE_KINDS],
      ['age', AGE_BANDS],
    ] as const) {
      for (const value of values) expect(covered(category).has(value)).toBe(true);
    }
  });
});
