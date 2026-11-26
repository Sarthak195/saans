// Seals a written summary or notice into a short parameter and reads it back, so text can survive
// a redirect without being stored. Server layer. Written text is bound to the household, day,
// air, language and audience it was made for, and is checked again before it is shown.
import 'server-only';

import { createHash } from 'node:crypto';

import { checkWritten, templateBriefing, templateNotice } from '@/core/briefing';
import { writtenAllowance } from '@/core/plan/facts';
import type { CommunityKind, Language } from '@/core/types';
import { AppError } from '@/server/errors';
import type { WrittenText } from '@/server/genai';
import type { PlanView } from '@/server/plan-view';
import { openWrittenText, sealWrittenText } from '@/server/seal';

// The note shown instead of model text that was too long to seal whole.
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
  /** The language the text is written in. */
  lang: Language;
  /** Who the text speaks to: the family itself, or a society, school or office. */
  audience: 'family' | CommunityKind;
  /** The current time, passed in so nothing here reads the clock. */
  now: Date;
}

/** A SHA-256 hash, in base64url, of everything the text must stay tied to. */
function bindingOf(target: WrittenFor): string {
  const { token, view, lang, audience } = target;
  const { plan } = view;
  // The decisions are part of the binding: a reading from a nearby monitor can change what the
  // plan tells a family to do, and text written for other decisions must never show beside
  // these.
  const decisions = [
    plan.severe,
    plan.glance.airing.kind,
    plan.routines.map((r) => [r.routineId, r.decision, r.level]),
  ];
  return createHash('sha256')
    .update(JSON.stringify([token, plan.day.date, view.mode, lang, audience, decisions]))
    .digest('base64url');
}

/** Whole seconds since 1970 for a moment, rounded down. */
function seconds(now: Date): number {
  return Math.floor(now.getTime() / 1000);
}

/**
 * A written summary or notice packed into a short sealed parameter, so a page can show it after a
 * redirect without keeping anything. Code-built text is not carried at all, only its note: the
 * page builds it again from the plan it shows. A cut-off model text could lose a caveat, so one
 * that does not fit is swapped for the code-built text too. Returns the sealed parameter.
 */
export function sealWritten(written: WrittenText, target: WrittenFor): string {
  const base = { binding: bindingOf(target), issuedAt: seconds(target.now) };
  if (written.by === 'gemini') {
    const whole = sealWrittenText({
      ...base,
      text: written.text,
      by: 'gemini',
      lang: written.lang,
    });
    // The seal cuts text to fit, so open it again and keep it only if nothing was cut.
    if (openWrittenText(whole).text === written.text) return whole;
  }
  // Code-built text is sealed as an empty text with its note; the page rebuilds the text itself.
  const note = written.by === 'gemini' ? TOO_LONG : written.note;
  return sealWrittenText({
    ...base,
    text: '',
    by: 'template',
    lang: 'en',
    ...(note === undefined ? {} : { note }),
  });
}

/**
 * The code-built text for this page, built again from its plan so it is always the current one.
 */
function plainFor(target: WrittenFor, note: string | undefined): WrittenText | undefined {
  const { plan, community } = target.view;
  // A community notice needs a community view; without one there is no code-built text.
  const text =
    target.audience === 'family'
      ? templateBriefing(plan)
      : community === undefined
        ? undefined
        : templateNotice(plan, community);
  if (text === undefined) return undefined;
  return { by: 'template', lang: 'en', text, ...(note === undefined ? {} : { note }) };
}

/** The same checks a text passed when it was written, run again against the plan on this page. */
function stillHolds(written: WrittenText, target: WrittenFor): boolean {
  const { plan, home, alternatives, grap, community } = target.view;
  const family = target.audience === 'family';
  // The extras are the ones the writer allowed for this audience, so clock-hour and label rules
  // match.
  const allowance = writtenAllowance(
    plan,
    family ? { home, alternatives, grap } : { community, grap },
  );
  // True when the plan asks the family to change anything, or the day is severe.
  const changes = plan.severe || plan.routines.some((r) => r.decision !== 'keep');
  return checkWritten(written.text, {
    lang: written.lang,
    allowedNumbers: allowance.numbers,
    clockOnly: allowance.clockOnly,
    names: allowance.names,
    // Routine names were swapped in after the first check, so only the number and tone checks
    // apply.
    refs: [],
    // Text must not reassure when it is a community notice, or when the plan asks for a change.
    noReassurance: !family || changes,
    // When no question was asked, the text may not claim one was (always so for a community
    // notice).
    asked: family && plan.answer !== undefined,
  }).ok;
}

/**
 * Reads sealed written text back for one page. A missing, edited, old or unrelated token, one
 * made for another plan, day, air, language or audience, or a text that no longer passes its
 * checks reads as nothing, so the plain text shows. Never throws for a bad token.
 */
export function openWritten(
  token: string | undefined,
  target: WrittenFor,
): WrittenText | undefined {
  if (token === undefined) return undefined;
  try {
    const sealed = openWrittenText(token);
    // A text made for another household, day, air, language, audience or set of decisions.
    if (sealed.binding !== bindingOf(target)) return undefined;
    // Too old, or stamped further ahead than a clock difference between instances explains.
    const age = seconds(target.now) - sealed.issuedAt;
    if (age > MAX_AGE_SECONDS || age < -MAX_FUTURE_SECONDS) return undefined;
    // Code-built text is rebuilt from this page's plan; only its note was carried.
    if (sealed.by === 'template') return plainFor(target, sealed.note);
    if (sealed.text === '') return undefined;
    const written: WrittenText = {
      by: sealed.by,
      text: sealed.text,
      lang: sealed.lang,
      ...(sealed.note === undefined ? {} : { note: sealed.note }),
    };
    return stillHolds(written, target) ? written : undefined;
  } catch (error) {
    // A token that cannot be opened is not an error the family needs to see.
    if (error instanceof AppError) return undefined;
    throw error;
  }
}
