# Contributing

Thanks for helping. The conventions in [AGENTS.md](AGENTS.md) apply to people and coding agents alike. This page covers the jobs you are most likely to do.

## Set up

Node 24 or later. Run `npm ci`, copy `.env.example` to `.env` and fill it in (see the README), then `npm run dev`.

## Add or change a rule or an advice row

Advice is data, not code ([ADR 0009](docs/adr/0009-rules-as-sourced-data.md)). Rows live in `src/data`:

| File                                       | What a row is                                                                                                                                       |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `rules.json`                               | A decision grid row (level, sensitivity, intensity, essential trip), a guard, protection lines, a top action, and the `sources` table they point at |
| `indoor.json`                              | Home advice: airing, heating, cooking, purifier, habits, myths                                                                                      |
| `transit.json`                             | Trip rules and the transport operators of a city                                                                                                    |
| `community.json`                           | Actions for a society, school or office                                                                                                             |
| `grap.json`                                | The GRAP stage listed for an AQI band in Delhi NCR                                                                                                  |
| `naqi.json`                                | CPCB breakpoints, band wording and the app rules for the AQI                                                                                        |
| `commute-exposure.json`, `inhalation.json` | Numbers behind the impact lines                                                                                                                     |

To add or change a row:

1. Find the row's source first. If you cannot name one, the row is a Saans choice: give it the `APP` status and say so in its title.
2. Give the row a source with an `id`, a `title`, a `url` and a `status`:
   - `P-READ`: you read the official document's text yourself. Add a `quote`: the exact words, with only scan errors corrected (and say so in the title).
   - `P-FETCH`: you read an official page through a summary or a paraphrase. Give the link and no quote. Recheck the wording against the source before you rely on it.
   - `APP`: no authority gives the number. The title starts with "Saans", and the `url` is empty.
3. Edit the row. Every file is parsed with a strict zod schema when it loads, so a wrong key or value fails every test, not a family's page. Use the same fact names and values the schema lists.
4. A decision row goes in the grid in order from most to least specific, because the first match wins. Check it against the neighbouring rows.
5. Write or update a test in `tests/unit` that shows the row firing for a household and an air case, and one that shows what it does not do. The data-source test (`tests/unit/data-sources.test.ts`) checks that every source in every data file has the right shape for its status.
6. Every number in advice text must be one the page really shows. The checker for Gemini's summary allows only the numbers the plan computed, so a number that appears in a row but not on the page can make a good summary fail its check.

Do not put a source's name or a threshold in code. If the engine needs a new kind of fact, add it to the schema and the rule matcher and say why in the commit message.

## Re-record fixtures

Two kinds of recording exist and neither is ever edited by hand. A hand-edited recording is not evidence of anything.

- **Air data and place search.** `npx tsx scripts/record-fixtures.ts` makes real calls to Open-Meteo. It rewrites `src/data/recorded/*.json` (the five sample places and the recorded smog day) and `tests/fixtures/geocode/*.json`. Each file keeps its URL and retrieval time. Run it by hand, read the diff, and run `npm run verify`, because plans built on new air can change test expectations. Commit the recordings on their own.
- **Gemini replies.** `npx tsx --conditions=react-server scripts/record-genai.ts` makes about seven real calls with the `GEMINI_API_KEY` from your `.env` and saves each reply, with its provenance (case, prompt version, model, date, status and input), under `tests/fixtures/genai`. The options are `--only <case>`, `--env <dir>` and `--dry`. It never prints the key. To change a recording, change the prompt, bump its version in `src/server/genai/prompts/`, add a line to the changelog in `docs/PROMPTS.md`, and record again.

## Check your work

`npm run verify` runs the type check, lint, format check, tests and the repository checks (no private paths tracked, no em-dashes or en-dashes in tracked text, size report). `npm run check:repo` reads `git ls-files`, so stage new files before running it. `npm run coverage` enforces the coverage thresholds, and `npm run build` makes the production build. Tests run offline: any unmocked network call fails.

Formatting is Prettier (`npm run format`). Comments are brief and say why, not what.

## Commits

- Conventional Commits, in the form `type(scope): subject`, for example `feat(core): ...`, `fix(server): ...`, `test: ...`, `docs: ...`.
- One logical change per commit. Stage explicit paths (`git add path/to/file`); do not use `git add -A` or `git add .`.
- Never commit `.env` files, keys or private notes.
- Do not write dashes of the em or en kind anywhere in tracked text. Use a comma, colon or parentheses.
