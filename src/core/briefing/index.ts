// The briefing module's public surface. Callers import from here, not from the files behind it.

// Checks on written text, which decide whether the model's words may be shown.
export {
  checkWritten,
  memberGuards,
  polarityRefs,
  reassuresAnywhere,
  tidyText,
} from '@/core/briefing/check';
export type { CheckResult, PolarityRef } from '@/core/briefing/check';
// Hindi words and the Hindi day label.
export { ACTIVITY_HI, BAND_HI, DECISION_HI, dayHindi } from '@/core/briefing/hindi';
// The fact sheets the model is given.
export { briefingFacts, noticeFacts } from '@/core/briefing/facts';
export type { BriefingFacts, NoticeFacts, RoutineFacts } from '@/core/briefing/facts';
// Family labels for routines, and putting them back in place of the placeholders.
export { routineName, substituteNames } from '@/core/briefing/names';
// The fixed English wording used when the written text is unavailable.
export { HINDI_UNAVAILABLE, templateBriefing, templateNotice } from '@/core/briefing/template';
