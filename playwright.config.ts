// Settings for the browser suite in tests/e2e: which browsers run, and how the app is started.
// The suite drives the production build, so run `npm run build` first (CI does).
import { randomBytes } from 'node:crypto';

import { defineConfig, devices } from '@playwright/test';

// The port is not 3000 so the suite never reuses a developer's dev server by accident.
const PORT = '3100';

// The two keys the app refuses to start without. They are made fresh on every run and exist only
// in this process and the server it starts, so no secret is stored for the tests.
const SEAL_KEY = randomBytes(32).toString('base64');
const FORM_KEY = randomBytes(32).toString('base64');

/** The Playwright settings: Chromium and Firefox against a production server on port 3100. */
export default defineConfig({
  testDir: 'tests/e2e',
  // A page is rendered on demand from live air data, so give one test room to wait.
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  forbidOnly: process.env.CI !== undefined,
  retries: process.env.CI === undefined ? 0 : 1,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: { baseURL: `http://localhost:${PORT}`, trace: 'retain-on-failure' },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    // Firefox runs the place paths, where browsers differ (the location prompt and its answer).
    // Accessibility, reflow and focus order are checked once, in Chromium.
    { name: 'firefox', use: { ...devices['Desktop Firefox'] }, testMatch: /places\.spec\.ts$/ },
  ],
  webServer: {
    command: `npx next start -p ${PORT}`,
    url: `http://localhost:${PORT}/api/health`,
    reuseExistingServer: process.env.CI === undefined,
    timeout: 120_000,
    // The two API keys are set to empty, which the app reads as "not set", so a key in the
    // developer's shell cannot switch on a call to either service: the app takes its code paths.
    env: { SEAL_KEY, FORM_KEY, GEMINI_API_KEY: '', OPENAQ_API_KEY: '' },
  },
});
