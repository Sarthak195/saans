import type { Metadata, Viewport } from 'next';
import { connection } from 'next/server';
import type { ReactElement, ReactNode } from 'react';

import './globals.css';

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
            <p className="site-name">Saans</p>
            <p className="site-subtitle">A daily air plan for your household</p>
          </div>
        </header>
        <main id="main" className="main" tabIndex={-1}>
          {children}
        </main>
        <footer className="site-footer">
          <div className="site-footer__inner">
            <p>General public-health guidance, not medical advice</p>
            <p>
              Air quality data:{' '}
              <a href="https://open-meteo.com/" rel="noopener noreferrer">
                Open-Meteo.com
              </a>{' '}
              (CC BY 4.0), CAMS
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}
