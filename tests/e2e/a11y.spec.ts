// Runs axe-core over whole rendered pages in a real browser, in light and dark colours and at a
// desktop and a phone width. The jsdom tests in tests/unit cannot see the real layout, so anything
// that depends on it is checked here; colour pairs are also checked from the stylesheets by
// tests/unit/contrast.test.ts. The app keeps its light colours under a dark preference
// (color-scheme: light), and the dark runs check that nothing breaks when a browser asks for dark.
//
// Chromium only: axe's results do not depend on the engine, and one run is enough to keep the
// suite fast. A failing rule is reported with its selectors; it is never switched off.
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

import { PAGES } from './pages';

// WCAG 2.0 and 2.1 A and AA, and 2.2 AA, the level the README claims.
const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

const SCHEMES = ['light', 'dark'] as const;
// 1280 is a laptop; 320 is the narrowest width WCAG 1.4.10 (reflow) asks a page to work at.
const WIDTHS = [1280, 320] as const;

test.skip(({ browserName }) => browserName !== 'chromium', 'axe runs in Chromium only');

for (const entry of PAGES) {
  for (const scheme of SCHEMES) {
    for (const width of WIDTHS) {
      test(`${entry.name}, ${scheme}, ${String(width)} px has no WCAG violations`, async ({
        page,
      }) => {
        await page.setViewportSize({ width, height: 900 });
        await page.emulateMedia({ colorScheme: scheme });
        await page.goto(entry.path);
        await page.waitForLoadState('networkidle');
        await entry.prepare?.(page);

        const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
        // Rule id and selectors, so a failure names what to fix.
        const found = results.violations.map((violation) => ({
          rule: violation.id,
          targets: violation.nodes.map((node) => node.target),
        }));
        expect(found).toEqual([]);
      });
    }
  }
}
