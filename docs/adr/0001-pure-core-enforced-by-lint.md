# 0001. The core is pure, and lint enforces it

Status: accepted. Date: 2026-11-22.

## Context

Saans tells people when to keep a child indoors. Advice like that has to be reproducible: the same household, air data and moment must always give the same plan, and a reviewer must be able to test any decision with no network and no mocks. Decisions that quietly read the clock, the environment or a random number cannot be reproduced.

## Decision

All decisions live in `src/core`, which takes everything it needs as parameters:

- No clock: `Date.now()` and `new Date()` with no argument are lint errors. The current moment is passed in as `now`.
- No randomness: `Math.random()` is a lint error.
- No environment: `process.env` is a lint error. Configuration is passed in.
- No network: `fetch` is a lint error. I/O belongs to `src/server`.
- No Node built-ins, no framework, no server code: imports of `node:*`, `fs`, `path`, `crypto`, `react`, `next`, `server-only` and anything under `server` are lint errors in `src/core`.

The rules are ESLint selectors and import patterns in `eslint.config.mjs`. Two related rules apply elsewhere: only `src/server/genai/client.ts` may import the Gemini SDK, and `src/server` may not hold module-scope `let`, `var`, `Map` or `Set` (see [ADR 0007](0007-stateless-by-design.md)). A test, `tests/unit/lint-rules.test.ts`, runs ESLint on small snippets to prove each rule fires and each allowed case passes.

Data files in `src/data` are imported and parsed with zod when the module loads, so a typo in a rule fails every test instead of a family's page. That is the one kind of file access the core has.

## Consequences

- Core functions take more parameters, and callers in `src/server` do the plumbing (pass `now`, fetch the air series, then call `buildPlan`).
- Core tests need no mocks, which is why `src/core` can be held to a higher coverage bar (90% of lines) than the framework glue (80% overall).
- The lint rules catch the direct forms. They do not catch every indirect route (for example a clock reached through a helper in another package), so the boundary also relies on review.
- Moving a decision out of `src/core` is a visible change: it needs a lint override or an import from `src/server`, both of which show up in a diff.
