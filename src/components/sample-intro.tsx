import type { ReactElement } from 'react';

import { PRIVACY_LINE } from './copy';

/** How a sample household was described, with a way to see Gemini read the same words. */
export function SampleIntro({
  text,
  formToken,
}: {
  readonly text: string | undefined;
  readonly formToken: string;
}): ReactElement {
  return (
    <section aria-labelledby="sample-title" className="section">
      <h2 id="sample-title">About this sample</h2>
      <p>This is a made-up household, so you can see how a plan reads.</p>
      {text === undefined ? (
        <p>It was set up with the form, not described in words.</p>
      ) : (
        <>
          <p>
            This household was described as: <q lang="en">{text}</q>
          </p>
          <form method="post" action="/ask">
            <input type="hidden" name="formToken" value={formToken} />
            <input type="hidden" name="text" value={text} />
            <p className="small">{PRIVACY_LINE}</p>
            <p>
              <button className="button" type="submit">
                Read it with Gemini
              </button>
            </p>
          </form>
        </>
      )}
    </section>
  );
}
