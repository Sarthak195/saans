// Remembers written text for a short while. Server layer: the cache lives in the framework, and
// this file holds no state of its own.
import 'server-only';

import { createHash } from 'node:crypto';

import { unstable_cache } from 'next/cache';

import type { TextCache } from '@/server/genai/model';

// Written text is remembered for half an hour so a sample page costs one model call per half hour,
// not one per visit. The key holds a hash of placeholders only (no names), and the text kept is
// the version before names go in, so one family's labels never reach another family.
const REMEMBER_SECONDS = 30 * 60;

/**
 * A stable key for a set of facts, a language and an audience: a SHA-256 hash, as 64 hex
 * characters, of the parts as JSON. The prompt version is part of the key, so a new prompt never
 * reads text written by an old one.
 */
export function cacheKey(parts: {
  version: string;
  audience: string;
  lang: string;
  facts: unknown;
}): string {
  return createHash('sha256').update(JSON.stringify(parts)).digest('hex');
}

/**
 * The framework's data cache. It is best effort: it can be cold, shared between instances or
 * empty after a deploy, and correctness never depends on it. A producer that throws is not
 * remembered, so a failure is retried on the next visit instead of being stuck for half an hour.
 */
export const frameworkCache: TextCache = (key, produce) =>
  // The key is one of the cache key parts, so each set of facts has its own entry.
  unstable_cache(produce, ['saans-written-text', key], { revalidate: REMEMBER_SECONDS })();

/** No remembering, for scripts and tests that run outside the framework. */
export const noCache: TextCache = (_key, produce) => produce();
