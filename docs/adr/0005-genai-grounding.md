# 0005. GenAI grounding

Status: accepted. Date: 2026-11-22.

## Context

A language model can read a family's words well and can write a clear summary, but it can invent a number, soften a warning or follow instructions hidden in a text. A wrong air number or an "it is fine" for a child on a Severe day is the harm this product exists to prevent. The model must therefore never be the source of a fact or a decision, and what it writes must be checkable.

## Decision

Gemini proposes and code decides. The roles, with the prompts in `docs/PROMPTS.md`:

- **Reader and question.** Gemini returns JSON that fits a schema. Every value must come with a verbatim quote. Code keeps a value only if the quote is in the text (compared after Unicode NFKC, case folding and mapping Devanagari digits to ASCII) and the quote supports the value (ages by number, conditions and modes by word list with negation handling, times by clock reading, which also corrects "05:00" for "5 pm"). Everything else is dropped, and what is missing gets a labelled default. The family's text is wrapped as data and the prompt says never to follow it.
- **Summary and notice.** Gemini sees a facts object with placeholders (`member_1`, `routine_2`), no names, ages or conditions beyond the plan's sensitivity word. Code accepts the text only if every number is one the plan computed (digits, Devanagari digits and number words), every changed routine is named, no sentence naming a changed routine reassures, no placeholder is invented, it has no markup or link, it has the right script and sentence count, and (for a notice, or when anything changes) no sentence reassures at all. Dashes are rewritten before the check. Names are put back only after the checks, so a label can never reach a number or a decision.
- **Ladder.** The first model is `gemini-3.5-flash-lite` and the fallback is `gemini-3.1-flash-lite` (set in the environment). For the summary and notice, any failure moves to the fallback once, including a text that failed its checks. For the reader and question, a quota error, a timeout or an outage does. Then code takes over: a word-matching reader, a list of the plan's routines to pick from, or a template summary or notice built from the plan and labelled with the reason. A reply counts only if its status is `completed`.
- **Call shape.** One module, `src/server/genai/client.ts`, imports the SDK, builds a client per call, sends `store: false`, a 6 second timeout, a thinking level and an output cap, and classifies errors into the app's own kinds without copying the SDK's message.
- **On the plan page** (`src/server/auto-briefing.ts`) the English summary is requested when the page loads for live air data, waits up to 4 seconds, and is cached for 30 minutes through the framework cache under a hash of the facts, language and audience. The cache holds the text before names go in. A late reply still fills the cache for the next view, and a page with no air data or on the recorded smog day never asks. The buttons "Explain in Hindi with Gemini" and "Write it again with Gemini" ask again by POST, and the community notice is written only on request.
- Prompts are versioned files; every change bumps the version and adds a line to the changelog.

## Consequences

- Gemini can fail, be slow or run out of quota without breaking a page: every output has a code path.
- Recorded replies (`tests/fixtures/genai`) are replayed through the same code path in tests. They are never edited by hand: change the prompt, bump its version and record again (see CONTRIBUTING.md).
- The checks are lexical. They catch wrong numbers, missing routines and reassuring phrases from a word list; they cannot assess fluency, and a Hindi text can pass and still read stiffly.
- The free tier is a shared quota with no rate limiter (see [ADR 0007](0007-stateless-by-design.md)).
