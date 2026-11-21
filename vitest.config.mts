import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      // The real package throws outside a React Server Component, which would make every
      // server module untestable. `next build` still resolves the real one, so the
      // guarantee that server code never reaches a client bundle is unchanged.
      'server-only': fileURLToPath(new URL('./tests/stubs/server-only.ts', import.meta.url)),
    },
  },
  test: {
    // Node by default; a test that needs a DOM opts in with a `@vitest-environment jsdom` comment.
    environment: 'node',
    // The first ESLint run in lint-rules.test.ts parses the project cold, which can pass 5 s on a busy machine.
    testTimeout: 20_000,
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/**/*.test.{ts,tsx}'],
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
