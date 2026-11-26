# Saans: conventions for contributors and coding agents

- Decisions live in `src/core`, which is pure: no clock, no randomness, no environment, no network, no framework. Pass those in as parameters.
- I/O lives in `src/server`. It holds no module-scope mutable state, and only `src/server/genai/client.ts` may import the Gemini SDK.
- Every row in `src/data` carries a `source`. Add the source with the row or do not add the row.
- Run `npm run verify` before committing. `npm run check:repo` reads `git ls-files`, so run it after staging or committing new files.
- Commits are Conventional Commits. Stage explicit paths. Never commit `.env` files or `.planning/`.
- Every source file starts with a header comment and every export has a doc comment. Comments say why, and change with the code they describe (see CONTRIBUTING.md).
- Plain CSS with custom properties in `src/app/globals.css`. No CSS framework, no external fonts or images.
