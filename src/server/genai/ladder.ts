import { AppError, userMessage, type AppErrorKind } from '@/server/errors';
import { classifyError } from '@/server/genai/classify';

export type LadderOutcome<T> =
  { ok: true; value: T; model: string } | { ok: false; kind: AppErrorKind };

/** Failures a different model may not share: the quota, the clock and the service, not the content. */
export function isOutage(kind: AppErrorKind): boolean {
  return kind === 'genai_quota' || kind === 'genai_timeout' || kind === 'genai_unavailable';
}

/**
 * Tries the models in order. After a failure it moves on to the next model only when `moveOn`
 * says that kind of failure is worth another try; otherwise it stops and reports the failure, so
 * the caller can use the no-AI path. A model listed twice is tried once.
 */
export async function climb<T>(
  models: readonly string[],
  attempt: (model: string) => Promise<T>,
  moveOn: (kind: AppErrorKind) => boolean,
): Promise<LadderOutcome<T>> {
  const order = [...new Set(models)];
  let last: AppErrorKind = 'genai_unavailable';
  for (const model of order) {
    try {
      return { ok: true, value: await attempt(model), model };
    } catch (error) {
      last = error instanceof AppError ? error.kind : classifyError(error).kind;
      if (!moveOn(last)) break;
    }
  }
  return { ok: false, kind: last };
}

/** The line shown beside text that was built in code instead of written by the AI. */
export function noteFor(kind: AppErrorKind): string {
  const message = userMessage(kind);
  return `${message.title}. ${message.body}`;
}
