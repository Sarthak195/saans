import type { ReactElement } from 'react';

export interface SampleCard {
  id: string;
  title: string;
  summary: string;
}

/** The sample households as plain links with a line each: a stable page for every one. */
export function SampleList({ samples }: { readonly samples: readonly SampleCard[] }): ReactElement {
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
