// The list of sample households on the home page. React component layer: plain links, so each
// sample is an ordinary page that works without script.
import type { ReactElement } from 'react';

/** One sample household as listed: its id in the address, a title and a one-line summary. */
export interface SampleCard {
  id: string;
  title: string;
  summary: string;
}

/** The sample households as plain links with a line each: a stable page for every one. */
export function SampleList({ samples }: { readonly samples: readonly SampleCard[] }): ReactElement {
  // Each link goes to '/plan/sample/<id>', the fixed page for that sample.
  return (
    <section aria-labelledby="samples-title" className="section">
      <h2 id="samples-title">See a sample plan</h2>
      <p>These households are made up. Each opens a full plan for today&apos;s air.</p>
      <ul className="samples">
        {samples.map((sample) => (
          <li key={sample.id}>
            <a href={`/plan/sample/${sample.id}`}>{sample.title}</a>
            <span className="sample-summary">{sample.summary}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
