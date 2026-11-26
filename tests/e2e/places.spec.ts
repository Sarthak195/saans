// Checks the four ways a family names its place, in a real browser: the device location, a
// location no listed place names, a listed place typed in, and changing the place of a plan.
// Unit tests cannot see the browser's location prompt, the hidden fields it fills or the redirects
// between pages, and this is where a break in that chain would show.
//
// Only listed places (src/data/places.json) and device coordinates are used, so no test makes a
// place search. No test reads an air number, because the plan is built from a live service.
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

const NOIDA = { latitude: 28.57, longitude: 77.32 };
// Far from every listed place, so the plan can only be named "Your location".
const MYSURU_AREA = { latitude: 12.3, longitude: 76.6 };
const MUMBAI = { latitude: 19.07, longitude: 72.88 };

/** Adds one adult to the household form and presses its "Make my plan" button. */
async function addMeAndSubmit(page: Page): Promise<void> {
  await page.locator('#f-m1_label').fill('Me');
  await page.locator('#f-m1_age').selectOption('adult');
  await page
    .locator("form[action='/household/save']")
    .getByRole('button', { name: 'Make my plan' })
    .click();
  await expect(page).toHaveURL(/\/plan\//);
  await page.waitForLoadState('networkidle');
}

/** Opens the home page and checks the place box starts empty. */
async function openHome(page: Page): Promise<void> {
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await expect(page.locator('#ask-place')).toHaveValue('');
}

test.describe('with the device location allowed', () => {
  test.use({ geolocation: NOIDA, permissions: ['geolocation'] });

  test('a device location near a listed place becomes that place', async ({ page }) => {
    await openHome(page);
    await page.getByRole('button', { name: 'Use my location' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Using your location' })).toBeVisible();
    await page.getByRole('button', { name: 'Make my plan' }).click();

    await expect(page).toHaveURL(/\/household\?draft=/);
    await expect(page.locator('#f-place')).toHaveValue('Noida, Uttar Pradesh');

    await addMeAndSubmit(page);
    await expect(page.locator('.place-line')).toHaveText(/^Noida/);
  });
});

test.describe('with a location no listed place names', () => {
  test.use({ geolocation: MYSURU_AREA, permissions: ['geolocation'] });

  test('the plan is for "Your location, India"', async ({ page }) => {
    await openHome(page);
    await page.getByRole('button', { name: 'Use my location' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Using your location' })).toBeVisible();
    await page.getByRole('button', { name: 'Make my plan' }).click();

    await expect(page).toHaveURL(/\/household\?draft=/);
    await expect(page.locator("input[name='lat']")).toHaveValue('12.3');
    await expect(page.locator("input[name='lon']")).toHaveValue('76.6');
    await expect(page.getByRole('status').filter({ hasText: 'Using your location' })).toBeVisible();

    await addMeAndSubmit(page);
    await expect(page.locator('.place-line')).toHaveText('Your location, India');
  });
});

test.describe('without a location permission', () => {
  test('a listed place typed in survives editing the household', async ({ page }) => {
    await openHome(page);
    await page.locator('#ask-place').fill('Pune');
    await page.getByRole('button', { name: 'Make my plan' }).click();

    await expect(page).toHaveURL(/\/household\?draft=/);
    await expect(page.locator('#f-place')).toHaveValue('Pune, Maharashtra');

    await addMeAndSubmit(page);
    await expect(page.locator('.place-line')).toContainText('Pune');

    // The edit link carries the plan back into the form; the place must come with it.
    await page.getByRole('link', { name: /^Change the family.s details$/ }).click();
    await expect(page).toHaveURL(/\/household\?from=/);
    await expect(page.locator('#f-place')).toHaveValue('Pune, Maharashtra');
    await page
      .locator("form[action='/household/save']")
      .getByRole('button', { name: 'Make my plan' })
      .click();
    await expect(page).toHaveURL(/\/plan\//);
    await page.waitForLoadState('networkidle');
    await expect(page.locator('.place-line')).toContainText('Pune, Maharashtra');
  });
});

test.describe('changing the place of a plan', () => {
  test.use({ geolocation: MUMBAI, permissions: ['geolocation'] });

  test('the device location replans a sample for Mumbai', async ({ page }) => {
    await page.goto('/plan/sample/s1');
    await page.waitForLoadState('networkidle');

    await page.locator('details.change-place > summary').click();
    const disclosure = page.locator('details.change-place');
    await disclosure.getByRole('button', { name: 'Use my location' }).click();
    await expect(disclosure.getByRole('status')).toContainText('Using your location');
    await disclosure.getByRole('button', { name: 'Plan for this place' }).click();

    await expect(page.locator('.place-line')).toHaveText(/^Mumbai/);
  });
});

test.describe('a change of place with nothing given', () => {
  test('reopens the box with the reason beside it, tied to it for screen readers', async ({
    page,
  }) => {
    await page.goto('/plan/sample/s1');
    await page.waitForLoadState('networkidle');
    await page.locator('details.change-place > summary').click();
    await page
      .locator('details.change-place')
      .getByRole('button', { name: 'Plan for this place' })
      .click();

    await expect(page).toHaveURL(/#place-change$/);
    await expect(page.locator('details.change-place')).toHaveAttribute('open', '');
    const box = page.locator('#place-change');
    await expect(box).toHaveAttribute('aria-invalid', 'true');
    await expect(box).toHaveAttribute('aria-describedby', 'place-change-error');
    await expect(page.locator('#place-change-error')).toHaveText(
      'Type a place in India, or use your location.',
    );
  });
});
