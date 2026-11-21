// Fixed wording shared by several pages, kept in one place so the pages and their tests agree.

export const SMOG_DAY_LABEL =
  'Recorded smog day: Delhi, 13 Dec 2025 (GRAP Stage IV was in force). Not live.';

export const DISCLAIMER_LINE =
  'General public-health guidance, not medical advice. See a doctor for breathlessness, chest pain or a cough that will not settle.';

export const PRIVACY_LINE =
  "Your text is sent to Google's Gemini API to read it. On the free tier Google may use it to improve its products. Avoid names and exact addresses. Saans stores nothing.";

export const SHARE_WARNING = "This link contains your family's profile.";

export const ATTRIBUTION =
  'Air quality data: Open-Meteo.com (CC BY 4.0), CAMS; place names: GeoNames.';

export const CPCB_URL = 'https://airquality.cpcb.gov.in';
export const SAMEER_URL = 'https://play.google.com/store/apps/details?id=com.cpcb';
export const OPEN_METEO_URL = 'https://open-meteo.com/';
export const GEONAMES_URL = 'https://www.geonames.org/';

/** One short line per action, shown in a status region after a redirect. Keys are fixed, never user text. */
export const STATUS_LINES = {
  made: 'Your plan is ready. It is built from the details you gave.',
  changed: 'Your change is applied. The plan below shows the new time or mode.',
  place: 'The plan now uses the new place. Everything else stays the same.',
  asked: 'Your question is answered below.',
} as const;

export type StatusKey = keyof typeof STATUS_LINES;

export function statusLine(key: string | undefined): string | undefined {
  return key !== undefined && Object.hasOwn(STATUS_LINES, key)
    ? STATUS_LINES[key as StatusKey]
    : undefined;
}

/**
 * Why a step could not finish, one fixed line per key. A link carries only the key, so nothing a
 * family wrote and nothing from another plan can be put in front of a reader through the address.
 */
export const NOTE_LINES = {
  filled:
    "Some details were not in your text, so Saans filled them in, for example an adult where no age was given. Check them under 'Change the family's details'.",
  keywords:
    "The AI reader was not available, so Saans read your text by matching words. Please check each detail under 'Change the family's details'.",
  noQuestion: 'Type a question first.',
  noAi: 'Questions need the AI reader, which is not available right now. Pick a routine from the plan instead.',
  notUnderstood: 'We could not tell which routine you mean. Pick one from the plan instead.',
  whichRoutine: 'Say which routine you mean, for example the evening walk.',
  noAir: 'There is no air data to write about right now, so try again in a while.',
  placeNotFound:
    'Nothing in India matched what you typed. Check the spelling, or type the name of the nearest city.',
} as const;

export type NoteKey = keyof typeof NOTE_LINES;

export function noteLine(key: string | undefined): string | undefined {
  return key !== undefined && Object.hasOwn(NOTE_LINES, key)
    ? NOTE_LINES[key as NoteKey]
    : undefined;
}
