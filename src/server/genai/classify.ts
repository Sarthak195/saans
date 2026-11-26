// Turns whatever a failed model call threw into one of the app's own error kinds.
// Server layer: pure, reads only the error it is given.
import { AppError } from '@/server/errors';

// The SDK names its own timeout "APIConnectionTimeoutError"; the platform's is "TimeoutError".
// Matches a timeout or an abort, for example "Request timed out".
const TIMEOUT = /timeout|abort|timed out/i;
// Matches a used-up quota or rate limit: "RESOURCE_EXHAUSTED", a standalone "429", "rate limit".
const QUOTA = /RESOURCE_EXHAUSTED|\b429\b|quota|rate.?limit/i;
// Matches wording that signals a refusal on content grounds, such as "SAFETY" or "blocked".
const BLOCKED = /SAFETY|PROHIBITED|blocked|BLOCKLIST|RECITATION/i;

// The HTTP status of an error object, read from `status` or `statusCode`; undefined when absent.
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
  // Already one of ours (for example from the client's own checks): keep its kind.
  if (error instanceof AppError) return error;
  const name = error instanceof Error ? error.name : '';
  const message = error instanceof Error ? error.message : '';
  const status = statusOf(error);
  // The order matters: a timeout is tested first, then quota, then a content refusal, and
  // anything left is treated as the service being unavailable.
  // 408 is Request Timeout and 504 is Gateway Timeout.
  if (TIMEOUT.test(`${name} ${message}`) || status === 408 || status === 504) {
    return new AppError('genai_timeout', 'The model did not answer in time');
  }
  if (status === 429 || QUOTA.test(message)) {
    return new AppError('genai_quota', 'The model quota is used up');
  }
  if (BLOCKED.test(message)) return new AppError('genai_blocked', 'The model declined the request');
  return new AppError('genai_unavailable', 'The model is not available');
}
