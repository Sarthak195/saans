// The public surface of the text checks: normalising text, finding the numbers a text states,
// checking quotes against what a user wrote, and checking a briefing's tone about changed items.
// Layer: core (pure). No clock, network or environment. Other code imports from here.
export { normalizeText } from '@/core/text/normalize';
export { checkNumbers, extractNumbers, splitClockNumbers } from '@/core/text/numbers';
export type { NumberCheckOptions } from '@/core/text/numbers';
export { checkPolarity } from '@/core/text/polarity';
export type { Decision, PolarityItem, PolarityResult } from '@/core/text/polarity';
export { ageYearsFromQuote, quoteInText, valueSupportedByQuote } from '@/core/text/quote';
