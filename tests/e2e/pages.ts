// The pages the accessibility and layout specs visit, in one list so both check the same set.
import type { Page } from '@playwright/test';

/** One page state to check: a name for the report, and how to reach it. */
export interface PageCase {
  readonly name: string;
  /** Address to open, relative to the base URL. */
  readonly path: string;
  /** Moves the page into the state under test once it has loaded. Absent for a plain page. */
  readonly prepare?: (page: Page) => Promise<void>;
}

/** Opens the "Not right? Change place" disclosure on a plan page. */
async function openChangePlace(page: Page): Promise<void> {
  await page.locator('details.change-place > summary').click();
  await page.locator('details.change-place[open]').waitFor();
}

/** Submits the household form with nothing filled in, which shows the error summary. */
async function submitEmptyHousehold(page: Page): Promise<void> {
  await page
    .locator("form[action='/household/save']")
    .getByRole('button', { name: 'Make my plan' })
    .click();
  await page.locator('#error-summary').waitFor();
}

const SAMPLES = ['s1', 's2', 's3', 's4', 's5', 's6'] as const;

/**
 * Every page state the browser suite checks. The sample plans are built from live air, so the
 * suite never reads a number from them; it checks structure, colour and layout only.
 */
export const PAGES: readonly PageCase[] = [
  { name: 'home', path: '/' },
  { name: 'about', path: '/about' },
  { name: 'household form', path: '/household' },
  { name: 'household form with errors', path: '/household', prepare: submitEmptyHousehold },
  ...SAMPLES.map((id) => ({ name: `sample plan ${id}`, path: `/plan/sample/${id}` })),
  { name: 'sample community view s6', path: '/plan/sample/s6/community' },
  { name: 'sample plan s1 on the smog day', path: '/plan/sample/s1?air=smog-day' },
  {
    name: 'sample plan s1 with change place open',
    path: '/plan/sample/s1',
    prepare: openChangePlace,
  },
];
