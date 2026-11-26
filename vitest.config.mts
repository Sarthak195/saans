// Test runner settings: how '@' and 'server-only' resolve, which files are tests, and the
// coverage bar. Tests live under tests/ and run in Node unless a file opts in to a DOM.
import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      // The same '@' alias as the app, so tests import code exactly as the source does.
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      // The real package throws outside a React Server Component, which would make every
      // server module untestable. `next build` still resolves the real one, so the
      // guarantee that server code never reaches a client bundle is unchanged.
      'server-only': fileURLToPath(new URL('./tests/stubs/server-only.ts', import.meta.url)),
    },
  },
  // Which files run as tests, what runs first, and how long one may take.
  test: {
    // Node by default; a test that needs a DOM opts in with a `@vitest-environment jsdom` comment.
    environment: 'node',
    // The first ESLint run in lint-rules.test.ts parses the project cold, which can pass 5 s on a
    // busy machine.
    testTimeout: 20_000,
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/**/*.test.{ts,tsx}'],
    // Coverage is measured with V8 over all source files. The minimums are line percentages.
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
      reporter: ['text', 'json-summary'],
      thresholds: {
        lines: 80,
        // Decisions live in src/core, so it is held to a higher bar than framework glue.
        'src/core/**': { lines: 90 },
      },
    },
  },
});
