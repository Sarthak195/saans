'use client';

// The page shown when something throws while a page renders.
// Layer: route (src/app), a client component because Next requires one for an error boundary.
// It says nothing about the cause and offers to retry or go home.
import Link from 'next/link';
import { useEffect, useRef, type ReactElement } from 'react';

/** The error boundary page. `reset` asks Next to try rendering the failed page again. */
export default function ErrorPage({ reset }: { readonly reset: () => void }): ReactElement {
  const heading = useRef<HTMLHeadingElement>(null);

  // The page content has just been replaced, so move focus to the new heading; a screen reader
  // user would otherwise be left on an element that no longer exists.
  useEffect(() => {
    heading.current?.focus();
  }, []);

  // The error itself is never shown: its text can carry internal detail. The role makes a screen
  // reader announce the message as soon as it appears.
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
