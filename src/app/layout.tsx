import type { Metadata, Viewport } from 'next';
import { connection } from 'next/server';
import type { ReactElement, ReactNode } from 'react';

import { DISCLAIMER_LINE, GEONAMES_URL, OPEN_METEO_URL, OPENAQ_URL } from '@/components/copy';

import './globals.css';
import './components.css';

export const metadata: Metadata = {
  // Each page names itself; the template keeps the product name last so browser tabs stay distinct.
  title: { default: 'Saans', template: '%s | Saans' },
  description: 'A household plan for living with poor air in India.',
};

export const viewport: Viewport = { width: 'device-width', initialScale: 1 };

export default async function RootLayout({
  children,
}: Readonly<{ children: ReactNode }>): Promise<ReactElement> {
  // A prerendered page cannot carry the per-request CSP nonce, so its scripts would be blocked
  // and it would never hydrate. Opting the whole tree into per-request rendering here means no
  // future page can forget to.
  await connection();

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
              (CPCB and state boards); place names:{' '}
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
