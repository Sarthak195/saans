import type { ReactElement } from 'react';

import type { UserMessage } from '@/server/errors';

export interface NoticeLink {
  href: string;
  label: string;
}

function Links({ links }: { readonly links: readonly NoticeLink[] }): ReactElement | null {
  if (links.length === 0) return null;
  return (
    <p className="actions">
      {links.map((l) => (
        <a key={l.href + l.label} className="link-button" href={l.href}>
          {l.label}
        </a>
      ))}
    </p>
  );
}

/** A whole page for something that went wrong: what happened, what to do, and where to go. */
export function ErrorNotice({
  text,
  links,
}: {
  readonly text: UserMessage;
  readonly links: readonly NoticeLink[];
}): ReactElement {
  return (
    <>
      <h1 id="plan-title" tabIndex={-1}>
        {text.title}
      </h1>
      <p>{text.body}</p>
      <p>{text.nextAction}</p>
      <Links links={links} />
    </>
  );
}

/** A notice inside a page that still works, read out as soon as it appears. */
export function AlertNotice({
  text,
  links,
}: {
  readonly text: UserMessage;
  readonly links: readonly NoticeLink[];
}): ReactElement {
  return (
    <section role="alert" className="notice">
      <h2>{text.title}</h2>
      <p>{text.body}</p>
      <p>{text.nextAction}</p>
      <Links links={links} />
    </section>
  );
}
