'use client';

import Link from 'next/link';
import { useEffect, useRef, type ReactElement } from 'react';

export default function ErrorPage({ reset }: { readonly reset: () => void }): ReactElement {
  const heading = useRef<HTMLHeadingElement>(null);

  // The page content has just been replaced, so move focus to the new heading; a screen reader
  // user would otherwise be left on an element that no longer exists.
  useEffect(() => {
    heading.current?.focus();
  }, []);

  // The error itself is never shown: its text can carry internal detail.
  return (
    <div role="alert">
      <h1 ref={heading} tabIndex={-1}>
        Something went wrong
      </h1>
      <p>We could not show this page. Please try again.</p>
      <p>
        <button className="button" type="button" onClick={reset}>
          Try again
        </button>{' '}
        <Link className="link-button" href="/">
          Go to the home page
        </Link>
      </p>
    </div>
  );
}
