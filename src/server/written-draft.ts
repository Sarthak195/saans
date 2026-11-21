import 'server-only';

import { AppError } from '@/server/errors';
import type { WrittenText } from '@/server/genai';
import { openDraft, sealDraft } from '@/server/seal';

const TOO_LONG = 'The written text was too long to carry in a link, so this is the plain version.';

/**
 * A written summary or notice packed into a short sealed parameter, so a page can show it after a
 * redirect without keeping anything. A cut-off text could lose a caveat, so one that does not fit
 * is swapped for the code-built text instead.
 */
export function sealWritten(written: WrittenText, plain: string): string {
  const whole = sealDraft({
    text: written.text,
    options: [],
    by: written.by,
    lang: written.lang,
    ...(written.note === undefined ? {} : { note: written.note }),
  });
  if (openDraft(whole).text === written.text) return whole;
  return sealDraft({ text: plain, options: [], by: 'template', lang: 'en', note: TOO_LONG });
}

/** Reads sealed written text back. A missing, edited or unrelated token reads as nothing, so the plain text shows. */
export function openWritten(token: string | undefined): WrittenText | undefined {
  if (token === undefined) return undefined;
  try {
    const draft = openDraft(token);
    if (draft.by === undefined || draft.text === '') return undefined;
    return {
      by: draft.by,
      text: draft.text,
      lang: draft.lang ?? 'en',
      ...(draft.note === undefined ? {} : { note: draft.note }),
    };
  } catch (error) {
    if (error instanceof AppError) return undefined;
    throw error;
  }
}
