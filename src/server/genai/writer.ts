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
import { planFacts } from '@/core/plan/facts';
import type { Household, Language } from '@/core/types';
import { AppError, type AppErrorKind } from '@/server/errors';
import { cacheKey } from '@/server/genai/cache';
import { climb, noteFor } from '@/server/genai/ladder';
import type { GenaiDeps } from '@/server/genai/model';
import { BRIEFING_PROMPT_VERSION, BRIEFING_SYSTEM } from '@/server/genai/prompts/briefing';
import { NOTICE_PROMPT_VERSION, NOTICE_SYSTEM } from '@/server/genai/prompts/notice';
import type { WrittenText } from '@/server/genai/types';

const MAX_OUTPUT_TOKENS = 1200;
const TEMPERATURE = 0.3;

interface Job {
  audience: 'family' | 'community';
  version: string;
  system: string;
  facts: object;
  lang: Language;
  /** Returns the reasons a text may not be shown; empty when it passes. */
  check: (text: string) => string[];
}

type Written = { ok: true; text: string } | { ok: false; kind: AppErrorKind };

/**
 * Asks the writer model, checks what it wrote, and on any failure asks the fallback model once.
 * Returns the checked text with placeholders still in it. The cache holds that text, never the
 * version with names, and a failure is thrown through the cache so it is not remembered.
 */
async function writeChecked(job: Job, deps: GenaiDeps): Promise<Written> {
  const { call, models } = deps;
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
        const text = tidyText(raw);
        if (job.check(text).length > 0) {
          throw new AppError('genai_schema', 'The written text failed its checks');
        }
        return text;
      },
      // Any failure, even a text that failed its checks, is worth one try on the other model.
      () => true,
    );
    if (!outcome.ok) throw new AppError(outcome.kind, 'The writer could not produce a text');
    return outcome.value;
  };
  try {
    return { ok: true, text: await deps.cache(key, produce) };
  } catch (error) {
    return { ok: false, kind: error instanceof AppError ? error.kind : 'genai_unavailable' };
  }
}

function fallbackNote(lang: Language, kind: AppErrorKind): string {
  return lang === 'hi' ? HINDI_UNAVAILABLE : noteFor(kind);
}

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
  const allowedNumbers = planFacts(plan, {
    home: input.home,
    alternatives: input.alternatives,
    grap: grapNote(plan.place, plan.air.aqi),
  });
  const refs = polarityRefs(plan);
  const guards = memberGuards(plan);
  const written = await writeChecked(
    {
      audience: 'family',
      version: BRIEFING_PROMPT_VERSION,
      system: BRIEFING_SYSTEM,
      facts: briefingFacts(input, lang === 'en'),
      lang,
      check: (text) =>
        checkWritten(text, { lang, allowedNumbers, refs, memberGuards: guards }).reasons,
    },
    deps,
  );
  // Names go in only now, after every check, so a label can never reach a number or a decision.
  const named = written.ok ? substituteNames(written.text, plan) : undefined;
  if (written.ok && named !== undefined) return { by: 'gemini', text: named, lang };
  return {
    by: 'template',
    text: templateBriefing(plan),
    lang: 'en',
    note: fallbackNote(lang, written.ok ? 'genai_schema' : written.kind),
  };
}

export async function noticeWithDeps(
  input: { plan: Plan; community: CommunityPlan; lang: Language },
  deps: GenaiDeps,
): Promise<WrittenText> {
  const { plan, community, lang } = input;
  const allowedNumbers = planFacts(plan, { community, grap: grapNote(plan.place, plan.air.aqi) });
  const written = await writeChecked(
    {
      audience: 'community',
      version: NOTICE_PROMPT_VERSION,
      system: NOTICE_SYSTEM,
      facts: noticeFacts(input),
      lang,
      check: (text) =>
        checkWritten(text, { lang, allowedNumbers, refs: [], noReassurance: true }).reasons,
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
