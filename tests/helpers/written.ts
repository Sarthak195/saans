import type { Household, Language } from '@/core/types';
import type { PlanDay } from '@/core/time';
import { communityKindOf, withCommunityKind } from '@/server/edits';
import { loadPlanView } from '@/server/plan-view';
import type { AirMode } from '@/server/plan-view';
import type { WrittenFor } from '@/server/written-draft';

/** Two sentences with no numbers and no reassurance, so they pass every check on any plan. */
export const SUMMARY = 'Keep the evening walk short today. Take water along.';
export const HINDI_SUMMARY = 'आज शाम की सैर छोटी रखें। साथ में पानी रखें।';

/** What a page would pass to openWritten for this household, so a test seals and opens for the same page. */
export async function writtenFor(
  household: Household,
  token: string,
  options: {
    lang?: Language;
    audience?: WrittenFor['audience'];
    day?: PlanDay['relative'];
    air?: AirMode;
    now?: Date;
  } = {},
): Promise<WrittenFor> {
  const now = options.now ?? new Date();
  const audience = options.audience ?? 'family';
  const view = await loadPlanView({
    household:
      audience === 'family'
        ? household
        : withCommunityKind(household, communityKindOf(audience, 'society')),
    now,
    day: options.day,
    air: options.air,
  });
  return { token, view, lang: options.lang ?? 'en', audience, now };
}
