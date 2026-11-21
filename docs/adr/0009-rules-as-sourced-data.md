# 0009. Rules as sourced data

Status: accepted. Date: 2026-11-22.

## Context

The advice is the product, and it quotes health authorities. A family, a clinician or a reviewer must be able to ask "why does it say this?" and get a source, and a maintainer must be able to change a threshold without reading the engine. Rules buried in code get out of date silently and cannot show where they came from. Some choices have no authority behind them (a school day is 08:00 to 14:00, a window must cut PM2.5 by 20 percent), and those must not be dressed up as official.

## Decision

Rules are rows of data in `src/data`, each with a source, and a small rule matcher applies them.

- **Rows.** `rules.json` (the decision grid of level, sensitivity, intensity and essential trip; guards; protection lines; top actions), `indoor.json`, `transit.json` (trip rules and operators), `community.json`, `grap.json`, `naqi.json`, `commute-exposure.json`, `inhalation.json` and `samples.json`. Each is parsed with a strict zod schema when the module loads, so a missing field or a typo fails every test.
- **Rule matcher.** `src/core/rules/evaluate.ts` matches a row when every fact it names equals one of the listed values. The decision grid takes the first match, so rows run from most to least specific. Lists of advice take every match and sort by priority. Rows with priority 0, the carbon monoxide guards for coal or gas heating and the biomass and kerosene cooking rows, come first, before any "keep windows shut" advice.
- **Source and status.** Every row's source has an id, a title, a link and a status:
  - `P-READ`: the official document's text was read directly. The row carries a quote, and the schema rejects a `P-READ` row without one.
  - `P-FETCH`: an official page was read through a page summary, so the wording is a paraphrase and should be rechecked against the source before being relied on. The row needs a link and carries no quote, because a paraphrase must not sit between quote marks (a data test enforces this).
  - `APP`: a choice Saans made where no authority gives a number. Its title must start "Saans", and in the data files its link is empty.
- **What a family sees.** Each piece of advice shows its reason followed by "Source: <link>". A `P-READ` or `P-FETCH` row shows its source title as a link. An `APP` row shows "Saans rule" with no link. The status code itself is not shown. Rows from a CPCB band point at CPCB's own health statement for that band.

## Consequences

- Changing advice means editing a row and its source, with a test, not editing the engine. CONTRIBUTING.md describes the steps.
- Some rows are `P-FETCH` and need their wording checked against the primary source. They are listed in the README's known gaps.
- A row is only as good as its source. The AQI bands and CPCB statements are from a 2014 CPCB document read through an archive copy, and the MoHFW advisory text was read from a scanned PDF with corrections for scan errors, which the titles of those rows say.
- Because every app rule is labelled "Saans rule" on the page, a reader can tell a published guideline from a Saans default.
