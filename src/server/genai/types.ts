// The result shapes of the GenAI layer: what reading, writing and question sorting hand back.
// Server layer: types only. Reading and writing results also say whether the model or the
// code made them.
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

/** A briefing or notice that is ready to show, and who wrote it. */
export interface WrittenText {
  /** 'gemini' when the model's text passed every check; 'template' when code wrote it instead. */
  by: 'gemini' | 'template';
  text: string;
  /** The language of the text; a template text is always English. */
  lang: Language;
  /** Shown beside the text when the template stood in, for example while the free quota is used up. */
  note?: string;
}

/**
 * What sorting a question produced: an intent with its target, or an unclear result with a reason
 * to show the family. The new start and new mode are set only when the question's own words
 * give one, and a what-if intent always has one of them.
 */
export type QuestionResult =
  | {
      kind: 'question';
      intent: 'can_i' | 'what_if_time' | 'what_if_mode' | 'explain';
      target: QuestionTarget;
      /** A clock time for the routine, as the family asked about it. */
      newStart?: string;
      /** A way of travelling the family asked about instead of the current one. */
      newMode?: Mode;
    }
  | { kind: 'unclear'; reason: string };
