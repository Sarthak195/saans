import type { Metadata } from 'next';
import Link from 'next/link';
import type { ReactElement } from 'react';

export const metadata: Metadata = { title: 'Page not found' };

export default function NotFound(): ReactElement {
  return (
    <>
      <h1>Page not found</h1>
      <p>We could not find that page. The link may be old or mistyped.</p>
      <p>
        <Link className="link-button" href="/">
          Go to the home page
        </Link>
      </p>
    </>
  );
}
