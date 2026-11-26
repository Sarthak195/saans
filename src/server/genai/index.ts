// The public face of the GenAI layer: four functions the routes call. Server layer: each one wraps
// a *WithDeps function, so the model only proposes and code checks, and every path has a no-AI
// result for when the model fails or no key is set.
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

// The result types are re-exported so callers import everything from this one module.
export type { QuestionResult, ReaderResult, WrittenText };

// Each function takes the model call, model names and cache as an optional last argument so tests
// can replay recordings; the app passes nothing and gets the real client from the environment.

/**
 * Reads a family's own words into a household, a place to choose, or the form. The time is passed
 * in as `now` rather than read from the clock.
 */
export function readHousehold(
  input: { text: string; place?: PlaceMatch; now: Date },
  deps: GenaiDeps = defaultDeps(),
): Promise<ReaderResult> {
  return readWithDeps(input, deps);
}

/**
 * Sorts one question about the plan into an intent and what it points at. When the AI reader is
 * not available or nothing in the question can be checked, it returns an unclear result.
 */
export function readQuestion(
  input: { text: string; household: Household },
  deps: GenaiDeps = defaultDeps(),
): Promise<QuestionResult> {
  return questionWithDeps(input, deps);
}

/**
 * A short briefing for the plan, written by the model and checked, or built in code. The result
 * says which one it is, and carries a note when the template stood in.
 */
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

/**
 * A short notice for a society, school or office, written and checked the same way. The checks
 * reject a reassuring sentence, and the template notice replaces the text when they fail.
 */
export function writeNotice(
  input: { plan: Plan; community: CommunityPlan; lang: Language },
  deps: GenaiDeps = defaultDeps(),
): Promise<WrittenText> {
  return noticeWithDeps(input, deps);
}
