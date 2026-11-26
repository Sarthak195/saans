// Builds the real model call, model names and cache from the environment. Server layer: it is the
// one place that reads the GenAI settings, so tests can pass their own deps instead.
import 'server-only';

import { frameworkCache } from '@/server/genai/cache';
import { makeGeminiCall } from '@/server/genai/client';
import type { GenaiDeps } from '@/server/genai/model';
import { getEnv } from '@/server/env';

/**
 * The real client and models from the environment. Without a key the call is null and every path
 * is no-AI. It is called afresh for each request, so nothing is held at module scope.
 */
export function defaultDeps(): GenaiDeps {
  const env = getEnv();
  // The reader and the question check use one model; the writer has its own; the fallback is the
  // second rung of the ladder for all three.
  return {
    call: env.GEMINI_API_KEY === undefined ? null : makeGeminiCall(env.GEMINI_API_KEY),
    models: {
      reader: env.GEMINI_MODEL_READER,
      writer: env.GEMINI_MODEL_WRITER,
      fallback: env.GEMINI_MODEL_FALLBACK,
    },
    cache: frameworkCache,
  };
}
