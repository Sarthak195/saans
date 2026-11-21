import type { ReactElement } from 'react';

import type { Reason } from '@/core/plan/types';
import type { SourceRef } from '@/core/source';

/** Where a piece of advice comes from. Saans's own rules say so; every other rule links to its source. */
export function SourceLink({ source }: { readonly source: SourceRef }): ReactElement {
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
