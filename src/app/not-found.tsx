// The page shown for an address that matches nothing, and when a route calls notFound().
// Layer: route (src/app). It is plain and static, with a link back to the home page.
import type { Metadata } from 'next';
import Link from 'next/link';
import type { ReactElement } from 'react';

/** The tab title for the not-found page. */
export const metadata: Metadata = { title: 'Page not found' };

/** Tells the visitor the page is missing, and that an old or mistyped link is the usual cause. */
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
