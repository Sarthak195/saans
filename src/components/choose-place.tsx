import type { ReactElement } from 'react';

import type { Place } from '@/core/types';

/** Several places share a name, and the air differs a lot between them, so the family picks one. */
export function ChoosePlace({
  options,
  action,
  formToken,
  draft,
  text,
  keep,
}: {
  readonly options: readonly Place[];
  /** Where each choice posts: '/ask' for a family's own words, or '/plan/<token>/place'. */
  readonly action: string;
  readonly formToken: string;
  /** The sealed list these options came from; a choice posts this and a position in it. */
  readonly draft: string;
  /** The family's own words, passed along unchanged when the choice continues a reading. */
  readonly text: string;
  readonly keep: Readonly<Record<string, string>>;
}): ReactElement {
  const name = options[0]?.name ?? 'this place';
  return (
    <>
      <h1 id="plan-title" tabIndex={-1}>
        Which {name} do you mean?
      </h1>
      <p>
        Several places in India share this name, and the air can be very different in each. Pick the
        one you live in.
      </p>
      <ul className="plain-list">
        {options.map((place, index) => (
          <li key={`${place.name}-${place.admin1}-${String(place.lat)}-${String(place.lon)}`}>
            <form method="post" action={action}>
              <input type="hidden" name="formToken" value={formToken} />
              {text === '' ? null : <input type="hidden" name="text" value={text} />}
              {Object.entries(keep).map(([field, value]) => (
                <input key={field} type="hidden" name={field} value={value} />
              ))}
              <input type="hidden" name="draft" value={draft} />
              <button className="button" type="submit" name="option" value={String(index)}>
                Plan for {place.name}, {place.admin1}
              </button>
            </form>
          </li>
        ))}
      </ul>
      <p>
        <a href="/">Start again</a>
      </p>
    </>
  );
}
