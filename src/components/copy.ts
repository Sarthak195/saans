// Fixed wording shared by several pages, kept in one place so the pages and their tests agree.

/** The notice that marks the recorded Delhi smog day as not live. */
export const SMOG_DAY_LABEL =
  'Recorded smog day: Delhi, 13 Dec 2025 (GRAP Stage IV was in force). Not live.';

/** The health disclaimer shown in the footer of every page and on the about page. */
export const DISCLAIMER_LINE =
  'General public-health guidance, not medical advice. See a doctor for breathlessness, chest pain or a cough that will not settle.';

/** What a family is told before their own words are sent to Gemini. */
export const PRIVACY_LINE =
  "Your text is sent to Google's Gemini API to read it. On the free tier Google may use it to improve its products. Avoid names and exact addresses. Saans keeps no copy of it.";

/** The warning beside the share advice: the link itself carries the family's details. */
export const SHARE_WARNING = "This link contains your family's profile.";

/** The credit line for the air quality and place name data, shown on the about page. */
export const ATTRIBUTION =
  'Air quality data: Open-Meteo.com (CC BY 4.0), CAMS; place names: GeoNames.';

/** The Central Pollution Control Board air quality site. */
export const CPCB_URL = 'https://airquality.cpcb.gov.in';
/** The CPCB app page on Google Play. */
export const SAMEER_URL = 'https://play.google.com/store/apps/details?id=com.cpcb';
/** The home page of Open-Meteo, the source of the air quality forecast. */
export const OPEN_METEO_URL = 'https://open-meteo.com/';
/** The home page of GeoNames, the source of place names. */
export const GEONAMES_URL = 'https://www.geonames.org/';
/** The home page of OpenAQ, the source of nearby monitor readings. */
export const OPENAQ_URL = 'https://openaq.org/';

/**
 * One short line per action, shown in a status region after a redirect. Keys are fixed, never
 * user text.
 */
export const STATUS_LINES = {
  made: 'Your plan is ready. It is built from the details you gave.',
  changed: 'Your change is applied. The plan below shows the new time or mode.',
  place: 'The plan now uses the new place. Everything else stays the same.',
  asked: 'Your question is answered below.',
} as const;

/** The fixed keys a link may carry for a status line. */
export type StatusKey = keyof typeof STATUS_LINES;

/** The status line for a key, or undefined when the key is missing or not one of ours. */
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
  placeOutside: 'Saans gives guidance for places in India only. Type a place in India.',
  placeLookup:
    'We could not look up that place just now. Try again in a minute, or type the nearest city.',
  placeMissing: 'Type a place in India, or use your location.',
} as const;

/** The fixed keys a link may carry for a note. */
export type NoteKey = keyof typeof NOTE_LINES;

/** The note for a key, or undefined when the key is missing or not one of ours. */
export function noteLine(key: string | undefined): string | undefined {
  return key !== undefined && Object.hasOwn(NOTE_LINES, key)
    ? NOTE_LINES[key as NoteKey]
    : undefined;
}

/** The notes that say why a place could not be used. The plan shows them at the place box too. */
export const PLACE_NOTE_KEYS = [
  'placeNotFound',
  'placeOutside',
  'placeLookup',
  'placeMissing',
] as const satisfies readonly NoteKey[];

/** One of the place notes. */
export type PlaceNoteKey = (typeof PLACE_NOTE_KEYS)[number];

/** The line for a place note, or undefined for any other key. */
export function placeNoteLine(key: string | undefined): string | undefined {
  return PLACE_NOTE_KEYS.some((k) => k === key) ? noteLine(key) : undefined;
}
