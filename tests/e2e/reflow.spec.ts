// Checks that no page scrolls sideways at 320 px wide. WCAG 1.4.10 (reflow) asks for this, and a
// wide table or an unbroken address only overflows in a real layout engine, which the jsdom tests
// do not have.
import { expect, test } from '@playwright/test';

import { PAGES } from './pages';

test.skip(({ browserName }) => browserName !== 'chromium', 'layout is checked in Chromium only');

test.use({ viewport: { width: 320, height: 800 } });

for (const entry of PAGES) {
  test(`${entry.name} does not scroll sideways at 320 px`, async ({ page }) => {
    await page.goto(entry.path);
    await page.waitForLoadState('networkidle');
    await entry.prepare?.(page);

    const widths = await page.evaluate(() => ({
      scroll: document.documentElement.scrollWidth,
      client: document.documentElement.clientWidth,
    }));
    expect(widths.scroll).toBeLessThanOrEqual(widths.client);
  });
}
