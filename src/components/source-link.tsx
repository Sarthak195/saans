// Shows where a piece of advice comes from. React component layer: every rule row carries a
// source, and this turns it into a link or, for the app's own rules, plain text.
import type { ReactElement } from 'react';

import type { Reason } from '@/core/plan/types';
import type { SourceRef } from '@/core/source';

/**
 * Where a piece of advice comes from. Saans's own rules say so; every other rule links to its
 * source. A source with no address is shown as plain text, not as a link.
 */
export function SourceLink({ source }: { readonly source: SourceRef }): ReactElement {
  // An 'APP' source is a rule Saans made itself, so it gets a fixed name instead of a title.
  const title = source.status === 'APP' ? 'Saans rule' : source.title;
  return source.url === '' ? (
    <span>{title}</span>
  ) : (
    <a href={source.url} rel="noopener noreferrer">
      {title}
    </a>
  );
}

/** A short "Why" line under a piece of advice: the rule's reason and where it comes from. */
export function ReasonLine({ reason }: { readonly reason: Reason }): ReactElement {
  return (
    <p className="small">
      Why: {reason.text} Source: <SourceLink source={reason.source} />.
    </p>
  );
}
