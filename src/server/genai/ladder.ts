// The failure ladder for model calls: try one model, then the next, then report why it failed so
// the caller can use its no-AI path. Server layer: no state, and the attempt is passed in.
import { AppError, userMessage, type AppErrorKind } from '@/server/errors';
import { classifyError } from '@/server/genai/classify';

/** What the ladder gives back: the value and its model, or the kind of the last failure. */
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
  // The Set drops a repeated name, for example when the fallback is set to the same model.
  const order = [...new Set(models)];
  // Reported when the list is empty and nothing was tried.
  let last: AppErrorKind = 'genai_unavailable';
  for (const model of order) {
    try {
      return { ok: true, value: await attempt(model), model };
    } catch (error) {
      // An attempt may throw a plain error, so it is sorted into a kind before it is assessed.
      last = error instanceof AppError ? error.kind : classifyError(error).kind;
      if (!moveOn(last)) break;
    }
  }
  return { ok: false, kind: last };
}

/** The line shown beside text that was built in code instead of written by the AI. */
export function noteFor(kind: AppErrorKind): string {
  // The wording is the same title and body a family sees for that failure elsewhere in the app.
  const message = userMessage(kind);
  return `${message.title}. ${message.body}`;
}
