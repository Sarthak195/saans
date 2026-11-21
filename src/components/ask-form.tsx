import type { ReactElement } from 'react';

import { PRIVACY_LINE } from './copy';
import { LocationButton } from './location-button';

export interface AskDefaults {
  text: string;
  place: string;
}

/** The front door: a family describes their day in their own words and Gemini reads it. */
export function AskForm({
  formToken,
  defaults,
  exampleHref,
}: {
  readonly formToken: string;
  readonly defaults: AskDefaults;
  /** A link that fills the box with an example, or none when there is no example to offer. */
  readonly exampleHref: string | undefined;
}): ReactElement {
  return (
    <section aria-labelledby="ask-title" className="section">
      <h2 id="ask-title" tabIndex={-1}>
        Tell us about your family&apos;s day
      </h2>
      <form method="post" action="/ask">
        <input type="hidden" name="formToken" value={formToken} />
        <div className="field">
          <label htmlFor="ask-own-words">Describe who goes out, where and when</label>
          <p id="ask-own-words-hint" className="small">
            For example: where you live, how old everyone is, and what they do outdoors. Write in
            English, Hindi or a mix.
          </p>
          <textarea
            id="ask-own-words"
            name="text"
            rows={7}
            maxLength={1500}
            defaultValue={defaults.text}
            aria-describedby="ask-own-words-hint ask-privacy"
          />
          <p id="ask-privacy" className="small">
            {PRIVACY_LINE}
          </p>
          {exampleHref === undefined ? null : (
            <p>
              <a href={exampleHref}>Use this example</a>
            </p>
          )}
        </div>
        <div className="field">
          <label htmlFor="ask-place">Place in India, if it is not in your text</label>
          <input
            id="ask-place"
            name="place"
            type="text"
            autoComplete="address-level2"
            maxLength={80}
            defaultValue={defaults.place}
          />
        </div>
        <p className="actions">
          <LocationButton />
        </p>
        <p>
          <button className="button" type="submit">
            Make my plan
          </button>
        </p>
      </form>
      <p>
        Prefer fields to writing? <a href="/household">Describe your family with a form</a>.
      </p>
    </section>
  );
}
