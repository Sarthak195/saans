export type AppErrorKind =
  | 'upstream_timeout'
  | 'upstream_bad_shape'
  | 'upstream_unavailable'
  | 'no_data'
  | 'geocode_none'
  | 'geocode_ambiguous'
  | 'outside_india'
  | 'token_invalid'
  | 'token_too_large'
  | 'form_expired'
  | 'body_too_large'
  | 'genai_quota'
  | 'genai_blocked'
  | 'genai_schema'
  | 'genai_timeout'
  | 'genai_unavailable';

/** A failure the app understands. The kind decides what the family sees and which fallback runs. */
export class AppError extends Error {
  override readonly name = 'AppError';
  readonly kind: AppErrorKind;

  constructor(kind: AppErrorKind, detail?: string, options?: { cause?: unknown }) {
    super(detail ?? kind, options);
    this.kind = kind;
  }
}

export interface UserMessage {
  title: string;
  body: string;
  nextAction: string;
}

// Written for a parent reading on a phone: what is going on, in plain words, then one thing to do.
const MESSAGES: Record<AppErrorKind, UserMessage> = {
  upstream_timeout: {
    title: 'The air data is slow to load',
    body: 'The air quality service did not answer in time, so we cannot show the numbers for today yet.',
    nextAction: 'Wait a moment and try again.',
  },
  upstream_bad_shape: {
    title: 'The air data came back unreadable',
    body: 'The air quality service sent something we could not make sense of, so we are not showing numbers we cannot trust.',
    nextAction: 'Try again in a few minutes. For now, check the air quality in the Sameer app.',
  },
  upstream_unavailable: {
    title: 'The air data is not reachable right now',
    body: 'The air quality service is not responding, so we cannot show live numbers.',
    nextAction: 'Try again in a few minutes, or look at a sample place to see how the plan works.',
  },
  no_data: {
    title: 'No air data for this place yet',
    body: 'The air quality service has no readings for this spot, so we cannot build a plan from numbers.',
    nextAction: 'Try a nearby bigger city, or check the air quality in the Sameer app.',
  },
  geocode_none: {
    title: 'We could not find that place',
    body: 'Nothing in India matched what you typed.',
    nextAction: 'Check the spelling, or type the name of the nearest city.',
  },
  geocode_ambiguous: {
    title: 'More than one place has that name',
    body: 'Several places in different states share this name, and the air can be very different in each.',
    nextAction: 'Pick the one you live in from the list.',
  },
  outside_india: {
    title: 'This place is outside India',
    body: 'Saans gives guidance for places in India only, because its advice follows Indian air quality rules.',
    nextAction: 'Enter a place in India.',
  },
  token_invalid: {
    title: 'This link is not valid',
    body: 'The link may have been cut short when it was copied, or it was made by an older version of Saans.',
    nextAction: 'Go to the home page and set up your family again. It takes a minute.',
  },
  token_too_large: {
    title: 'This family setup is too big to put in a link',
    body: 'A link can only hold a limited amount of detail.',
    nextAction: 'Remove a routine or shorten a note, then create the link again.',
  },
  form_expired: {
    title: 'This form has timed out',
    body: 'The page was open for a long time, so it needs to be refreshed before it can be sent.',
    nextAction: 'Reload the page and send the form again.',
  },
  body_too_large: {
    title: 'That was too much to send at once',
    body: 'What you entered is larger than we can take in one go.',
    nextAction: 'Shorten your notes and send again.',
  },
  genai_quota: {
    title: 'The AI wording is paused for now',
    body: 'The free daily limit for the AI writer has been reached. The plan below is still worked out in full.',
    nextAction: 'Use the plan as shown, or try again later for the written summary.',
  },
  genai_blocked: {
    title: 'The AI wording was not used',
    body: 'The AI writer declined to word this one, so the plan is shown in plain form. The numbers and times are the same.',
    nextAction: 'Use the plan as shown.',
  },
  genai_schema: {
    title: 'The AI wording did not pass our checks',
    body: 'We only show AI wording that matches the numbers, and this one did not, so the plan is shown in plain form.',
    nextAction: 'Use the plan as shown, or ask again.',
  },
  genai_timeout: {
    title: 'The AI wording took too long',
    body: 'The AI writer did not finish in time. The plan below is still worked out in full.',
    nextAction: 'Use the plan as shown, or ask again.',
  },
  genai_unavailable: {
    title: 'The AI wording is not available',
    body: 'The AI writer is not reachable right now. The plan below is still worked out in full.',
    nextAction: 'Use the plan as shown, or try again in a few minutes.',
  },
};

export function userMessage(kind: AppErrorKind): UserMessage {
  return MESSAGES[kind];
}
