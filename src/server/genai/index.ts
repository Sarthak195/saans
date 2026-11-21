import 'server-only';

import type { Alternative, CommunityPlan, HomeAdvice, Plan } from '@/core/plan/types';
import type { Household, Language } from '@/core/types';
import { defaultDeps } from '@/server/genai/config';
import type { GenaiDeps } from '@/server/genai/model';
import { questionWithDeps } from '@/server/genai/question';
import { readWithDeps } from '@/server/genai/reader';
import type { QuestionResult, ReaderResult, WrittenText } from '@/server/genai/types';
import type { PlaceMatch } from '@/server/geo/geocode';
import { briefingWithDeps, noticeWithDeps } from '@/server/genai/writer';

export type { QuestionResult, ReaderResult, WrittenText };

// Each function takes the model call, model names and cache as an optional last argument so tests
// can replay recordings; the app passes nothing and gets the real client from the environment.

/** Reads a family's own words into a household, a place to choose, or the form. */
export function readHousehold(
  input: { text: string; place?: PlaceMatch; now: Date },
  deps: GenaiDeps = defaultDeps(),
): Promise<ReaderResult> {
  return readWithDeps(input, deps);
}

/** Sorts one question about the plan into an intent and what it points at. */
export function readQuestion(
  input: { text: string; household: Household },
  deps: GenaiDeps = defaultDeps(),
): Promise<QuestionResult> {
  return questionWithDeps(input, deps);
}

/** A short briefing for the plan, written by the model and checked, or built in code. */
export function writeBriefing(
  input: {
    plan: Plan;
    home: HomeAdvice[];
    alternatives: Alternative[];
    household: Household;
    lang: Language;
  },
  deps: GenaiDeps = defaultDeps(),
): Promise<WrittenText> {
  return briefingWithDeps(input, deps);
}

/** A short notice for a society, school or office, written and checked the same way. */
export function writeNotice(
  input: { plan: Plan; community: CommunityPlan; lang: Language },
  deps: GenaiDeps = defaultDeps(),
): Promise<WrittenText> {
  return noticeWithDeps(input, deps);
}
