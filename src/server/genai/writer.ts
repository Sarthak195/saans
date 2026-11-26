// Writes the family briefing and the community notice. The model drafts text from placeholder
// facts, code checks every number and sentence, and a template stands in when anything fails.
// Server layer: the model call, the cache and the model names all come in through deps.
import {
  HINDI_UNAVAILABLE,
  briefingFacts,
  checkWritten,
  noticeFacts,
  memberGuards,
  polarityRefs,
  substituteNames,
  templateBriefing,
  templateNotice,
  tidyText,
} from '@/core/briefing';
import { grapNote } from '@/core/alternatives';
import type { Alternative, CommunityPlan, HomeAdvice, Plan } from '@/core/plan/types';
import { writtenAllowance } from '@/core/plan/facts';
import type { Household, Language } from '@/core/types';
import { AppError, type AppErrorKind } from '@/server/errors';
import { cacheKey } from '@/server/genai/cache';
import { climb, noteFor } from '@/server/genai/ladder';
import type { GenaiDeps } from '@/server/genai/model';
import { BRIEFING_PROMPT_VERSION, BRIEFING_SYSTEM } from '@/server/genai/prompts/briefing';
import { NOTICE_PROMPT_VERSION, NOTICE_SYSTEM } from '@/server/genai/prompts/notice';
import type { WrittenText } from '@/server/genai/types';

// Cap on the reply's tokens; a briefing or notice is a few sentences.
const MAX_OUTPUT_TOKENS = 1200;
// Some variety in wording is allowed here; the reader uses 0.
const TEMPERATURE = 0.3;

// Everything writeChecked needs to produce one text for one audience.
interface Job {
  audience: 'family' | 'community';
  /** The prompt's version, part of the cache key so a new prompt never reuses old text. */
  version: string;
  system: string;
  /** Placeholder facts with no names; this is also what the cache key is made from. */
  facts: object;
  lang: Language;
  /** Returns the reasons a text may not be shown; empty when it passes. */
  check: (text: string) => string[];
}

// The checked text, or the kind of failure that sent the caller to its template.
type Written = { ok: true; text: string } | { ok: false; kind: AppErrorKind };

/**
 * Asks the writer model, checks what it wrote, and on any failure asks the fallback model once.
 * Returns the checked text with placeholders still in it. The cache holds that text, never the
 * version with names, and a failure is thrown through the cache so it is not remembered.
 */
async function writeChecked(job: Job, deps: GenaiDeps): Promise<Written> {
  const { call, models } = deps;
  // No API key: skip the cache and the model and go straight to the template.
  if (call === null) return { ok: false, kind: 'genai_unavailable' };
  const key = cacheKey({
    version: job.version,
    audience: job.audience,
    lang: job.lang,
    facts: job.facts,
  });
  const produce = async (): Promise<string> => {
    const outcome = await climb(
      [models.writer, models.fallback],
      async (model) => {
        const raw = await call({
          model,
          system: job.system,
          input: JSON.stringify({ lang: job.lang, ...job.facts }),
          temperature: TEMPERATURE,
          thinking: 'minimal',
          maxOutputTokens: MAX_OUTPUT_TOKENS,
        });
        // Tidying (dashes are rewritten) happens before the checks, so they check what is shown.
        const text = tidyText(raw);
        if (job.check(text).length > 0) {
          throw new AppError('genai_schema', 'The written text failed its checks');
        }
        return text;
      },
      // Any failure, even a text that failed its checks, is worth one try on the other model.
      () => true,
    );
    // Thrown, not returned, so the cache does not remember the failure.
    if (!outcome.ok) throw new AppError(outcome.kind, 'The writer could not produce a text');
    return outcome.value;
  };
  // A cached text already passed its checks when it was made, so a hit is not checked again.
  try {
    return { ok: true, text: await deps.cache(key, produce) };
  } catch (error) {
    return { ok: false, kind: error instanceof AppError ? error.kind : 'genai_unavailable' };
  }
}

// The line shown with a template text: a fixed Hindi line when Hindi was asked for (the template
// is English only), otherwise the reason for the failure.
function fallbackNote(lang: Language, kind: AppErrorKind): string {
  return lang === 'hi' ? HINDI_UNAVAILABLE : noteFor(kind);
}

/**
 * Writes the family briefing: the model's checked text with names put back in, or the template
 * briefing in English with a note saying why. It never throws; every failure becomes the template.
 */
export async function briefingWithDeps(
  input: {
    plan: Plan;
    home: HomeAdvice[];
    alternatives: Alternative[];
    household: Household;
    lang: Language;
  },
  deps: GenaiDeps,
): Promise<WrittenText> {
  const { plan, lang } = input;
  // The numbers, clock times and names the text may mention, taken from the plan and its extras.
  const allowance = writtenAllowance(plan, {
    home: input.home,
    alternatives: input.alternatives,
    grap: grapNote(plan.place, plan.air.aqi),
  });
  // A general "all fine" line contradicts a plan that moves anything, or a severe day.
  const noReassurance = plan.severe || plan.routines.some((r) => r.decision !== 'keep');
  // refs: each routine with its decision. guards: members whose routines the plan changes.
  const refs = polarityRefs(plan);
  const guards = memberGuards(plan);
  const written = await writeChecked(
    {
      audience: 'family',
      version: BRIEFING_PROMPT_VERSION,
      system: BRIEFING_SYSTEM,
      // The facts hold placeholders such as member_1, never a family's names.
      facts: briefingFacts(input, lang === 'en', lang === 'hi'),
      lang,
      check: (text) =>
        checkWritten(text, {
          lang,
          allowedNumbers: allowance.numbers,
          clockOnly: allowance.clockOnly,
          names: allowance.names,
          refs,
          memberGuards: guards,
          noReassurance,
          asked: plan.answer !== undefined,
        }).reasons,
    },
    deps,
  );
  // Names go in only now, after every check, so a label can never reach a number or a decision.
  const named = written.ok ? substituteNames(written.text, plan) : undefined;
  if (written.ok && named !== undefined) return { by: 'gemini', text: named, lang };
  // The template is English whatever language was asked for. When names could not be put back
  // (named is undefined), the note gives a schema failure as the reason.
  return {
    by: 'template',
    text: templateBriefing(plan),
    lang: 'en',
    note: fallbackNote(lang, written.ok ? 'genai_schema' : written.kind),
  };
}

/**
 * Writes the community notice for a society, school or office: the model's checked text, or the
 * template notice in English with a note saying why. Unlike the briefing, no names are
 * substituted into it.
 */
export async function noticeWithDeps(
  input: { plan: Plan; community: CommunityPlan; lang: Language },
  deps: GenaiDeps,
): Promise<WrittenText> {
  const { plan, community, lang } = input;
  const allowance = writtenAllowance(plan, {
    community,
    grap: grapNote(plan.place, plan.air.aqi),
  });
  const written = await writeChecked(
    {
      audience: 'community',
      version: NOTICE_PROMPT_VERSION,
      system: NOTICE_SYSTEM,
      facts: noticeFacts(input),
      lang,
      check: (text) =>
        checkWritten(text, {
          lang,
          allowedNumbers: allowance.numbers,
          clockOnly: allowance.clockOnly,
          names: allowance.names,
          // A notice has no per-routine refs, never reassures, and never answers a question.
          refs: [],
          noReassurance: true,
          asked: false,
        }).reasons,
    },
    deps,
  );
  if (written.ok) return { by: 'gemini', text: written.text, lang };
  return {
    by: 'template',
    text: templateNotice(plan, community),
    lang: 'en',
    note: fallbackNote(lang, written.kind),
  };
}
