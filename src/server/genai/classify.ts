import { AppError } from '@/server/errors';

const TIMEOUT_NAMES = ['TimeoutError', 'AbortError', 'RequestTimeoutError', 'RequestAbortedError'];
const QUOTA = /RESOURCE_EXHAUSTED|\b429\b|quota|rate.?limit/i;
const BLOCKED = /SAFETY|PROHIBITED|blocked|BLOCKLIST|RECITATION/i;

function statusOf(error: unknown): number | undefined {
  if (typeof error !== 'object' || error === null) return undefined;
  const record = error as Record<string, unknown>;
  const status = record.status ?? record.statusCode;
  return typeof status === 'number' ? status : undefined;
}

/**
 * Sorts a failed model call into the app's own kinds, which decide the next step on the ladder.
 * The SDK's message is read to tell the kinds apart but never copied into the error, because it
 * can quote the request.
 */
export function classifyError(error: unknown): AppError {
  if (error instanceof AppError) return error;
  const name = error instanceof Error ? error.name : '';
  const message = error instanceof Error ? error.message : '';
  const status = statusOf(error);
  if (TIMEOUT_NAMES.includes(name) || status === 408 || status === 504) {
    return new AppError('genai_timeout', 'The model did not answer in time');
  }
  if (status === 429 || QUOTA.test(message)) {
    return new AppError('genai_quota', 'The model quota is used up');
  }
  if (BLOCKED.test(message)) return new AppError('genai_blocked', 'The model declined the request');
  return new AppError('genai_unavailable', 'The model is not available');
}
