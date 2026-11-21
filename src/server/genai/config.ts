import 'server-only';

import { frameworkCache } from '@/server/genai/cache';
import { makeGeminiCall } from '@/server/genai/client';
import type { GenaiDeps } from '@/server/genai/model';
import { getEnv } from '@/server/env';

/** The real client and models from the environment. Without a key the call is null and every path is no-AI. */
export function defaultDeps(): GenaiDeps {
  const env = getEnv();
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
