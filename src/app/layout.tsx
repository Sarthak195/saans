// The root layout for every page: the shared header, footer, skip link and data credits.
// App layer (React server component). It loads the global stylesheets and forces per-request
// rendering so the content security policy nonce reaches the page scripts.

import type { Metadata, Viewport } from 'next';
import { connection } from 'next/server';
import type { ReactElement, ReactNode } from 'react';

import { DISCLAIMER_LINE, GEONAMES_URL, OPEN_METEO_URL, OPENAQ_URL } from '@/components/copy';

import './globals.css';
import './components.css';

/** The default title and the title template, and the description, shared by every page. */
export const metadata: Metadata = {
  // Each page names itself; the template keeps the product name last so browser tabs stay distinct.
  title: { default: 'Saans', template: '%s | Saans' },
  description: 'A household plan for living with poor air in India.',
};

/** Device-width layout at normal zoom; zoom is not disabled, so a reader can enlarge the page. */
export const viewport: Viewport = { width: 'device-width', initialScale: 1 };

/**
 * The page frame around every route: a skip link, the site header, the main region that holds the
 * page, and a footer with the disclaimer and the credits for the data sources.
 */
export default async function RootLayout({
  children,
}: Readonly<{ children: ReactNode }>): Promise<ReactElement> {
  // A prerendered page cannot carry the per-request CSP nonce, so its scripts would be blocked
  // and it would never hydrate. Opting the whole tree into per-request rendering here means no
  // future page can forget to.
  await connection();

  // The skip link comes first so a keyboard reader can jump past the header, and the main
  // region takes focus when that link is used. The footer credits Open-Meteo (CC BY 4.0), OpenAQ
  // and GeoNames, and links to the full disclaimer on the About page.
  return (
    <html lang="en">
      <body>
        <a className="skip-link" href="#main">
          Skip to main content
        </a>
        <header className="site-header">
          <div className="site-header__inner">
            <p className="site-name">
              <a href="/">Saans</a>
            </p>
            <p className="site-subtitle">A daily air plan for your household</p>
          </div>
        </header>
        <main id="main" className="main" tabIndex={-1}>
          {children}
        </main>
        <footer className="site-footer">
          <div className="site-footer__inner">
            <p>
              {DISCLAIMER_LINE} <a href="/about">About Saans, sources and the full disclaimer</a>
            </p>
            <p>
              Air quality data:{' '}
              <a href={OPEN_METEO_URL} rel="noopener noreferrer">
                Open-Meteo.com
              </a>{' '}
              (CC BY 4.0), CAMS; nearby monitor readings:{' '}
              <a href={OPENAQ_URL} rel="noopener noreferrer">
                OpenAQ
              </a>{' '}
              (CPCB network monitors); place names:{' '}
              <a href={GEONAMES_URL} rel="noopener noreferrer">
                GeoNames
              </a>
              .
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}
