// Checks that the two things a keyboard user depends on work with the keyboard alone: the skip
// link, and the "Use my location" button inside the closed "Change place" disclosure. A control
// that works with a mouse can still be unreachable by Tab, and only a browser shows that.
import { expect, test } from '@playwright/test';

test('the first Tab on the home page focuses the skip link', async ({ page }) => {
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await page.keyboard.press('Tab');
  await expect(page.locator('.skip-link')).toBeFocused();
});

test.describe('the change-place disclosure', () => {
  test.use({ geolocation: { latitude: 19.07, longitude: 72.88 }, permissions: ['geolocation'] });

  test('opens with Enter and its location button works with Enter', async ({ page }) => {
    await page.goto('/plan/sample/s1');
    await page.waitForLoadState('networkidle');

    const disclosure = page.locator('details.change-place');
    await disclosure.locator('summary').focus();
    await page.keyboard.press('Enter');
    await expect(disclosure).toHaveAttribute('open', '');

    // The place box comes first in the form, then the location button. The button stays hidden
    // until the page has hydrated, so wait for it before Tab can land on it.
    const button = disclosure.getByRole('button', { name: 'Use my location' });
    await expect(button).toBeVisible();
    await page.keyboard.press('Tab');
    await expect(disclosure.locator('#place-change')).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(button).toBeFocused();

    await page.keyboard.press('Enter');
    // The location is rounded to 0.1 degree before it is kept.
    await expect(disclosure.locator("input[name='lat']")).toHaveValue('19.1');
  });
});
