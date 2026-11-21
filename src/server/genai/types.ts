import type { QuestionTarget } from '@/core/plan/types';
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
