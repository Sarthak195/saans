import 'server-only';

import type {
  Alternative,
  CommunityPlan,
  HomeAdvice,
  Plan,
  QuestionTarget,
} from '@/core/plan/types';
import type { Household, Language, Mode } from '@/core/types';
import type { PlaceMatch } from '@/server/geo/geocode';

/** What reading a family's own words produced: a household to plan for, a place to pick, or the form. */
export type ReaderResult =
  | {
      kind: 'household';
      household: Household;
      target?: QuestionTarget;
      /** Plain notes for the family, such as values assumed because the text did not say. */
      notes: string[];
      by: 'gemini' | 'keywords';
    }
  | { kind: 'choose_place'; options: PlaceMatch[]; text: string }
  | { kind: 'form'; reason: string; text: string };

export interface WrittenText {
  by: 'gemini' | 'template';
  text: string;
  lang: Language;
  /** Shown beside the text when the template stood in, for example while the free quota is used up. */
  note?: string;
}

export type QuestionResult =
  | {
      kind: 'question';
      intent: 'can_i' | 'what_if_time' | 'what_if_mode' | 'explain';
      target: QuestionTarget;
      newStart?: string;
      newMode?: Mode;
    }
  | { kind: 'unclear'; reason: string };

const NOT_READY = 'Reading text is not available yet, so please use the form.';

export function readHousehold(input: {
  text: string;
  place?: PlaceMatch;
  now: Date;
}): Promise<ReaderResult> {
  return Promise.resolve({ kind: 'form', reason: NOT_READY, text: input.text });
}

export function readQuestion(input: {
  text: string;
  household: Household;
}): Promise<QuestionResult> {
  return Promise.resolve({
    kind: 'unclear',
    reason: input.text.trim() === '' ? 'Type a question first.' : NOT_READY,
  });
}

export function writeBriefing(input: {
  plan: Plan;
  home: HomeAdvice[];
  alternatives: Alternative[];
  household: Household;
  lang: Language;
}): Promise<WrittenText> {
  const changed = input.plan.routines.filter((r) => r.decision !== 'keep').length;
  return Promise.resolve({
    by: 'template',
    lang: input.lang,
    text: `${String(changed)} routines change in this plan.`,
  });
}

export function writeNotice(input: {
  plan: Plan;
  community: CommunityPlan;
  lang: Language;
}): Promise<WrittenText> {
  return Promise.resolve({
    by: 'template',
    lang: input.lang,
    text: `${String(input.community.actions.length)} actions for today.`,
  });
}
