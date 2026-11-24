# Prompts

Saans uses Gemini for four jobs. Each prompt is a versioned file under `src/server/genai/prompts/`.
The static instructions come first and the part that varies (the family's text, or the facts) comes
last, so Google's implicit caching can reuse the fixed part. Every call sends `store: false`, a
6 second timeout, a low thinking level and a cap on output tokens, and is accepted only when the
reply is a finished text (`status` is `completed`).

Models: `gemini-3.5-flash-lite` first, then `gemini-3.1-flash-lite` (set with `GEMINI_MODEL_READER`,
`GEMINI_MODEL_WRITER` and `GEMINI_MODEL_FALLBACK`). Without `GEMINI_API_KEY` nothing is sent and
every job takes its no-AI path.

## The principle

Gemini proposes and code decides. A reply is never shown, saved or acted on until code has checked
it against something the model cannot change: the family's own words, or the numbers the plan
computed. What fails a check is dropped, and the family sees a labelled fallback instead.

## Reader

- File: `prompts/reader.ts`. Version: `reader-2`.
- Purpose: turn a family's own words (English, Hinglish or Hindi) into a household profile.
- Settings: temperature 0, thinking `low`, up to 3000 output tokens, JSON reply that fits a schema.
- Gemini does: reads the text, names the place, members, routines, home and question, and quotes
  the words each value came from. It is told that the text is data and never instructions.
- Code does: drops a value whose quote is not in the text. Keeps a value only when its quote says
  it (ages by number, conditions and modes by word list, times by clock reading, durations,
  distances and days by their own readers). Maps ages to age bands, resolves the place, fills each
  missing value with a stated default and a note, and validates the whole household against the
  profile schema.
- Checks: quote in text (case, accents, quotes and Devanagari digits ignored); value supported by
  its quote; times read in code from "5 pm", "6:30 am", "9 baje" and the like, so a model that
  writes 05:00 for "5 pm" is corrected; a stated age such as "father is 72" is read when the age
  word or "is" sits next to the person, and a number followed by a unit, a temperature, a weight or
  a floor is not taken as an age; a routine word is accepted in its inflected forms ("walks",
  "jogging", "cycled") when the family wrote it that way; a daily phrase ("every morning") gives
  seven days only when the quote names no weekday, so named weekdays win; a question is kept only
  when it points at someone in the household and reads as a question (a question mark, a question
  word such as "can" or "kya", or an opener such as "is", "do" or "safe"), so a statement echoed
  back as a "question" is dropped.
- Failure: the fallback model on quota, timeout or an outage; then a word-matching pass reads the
  same text and its output goes through the same checks, with a note that it was read by matching
  words.

## Question

- File: `prompts/question.ts`. Version: `question-1`.
- Purpose: sort one question about the plan into an intent (`can_i`, `what_if_time`,
  `what_if_mode`, `explain`), the member or routine it is about, and a new time or way of
  travelling.
- Settings: temperature 0, thinking `low`, up to 800 output tokens, JSON reply.
- Gemini does: classifies the question and quotes the words behind each part. It is sent only the
  question, never the household.
- Code does: matches the quoted words to the household's member labels and routine kinds, reads a
  new time from its quote, and maps everything to the household's own ids.
- Checks: the same quote checks as the reader. A what-if without a checkable new time or mode
  becomes a plain question; a question with nothing left to act on is reported as unclear and the
  page offers the plan's routines to pick from.

## Briefing

- File: `prompts/briefing.ts`. Version: `briefing-2`.
- Purpose: a short, kind summary of the day for the family, 4 to 6 sentences, in English or Hindi.
- Settings: temperature 0.3, thinking `minimal`, up to 1200 output tokens, plain text.
- When it runs: the plan page asks for the English summary when it loads (live air data only; the
  recorded smog-day view and a page with no air data never ask), waits up to 4 seconds, and shows
  the code-built summary if the wait ends or the text is not accepted. The two buttons on the page
  ask again by POST, one of them for Hindi, and a reply from a button is carried back sealed in the
  address.
- Gemini does: words the plan. It is sent a facts object with placeholders only (`member_1`,
  `routine_2`), no names, ages or health conditions beyond the plan's sensitivity word, plus the
  rounded numbers, decisions, windows and impact sentences. For Hindi it is sent the structure
  without the English sentences, because a model asked to translate prose tends to copy it, and
  code supplies the Hindi words for each decision, the air level and the day, which the model
  copies as given.
- Code does: checks the text, then puts the family's labels in place of the placeholders. The
  checked text is cached for 30 minutes (framework cache, best effort) under a hash of the facts,
  language and audience; the cache holds the text before names go in.
- Checks: every number is one the plan computed (ASCII and Devanagari digits, number words);
  every routine the plan changes is named; no sentence naming a changed routine reassures; no
  placeholder the plan never gave; the right script for the language, and no English sentence in a
  Hindi text; no markup; dashes become words; no mention of a question when the family asked
  none. After names go in, a leftover placeholder falls back
  to the template.
- Failure: any failed check or error sends the request to the fallback model once; then a template
  built in code from the plan, labelled with the reason. A Hindi request that falls back gets the
  English template and a note that Hindi is unavailable.

## Notice

- File: `prompts/notice.ts`. Version: `notice-1`.
- Purpose: a short notice for a society, school or office to copy, 3 to 5 sentences.
- Settings: as the briefing.
- Gemini does: words the community facts (day, level, the cleanest outdoor window, the actions
  the plan picked). It is sent no names.
- Code does and checks: as the briefing, plus no reassurance in any sentence.
- Failure: as the briefing, with a template notice.

## What is recorded

`npx tsx --conditions=react-server scripts/record-genai.ts` makes real calls (eight) and
saves each reply, minified and with its provenance, in `tests/fixtures/genai/`. The tests replay
those replies through the same code path the app uses. Replies are never edited by hand: change a
prompt, bump its version, record again.

## Changelog

| Date       | Prompt   | Version    | Change                                                                                                                                                                                                  |
| ---------- | -------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-11-22 | reader   | reader-1   | First version. Every value carries a verbatim quote; the text is marked as data; times are read in code.                                                                                                |
| 2026-11-22 | reader   | reader-2   | An age quote must carry its year word; the purifier rating can be in cfm or m3/h, so its quote carries the unit and a bare rating is left out and asked for.                                            |
| 2026-11-22 | question | question-1 | First version. Sorts one question into an intent, a target and a new time or mode, each with a quote.                                                                                                   |
| 2026-11-22 | briefing | briefing-1 | First version. Placeholders only, 24-hour times, no reassurance, English or Hindi. Hindi gets structure without English prose after a first recording copied the English sentences into the Hindi text. |
| 2026-11-24 | briefing | briefing-2 | Hindi facts carry Hindi words from code for each decision, the band and the day, so the Hindi text no longer copies English codes. Hindi reassurance phrases added to the tone check.                   |
| 2026-11-22 | notice   | notice-1   | First version. Community facts only, no reassurance.                                                                                                                                                    |
