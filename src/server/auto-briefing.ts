// Asks the model for the English plan summary when a plan page is opened, but never for long.
// Server layer (I/O). The page always has a code-built summary to fall back on, so a slow or
// failed model costs the family nothing.
import 'server-only';

import type { WrittenText } from '@/server/genai';
import { writeBriefing } from '@/server/genai';
import type { PlanView } from '@/server/plan-view';

/** How long a page waits for the model before it shows the code-built summary instead. */
export const AUTO_WAIT_MS = 4000;

/**
 * The Gemini summary a plan page shows without being asked, or undefined when the page should
 * show the code-built one: smog-day recordings and pages with no air data never ask the model, and
 * a slow, failed or code-built reply is dropped at once. The writer remembers a checked text for
 * half an hour, so a repeat view of the same plan does not call the model again. A reply that
 * arrives after the wait still fills that memory for the next view.
 */
export async function autoBriefing(view: PlanView): Promise<WrittenText | undefined> {
  if (view.mode !== 'live' || view.unavailable !== undefined) return undefined;
  // Kept outside the try so the finally block can always cancel the wait.
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const pending = writeBriefing({
      plan: view.plan,
      home: view.home,
      alternatives: view.alternatives,
      household: view.household,
      lang: 'en',
    });
    // The reply may land after the wait is over; nothing is left to read it, so it must not throw.
    pending.catch(() => undefined);
    const late = new Promise<undefined>((resolve) => {
      timer = setTimeout(() => {
        resolve(undefined);
      }, AUTO_WAIT_MS);
    });
    // Whichever settles first wins: the reply, or undefined once the wait is over.
    const written = await Promise.race([pending, late]);
    // Only model text is kept. A code-built reply would just repeat what the page builds itself.
    return written?.by === 'gemini' ? written : undefined;
  } catch {
    // Any failure, even a missing key, leaves the plain summary: the page never waits on the
    // model.
    return undefined;
  } finally {
    clearTimeout(timer);
  }
}
