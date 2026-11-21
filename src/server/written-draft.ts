import 'server-only';

import { createHash } from 'node:crypto';

import { checkWritten } from '@/core/briefing';
import type { CommunityKind, Language } from '@/core/types';
import { AppError } from '@/server/errors';
import type { WrittenText } from '@/server/genai';
import type { PlanView } from '@/server/plan-view';
import { openWrittenText, sealWrittenText } from '@/server/seal';

const TOO_LONG = 'The written text was too long to carry in a link, so this is the plain version.';
// The forecast moves on, so text written for it stops being shown after a few hours.
const MAX_AGE_SECONDS = 6 * 60 * 60;
// A little clock difference between instances is normal; a token from further ahead is forged.
const MAX_FUTURE_SECONDS = 60;

/** What a written text belongs to. Text sealed for one of these never shows under another. */
export interface WrittenFor {
  /** The sealed household the page is for. */
  token: string;
  /** The view the text is shown beside; its day, air mode and numbers are part of the binding. */
  view: PlanView;
  lang: Language;
  audience: 'family' | CommunityKind;
  now: Date;
}

function bindingOf(target: WrittenFor): string {
  const { token, view, lang, audience } = target;
  return createHash('sha256')
    .update(JSON.stringify([token, view.plan.day.date, view.mode, lang, audience]))
    .digest('base64url');
}

function seconds(now: Date): number {
  return Math.floor(now.getTime() / 1000);
}

/**
 * A written summary or notice packed into a short sealed parameter, so a page can show it after a
 * redirect without keeping anything. A cut-off text could lose a caveat, so one that does not fit
 * is swapped for the code-built text instead.
 */
export function sealWritten(written: WrittenText, plain: string, target: WrittenFor): string {
  const base = { binding: bindingOf(target), issuedAt: seconds(target.now) };
  const whole = sealWrittenText({
    ...base,
    text: written.text,
    by: written.by,
    lang: written.lang,
    ...(written.note === undefined ? {} : { note: written.note }),
  });
  if (openWrittenText(whole).text === written.text) return whole;
  return sealWrittenText({ ...base, text: plain, by: 'template', lang: 'en', note: TOO_LONG });
}

/** Names are put in after the checks, so they are blanked here: a label's digits are not facts. */
function withoutNames(text: string, view: PlanView): string {
  const names = [view.plan.place.name, ...view.plan.members.map((m) => m.label)]
    .filter((n) => n !== '')
    .sort((a, b) => b.length - a.length);
  return names.reduce((rest, name) => rest.split(name).join('x'), text);
}

/** The same checks a text passed when it was written, run again against the plan on this page. */
function stillHolds(written: WrittenText, target: WrittenFor): boolean {
  const { plan, facts } = target.view;
  const changes = plan.severe || plan.routines.some((r) => r.decision !== 'keep');
  return checkWritten(withoutNames(written.text, target.view), {
    lang: written.lang,
    allowedNumbers: facts,
    // Routine names were swapped in after the first check, so only the number and tone checks apply.
    refs: [],
    noReassurance: target.audience !== 'family' || changes,
  }).ok;
}

/**
 * Reads sealed written text back for one page. A missing, edited, old or unrelated token, one
 * made for another plan, day, air, language or audience, or a text that no longer passes its
 * checks reads as nothing, so the plain text shows.
 */
export function openWritten(
  token: string | undefined,
  target: WrittenFor,
): WrittenText | undefined {
  if (token === undefined) return undefined;
  try {
    const sealed = openWrittenText(token);
    if (sealed.text === '' || sealed.binding !== bindingOf(target)) return undefined;
    const age = seconds(target.now) - sealed.issuedAt;
    if (age > MAX_AGE_SECONDS || age < -MAX_FUTURE_SECONDS) return undefined;
    const written: WrittenText = {
      by: sealed.by,
      text: sealed.text,
      lang: sealed.lang,
      ...(sealed.note === undefined ? {} : { note: sealed.note }),
    };
    // Code-built text needs no check; only the model's words are looked at again.
    if (written.by === 'gemini' && !stillHolds(written, target)) return undefined;
    return written;
  } catch (error) {
    if (error instanceof AppError) return undefined;
    throw error;
  }
}
