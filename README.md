# Saans

Saans ("breath") is a web app that gives an Indian family a plan for the day when the air is poor. It reads live air data for the family's place, works out the Indian AQI itself, and tells each person which outdoor routines to keep, lighten, move to a cleaner hour or bring indoors, with the reason, its source and the computed effect.

Code decides every number and every piece of advice. Gemini reads the family's own words, rewrites the plan as a short summary, and writes a community notice, and code checks what it writes before anyone sees it.

## Contents

- [The challenge](#the-challenge)
- [How the statement maps to Saans](#how-the-statement-maps-to-saans)
- [Try it](#try-it)
- [How it works](#how-it-works)
- [Approach and logic](#approach-and-logic)
- [What Gemini does and what code does](#what-gemini-does-and-what-code-does)
- [Data sources and attribution](#data-sources-and-attribution)
- [Assumptions](#assumptions)
- [Privacy and security](#privacy-and-security)
- [Accessibility](#accessibility)
- [Running locally](#running-locally)
- [Measurements](#measurements)
- [Known gaps](#known-gaps)
- [More documents](#more-documents)

## The challenge

Chosen vertical: **Urban Air Quality Assistant**. The problem statement, as it appears on the challenge slide:

> Create a GenAI-powered assistant that helps families and communities navigate severe winter smog and urban air pollution. The application should suggest low-emission daily routines, indoor air quality hacks, and sustainable alternatives tailored to their location and lifestyle, while clearly explaining the direct impact of their choices.

## How the statement maps to Saans

| Phrase of the statement                               | What Saans does                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Where                                                                                                                                                    |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GenAI-powered assistant                               | Gemini reads a family's own words (English, Hindi or Hinglish) into a profile, classifies follow-up questions, writes the plan summary and the community notice. Every output is checked in code.                                                                                                                                                                                                                                                                                                                                                                  | `src/server/genai/`, `src/app/ask/route.ts`, `src/app/plan/[token]/ask/route.ts`, `src/server/auto-briefing.ts`                                          |
| families and communities                              | A household of up to 6 members and 8 routines. A community view for a housing society, school or office, with a best outdoor time, sourced actions, a car-km aggregate and a notice to copy or share.                                                                                                                                                                                                                                                                                                                                                              | `src/core/profile/schema.ts`, `src/core/community/`, `src/components/community-view.tsx`                                                                 |
| severe winter smog and urban air pollution            | AQI today by the CPCB method, hourly PM2.5, best and worst three-hour blocks, a banner on a Very Poor or worse day, a GRAP note for Delhi NCR, and a recorded real smog day to compare against.                                                                                                                                                                                                                                                                                                                                                                    | `src/core/aqi/`, `src/core/plan/glance.ts`, `src/components/plan-day.tsx`, `src/data/recorded/delhi-smog-2025-12-13.json`                                |
| low-emission daily routines                           | Each routine is kept, lightened, moved to a cleaner window, brought indoors or protected, by rule. Trip advice covers combining errands, sharing a ride and not idling.                                                                                                                                                                                                                                                                                                                                                                                            | `src/core/plan/advice.ts`, `src/core/plan/windows.ts`, `src/data/rules.json`, `src/core/alternatives/`                                                   |
| indoor air quality hacks                              | When to air the home, a carbon monoxide guard for coal and gas heaters, kitchen and fuel advice, purifier sizing against the room, a box-fan filter, habits (incense, coils, smoking, candles) and myth checks.                                                                                                                                                                                                                                                                                                                                                    | `src/core/home/`, `src/data/indoor.json`                                                                                                                 |
| sustainable alternatives                              | Per trip, using the transport the family's city really has (only some cities have listed operators): walk or cycle short trips, public transport for mid and long ones, carpooling.                                                                                                                                                                                                                                                                                                                                                                                | `src/core/alternatives/`, `src/data/transit.json`                                                                                                        |
| tailored to their location                            | Any place in India: a built-in list of places, then the Open-Meteo place search, or a device location rounded to 0.1 degree. An address is read as a name and a larger place ("Dwarka, Delhi", "Sector 62, Noida", "Noida Sector 62"), and a place or location given on the home page is kept through the household form. The resolved place is printed on the plan with a "Not right? Change place" control, and the same household can be planned somewhere else. With a free OpenAQ key, the nearest recent street monitor within 10 km is shown under the AQI. | `src/server/geo/`, `src/data/places.json`, `src/app/plan/[token]/place/route.ts`, `src/server/air/openaq.ts`                                             |
| and lifestyle                                         | Age band, conditions, routines (kind, time, length, intensity, mode, distance, days, flexibility, free hours) and home details drive the rules.                                                                                                                                                                                                                                                                                                                                                                                                                    | `src/core/profile/schema.ts`, `src/core/plan/sensitivity.ts`, `src/core/plan/advice.ts`                                                                  |
| clearly explaining the direct impact of their choices | Every item shows why (the rule and a link to its source, or "Saans rule") and a computed impact: percent less PM2.5 from a cleaner hour, less air breathed per minute from an easier pace, in-vehicle exposure from a mode change, purifier shortfall, car-km avoided. When a nearby monitor reads worse than the model for the same hour, the plan header says so and today's advice for the next few hours uses the worse level.                                                                                                                                 | `src/core/impact/`, `src/core/alternatives/exposure.ts`, `src/core/plan/station.ts`, `src/components/routine-item.tsx`, `src/components/source-link.tsx` |
| real-time data with source and timestamp              | Hourly PM2.5, PM10, NO2, O3, CO and SO2 from Open-Meteo (CAMS) for the place, fetched per plan. Each reading shows the source, grid point, data hour and fetch time, in IST. With an OpenAQ key, the latest PM2.5 and PM10 from the nearest recent monitor, with its name, distance and time. Gemini never produces an air number.                                                                                                                                                                                                                                 | `src/server/air/`, `src/components/air-section.tsx`                                                                                                      |
| personalisation                                       | Two households in the same city get different plans from the same air, and one household in two cities gets different air and plans.                                                                                                                                                                                                                                                                                                                                                                                                                               | `tests/unit/plan-recorded.test.ts`                                                                                                                       |
| sample inputs                                         | Six sample households at stable addresses, listed on the home page and below. Two of them show the own-words reader.                                                                                                                                                                                                                                                                                                                                                                                                                                               | `src/data/samples.json`, `src/core/profile/samples.ts`, `src/components/sample-intro.tsx`                                                                |

## Try it

The six sample households are made up. Each has a stable address that needs no input and is built from the current air for its place.

| Address           | Household                                                                                                                   | What it shows                                                                                                                           |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `/plan/sample/s1` | Lajpat Nagar, Delhi. A grandmother with asthma, a 7-year-old son and a parent who drives to Gurugram. Described in English. | The worked example: "can my son play cricket this evening?", answered first. Asthma, incense and a 180 sq ft room feed the home advice. |
| `/plan/sample/s2` | Lajpat Nagar, Delhi. One 26-year-old who runs at 6 am and rides a scooter 9 km. Described in Hinglish.                      | The same city, a different plan. The own-words reader handles Hinglish.                                                                 |
| `/plan/sample/s3` | Andheri, Mumbai. A couple and a one-year-old, train commute, an evening pram walk. Set up with the form.                    | Another city, and an infant.                                                                                                            |
| `/plan/sample/s4` | Salt Lake, Kolkata. A retired couple, one with a heart condition, a 6 am walk and a coal heater. Set up with the form.      | Older adults, and the carbon monoxide guard that comes before any "keep windows shut" advice.                                           |
| `/plan/sample/s5` | Indiranagar, Bengaluru. Two adults and two children, a school walk and evening play. Set up with the form.                  | A day with better air still gets alternatives and impact.                                                                               |
| `/plan/sample/s6` | Sector 62, Noida. A primary school of about 300 families with assembly, PE and sports practice. Community sample.           | The community view and the notice (`/plan/sample/s6/community`).                                                                        |

A two-minute tour:

1. Open `/plan/sample/s1`. Read **Your answer** at the top: it answers the cricket question for the evening, or for the next evening if today's has passed, and says so.
2. Read **In short**, the plain summary, and note whether it says it was written by Gemini or by Saans.
3. Open **Air today** for the AQI, its band, the source line and the "Why this can differ from the Sameer app" note, then **Hour by hour** for the day's PM2.5 with each routine marked.
4. In the timeline, open **Try another time or mode** on a routine, move it, and read the before and after line.
5. Open **Not right? Change place**, type another city, and see the same household planned there.
6. Follow "See the view for a society, school or office" to the community view, or open `/plan/sample/s6/community` directly.
7. Back on the plan, follow "See this plan on a recorded smog day" to see the same household on a real Delhi smog day (13 Dec 2025, labelled as recorded and not live).

On `/plan/sample/s1` and `/plan/sample/s2` the button "Read it with Gemini" runs the real reader on the text the household was described with.

## How it works

1. **Home page (`/`).** A live strip shows Delhi's AQI with no input. Below it are the sample links and a box for the family's own words (up to 1,500 characters) with a place field. Without JavaScript a "Use this example" link fills the box on the server.
2. **POST `/ask`.** The request must pass the same-origin check, a body cap and a signed form token. The reader (Gemini, or a word-matching pass when Gemini is unavailable) turns the text into a household. The place is resolved from the built-in list of places and then the Open-Meteo place search. Anything missing gets a labelled default. The household is sealed and the visitor is redirected (303) to `/plan/<token>`.
3. **Plan page.** The page opens the token, fetches air data for the place (and, when an OpenAQ key is set, looks for a nearby monitor), and calls the pure core to build the plan, the home advice, the alternatives and (for a community) the community view. It then renders the page and the summary.
4. **Forms on the plan page** (what-if, place change, "Ask about this plan", explain buttons) are plain POSTs that answer with a 303 to a new sealed link or a sealed written text.

The pieces that matter:

- **The pure core.** `src/core` makes every decision and holds no clock, randomness, environment, network or framework. Time and data come in as parameters, and lint rules enforce it ([ADR 0001](docs/adr/0001-pure-core-enforced-by-lint.md)).
- **The sealed link.** A household is deflated and encrypted (AES-256-GCM) into the address, so the link is the profile ([ADR 0004](docs/adr/0004-sealed-links-and-written-text.md)).
- **No database.** There is no database, session or in-memory rate limiter. The only caches are the framework's ([ADR 0007](docs/adr/0007-stateless-by-design.md)).

## Approach and logic

**The AQI is computed in code.** Open-Meteo returns concentrations, not the Indian AQI. Saans takes the 24 hours ending at the latest data hour, averages PM2.5 and PM10 (each needs at least 16 valid hours), applies the CPCB sub-index formula to each, and reports the larger as the AQI with CPCB's band name and health statement. Gases are averaged and shown in a table and never change the headline. [ADR 0002](docs/adr/0002-aqi-method-and-the-two-numbers.md) has the details and what is an app rule.

**Two numbers are shown, and they are not the same thing.**

- _AQI today_: the 24-hour CPCB-method estimate above. It describes the day.
- _PM2.5 by the hour_: the hourly forecast, rounded to the nearest 5, with a level word taken from the CPCB PM2.5 breakpoints used as a yardstick. It is not an official hourly AQI. Every routine decision uses this number, because routines happen at particular hours.

**Decision rules are sourced data.** For each routine on the plan day, Saans takes the mean hourly PM2.5 over its hours, finds the level, and matches the first row of `src/data/rules.json` that fits the level, the member's sensitivity (high, raised or general, derived from age band and conditions), the intensity and whether the trip is essential (a commute or school run). The outcome is one of keep, lighten, move, indoors or essential (keep the trip, with protection). Each row carries its source. The page shows the fired rule's reason with its source. [ADR 0009](docs/adr/0009-rules-as-sourced-data.md) explains the status codes.

**A nearby monitor can tighten today's advice, never the AQI.** With an OpenAQ key, Saans looks for the three nearest fixed monitors within 10 km of the place that reported in the last 4 hours, and uses the nearest one that has a fresh PM2.5 value. The reading is shown under the AQI on every plan day ("Measured nearby: ... via OpenAQ"), beside the model number and never blended into it. The precaution rule (`src/core/plan/station.ts`) applies to today's live plan only. It compares the monitor's PM2.5 with the model's PM2.5 for the hour the monitor measured, both through the same hourly level words. When the monitor's level is worse, the plan header says so, and today's advice for the current hour and the next 3 hours reads the higher of the two values, so the routine decisions and the cleanest window avoid those hours. Later days, the recorded views and a reading older than 4 hours change nothing. Any OpenAQ failure means no monitor, and the page is the same as without a key.

**Cleaner windows.** When a routine should move, the search tries the same length at whole-hour shifts within the routine's flexibility, inside the plan day, not earlier than now, inside any free hours, and with data for every hour. On a Poor or worse day nothing before 10:00 or after 19:00 is offered, and children, infants, under-5s and older adults stay within 07:00 to 19:00. A window is offered only if it lowers the level or cuts PM2.5 by at least 20 percent, and lands in a level the person can be moved to. Otherwise the routine falls back to indoors.

**The day at a glance** shows the best and worst three-hour blocks between 06:00 and 22:00, the one action that matters most, and when to open windows (the cleanest hour from 12:00 to 16:00 on a poor day, the window MoHFW names). The plan treats the day as severe when AQI today is 301 or more or any three hours in a row are Very Poor or worse. On such a day the top action follows the routine decisions: it says to keep hard exercise and outdoor play indoors only when the plan has brought them indoors, and otherwise points to the hours the plan picked for them.

**Impact maths** (each impact is a function in `src/core/impact/` or `src/core/alternatives/`):

- A cleaner hour: percent less = (before minus after) divided by before, on the mean PM2.5 of the same activity at the same length, rounded to the nearest 5 and kept between 0 and 100. Breathing rate cancels out.
- An easier pace: the fall in air breathed per minute, from US EPA mean breathing rates for the member's age band (our ratio, not an EPA figure).
- Indoors: no percentage, because indoor air is usually cleaner but not clean.
- A mode change: in-vehicle PM2.5 ratios measured on one Delhi route in 2014 (Goel et al. 2015), shown only when the difference is at least 10 percent, with the caveat on the page.
- Purifier: needed clean air delivery rate is 0.65 cfm per sq ft (US EPA), compared with the family's unit. Taller ceilings get a note, not a scaled number.
- Community: households times a 6 km round trip times 5 days is car-km a week, with the assumption stated. No carbon dioxide figure is shown.

**Plan day.** The plan opens on today before 17:00 IST and on tomorrow after it. Today, Tomorrow and Day after are one click apart. All times are IST ([ADR 0008](docs/adr/0008-time-and-ist.md)).

## What Gemini does and what code does

Gemini proposes, code decides. Models are `gemini-3.5-flash-lite`, then `gemini-3.1-flash-lite` as the fallback (set in the environment). Without a key, or when the quota runs out, every job takes its code path. Prompts are versioned files; see [docs/PROMPTS.md](docs/PROMPTS.md).

| Job                                       | Gemini does                                                                                                                                                                | Code does                                                                                                                   | How the output is checked                                                                                                                                                                                                                     | If it fails                                                                                                                                     |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Reader (home page, "Read it with Gemini") | Reads the family's text into members, routines, home, place and question, each value with a verbatim quote.                                                                | Maps ages to bands, reads times and durations itself, resolves the place, fills labelled defaults, validates the household. | The quote must appear in the text (case, accents and Devanagari digits ignored) and must support the value. A model time of "05:00" for "5 pm" is corrected from the quote.                                                                   | On quota, timeout or outage the fallback model; then a word-matching pass whose output goes through the same checks, with a note.               |
| Question ("Ask about this plan")          | Sorts one question into an intent (can I, what if the time changes, what if the mode changes, explain) and what it points at. Sees only the question, never the household. | Matches the quoted words to the household's own members and routines and re-plans for what-ifs.                             | Same quote checks. A what-if without a checkable new time or mode becomes a plain question; nothing usable is reported as unclear.                                                                                                            | The page offers the plan's routines to pick from.                                                                                               |
| Summary ("In short")                      | Words the plan in 4 to 6 sentences, in English or Hindi, from facts with placeholders (member_1, routine_2), no names.                                                     | Makes every decision and number, puts the family's labels in after the checks.                                              | Every number is one the plan computed (digits, Devanagari digits and number words). Every changed routine is named and none is reassured about. No invented placeholder, no markup, no links, the right script, no English sentence in Hindi. | One try on the fallback model, then a summary built in code, labelled with the reason. A Hindi request that falls back gets English and a note. |
| Notice (community view)                   | Words the community facts in 3 to 5 sentences.                                                                                                                             | Picks the actions, the window and the aggregate.                                                                            | As the summary, plus no reassuring sentence at all.                                                                                                                                                                                           | A notice built in code, labelled.                                                                                                               |

On the plan page the English summary is requested automatically when the page loads, waits up to 4 seconds, and is cached for 30 minutes under a hash of the facts, language and audience (the framework cache, best effort). If the wait ends, a check fails or Gemini is unavailable, the page shows the summary built in code and says so. Pages with no air data and the recorded smog-day view never ask Gemini. The buttons "Explain in Hindi with Gemini" and "Write it again with Gemini" ask again, and the written text they return is sealed into the address. The community notice is written only when the visitor presses "Write it with Gemini". Each model call has its own 6 second timeout.

Gemini is never asked for an air value, a decision, a band or a link. [ADR 0005](docs/adr/0005-genai-grounding.md) has the full design.

## Data sources and attribution

Air quality data: Open-Meteo.com (CC BY 4.0), CAMS global model; place names: GeoNames.

| Use                                                        | Source                                                                                                                                                                                                                |
| ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Hourly air data and 72-hour forecast                       | [Open-Meteo Air Quality API](https://open-meteo.com/en/docs/air-quality-api), CAMS global model, about 45 km grid, one request per plan covering the past day and the next four days                                  |
| Nearby monitor reading (optional)                          | [OpenAQ](https://docs.openaq.org) v3 API, read with a free key: the three nearest fixed monitors within 10 km that reported in the last 4 hours, and the nearest one with a fresh PM2.5 value. Needs `OPENAQ_API_KEY` |
| The monitors behind it                                     | The Central Pollution Control Board (CPCB) network, which includes stations run by state pollution control boards, as OpenAQ lists them. Their readings reach OpenAQ about 2 to 3 hours behind real time              |
| Place search                                               | [Open-Meteo Geocoding API](https://open-meteo.com/en/docs/geocoding-api) (GeoNames data), after a built-in list of places                                                                                             |
| AQI breakpoints, formula and health statements             | CPCB, National Air Quality Index (2014)                                                                                                                                                                               |
| Health advice, schools, home, masks                        | Ministry of Health and Family Welfare (MoHFW), Advisory on Air Pollution and Health, November 2025                                                                                                                    |
| GRAP stages and citizens charter                           | Commission for Air Quality Management (CAQM), Graded Response Action Plan for the NCR, revision 21 Nov 2025; CAQM Advisory No. 18 via the Press Information Bureau                                                    |
| Purifier sizing, respirators for children, breathing rates | US EPA: Guide to Air Cleaners in the Home; wildfire smoke guidance; Exposure Factors Handbook 2011, Table 6-2                                                                                                         |
| Commute exposure by mode                                   | Goel et al. 2015, Atmospheric Environment 123                                                                                                                                                                         |
| Mosquito coils, plants, box-fan filters, idling            | Liu et al. 2003; Cummings and Waring 2020; Holder et al. 2022; PIB note on switching off at 15 seconds                                                                                                                |
| Public transport operators                                 | The operators' own websites, listed per city in `src/data/transit.json`                                                                                                                                               |

Every data row carries its source, title and link; the full list is in `src/data`.

**Station data terms.** OpenAQ's terms of use ([docs.openaq.org/about/terms](https://docs.openaq.org/about/terms)) say it aggregates only data that, to the best of its knowledge, was made available for redistribution; that users must acknowledge OpenAQ and, when required, the original source; that users must review the terms of each data provider; and that an API key belongs to one individual and may not be transferred. OpenAQ sets no licence of its own on the CPCB records Saans reads: the `licenses` field is empty for the CPCB locations around the five sample places (the API's answer, checked on 24 Nov 2026), and OpenAQ's licences are set per record. CPCB's own real-time air quality dataset on data.gov.in states the Government Open Data License - India ([data.gov.in catalog page](https://www.data.gov.in/catalog/real-time-air-quality-index)), which asks for the source to be acknowledged. Saans therefore names OpenAQ and the monitor on the line that shows a reading. It does not store or redistribute station data: it keeps nothing but the framework cache (the monitor list for 3 hours, the latest readings for 15 minutes).

**Model data can read lower than street monitors.** The air data is a 45 km model, not a monitor, and in north Indian winters it often reads lower than street monitors. The page says so under "Why this can differ from the Sameer app". See [Known gaps](#known-gaps) for a recorded example.

## Assumptions

Each of these is labelled in the app as a Saans rule, not as an authority's figure:

- The 24-hour AQI needs at least 16 valid hours of PM2.5 or PM10, and uses only those two pollutants.
- The Severe band is treated as running from its printed lower edge to twice that edge, mapped to 401 to 500, and no sub-index exceeds 500.
- Concentrations are rounded to the printed table precision before the band lookup.
- Children and teenagers are assumed to be at school from 08:00 to 14:00 on weekdays unless free hours are given. Children, infants, under-5s and older adults stay within 07:00 to 19:00.
- On a Poor or worse day nothing is offered before 10:00 or after 19:00.
- A commute or school run is a trip that cannot be dropped, so it gets protection, not a cancellation.
- Airing the home means one hour, in the cleanest hour between 12:00 and 16:00.
- A trip under 2 km is short, 2 to 15 km mid, above 15 km long.
- Sharing a ride with one other household halves your own car-km.
- The community aggregate assumes a 6 km round trip, 5 days a week.
- A room is assumed to have 8 ft ceilings for purifier sizing.
- Festival guidance is shown in October and November.
- With no data for a routine's hours, the routine is left as planned and the page says so.

## Privacy and security

Saans keeps no copy of a family's details on the server. A household travels inside its link, encrypted, so anyone with the link can see the plan, and pages carry a warning to that effect. Those links would otherwise sit in the platform's request log, so the live service keeps none (the command is at the end of this section). The family's own text is sent to Google's Gemini API only when the family submits it. Every call sends `store: false`. Written text is bound to the link, day, air mode, language and audience it was made for. Forms are protected by an origin check and a signed token. Every response carries a per-request Content-Security-Policy and the other headers in [SECURITY.md](SECURITY.md), which also states the accepted risk of shared free-tier quotas.

On Cloud Run the request log is kept out with one exclusion on the project's default log sink:

```
gcloud logging sinks update _Default --add-exclusion='name=saans-request-urls,filter=resource.type="cloud_run_revision" AND resource.labels.service_name="saans" AND LOG_ID("run.googleapis.com/requests")'
```

## Accessibility

- The core works without JavaScript: forms are plain POSTs answered by 303 redirects, and sample links are plain links. JavaScript is used for two small enhancements, "Use my location" and the copy button, and by the framework itself.
- A band is always a word plus a shape plus a colour, never colour alone. A decision is a word plus a drawing.
- Tables have captions and header cells, with stacked cards on narrow screens. Pages have a single main heading, a skip link, a jump bar and a status line that announces what changed. Buttons, form fields, summaries and sample links are at least 44 px tall.
- The Hindi summary is marked `lang="hi"`. No external fonts are loaded.
- Tested with axe-core on the rendered components (bands, the hour strip, the answer and routine items, the home page components, both forms and the place chooser). The tests run in jsdom, which cannot check colour contrast, so contrast rests on the design tokens and has no automated test (see [Known gaps](#known-gaps)).

## Running locally

Node 24 or later.

```
cp .env.example .env     # then fill in the values below
npm ci
npm run dev
npm run verify
```

Environment variables (see `.env.example`):

| Variable                                                              | Needed | What it is                                                                                                                                   |
| --------------------------------------------------------------------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `SEAL_KEY`                                                            | yes    | 32 random bytes, base64. Encrypts household links. Rotating it invalidates every shared link.                                                |
| `FORM_KEY`                                                            | yes    | 32 random bytes, base64, different from `SEAL_KEY`. Signs form tokens.                                                                       |
| `GEMINI_API_KEY`                                                      | no     | Without it, every Gemini job uses its code path.                                                                                             |
| `GEMINI_MODEL_READER`, `GEMINI_MODEL_WRITER`, `GEMINI_MODEL_FALLBACK` | no     | Model ids. Defaults: `gemini-3.5-flash-lite`, `gemini-3.5-flash-lite`, `gemini-3.1-flash-lite`.                                              |
| `OPENAQ_API_KEY`                                                      | no     | A free OpenAQ key. It turns on the "Measured nearby" line and the precaution. Without it no OpenAQ request is made and nothing else changes. |

Generate a key with `openssl rand -base64 32`. `npm run verify` runs typecheck, lint, format check, the tests and the repository checks. `npm run build` makes the production build. After a build, `npm start` and then `BASE_URL=http://localhost:3000 npx tsx scripts/smoke.ts` check the pages' status codes and security header against a running server.

## Measurements

All taken on 2026-11-24 (IST), with the commands shown.

| What                         | Result                                                                                                                   | Command                 |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ----------------------- |
| Tests                        | 1,482 tests in 68 files, all passing                                                                                     | `npx vitest run`        |
| Coverage, all of `src`       | 96.59% of lines (95.09% statements, 89.22% branches, 96.61% functions)                                                   | `npm run coverage`      |
| Coverage thresholds enforced | 80% lines overall, 90% lines under `src/core` (the run passes)                                                           | `vitest.config.mts`     |
| Tracked files                | 313 files, 1.56 MB (`npm run check:repo`)                                                                                | `git ls-files \| wc -l` |
| Lines                        | 14,093 in `src` (without `src/data`), 4,301 in `src/data`, 12,809 in `tests` (without fixtures), 385 in `tests/fixtures` | `npm run check:repo`    |
| Data rows                    | 28 decision-grid rows, 25 indoor rows, 18 community rows, 7 trip rules, 9 transit cities, 41 listed places, 6 samples    | the command below       |

```
node -e "const d=n=>require('./src/data/'+n+'.json');console.log(d('rules').grid.length,d('indoor').rows.length,d('community').rows.length,d('transit').rules.length,Object.keys(d('transit').cities).length,d('places').length,d('samples').length)"
```

prints, in order: decision-grid rows, indoor rows, community rows, trip rules, transit cities, listed places, samples.

## Known gaps

- **Model data under-reads peaks.** On the recorded Delhi smog day of 13 Dec 2025, the model's PM2.5 averaged 212.3 ug/m3 over the day, which this code turns into an AQI of 371 (Very Poor). The GRAP schedule in `src/data/grap.json` puts Stage IV at AQI 451 to 500, and the label on that page says Stage IV was in force that day. (Recounted from the recorded series: the mean of the 24 hourly PM2.5 values on 2025-12-13, and `aqiToday(series, '2025-12-13T23:00')`.) Timing through the day is useful; the level is a floor in north Indian winters.
- **Station data is a few hours old and needs a key.** Readings from the CPCB network (CPCB, state boards and other agencies such as IITM) reach OpenAQ about 2 to 3 hours behind real time, so the "Measured nearby" reading describes the air a few hours ago, and a reading older than 4 hours is not used. The line appears only when `OPENAQ_API_KEY` is set (a free key, one per person) and a fixed monitor within 10 km has a fresh PM2.5 value. The recorded views never show one. After a failed lookup the same place is not asked again for a minute.
- **The AQI is an estimate.** It uses two pollutants from a model, not the three-pollutant station method CPCB defines.
- **The 16-hour rule is not from a CPCB document.** It is an app rule taken from a secondary source.
- **GRAP stage in force is not claimed.** For Delhi NCR the page shows the stage the schedule lists at the day's AQI and sends the reader to CAQM. Because the AQI is a model estimate, that listed stage can be lower than the real one.
- **A cached air reply is not labelled.** The live air request goes through the framework fetch cache with a 30 minute revalidate window, so a page can be built from a reply up to about 30 minutes old. The "fetched" time on the page is when the page was built, so the data hour beside it is the better guide to the age of the data. If Open-Meteo cannot be reached, the five sample places fall back to a dated recording, labelled "Recorded <date>, not live". Any other place gets a plain message and a retry link, with the home advice and the alternatives still shown.
- **Caches belong to each instance.** The air reply, the station lookup and the checked summary text sit in each server instance's own framework cache. Instances do not share them, a new instance starts empty, and nothing depends on them being warm.
- **A question needs a question mark to be sure of an answer.** A question typed without one, where the question is the only place the routine is mentioned (for example "Is it ok for my son to play cricket at 5 pm"), is sometimes read as a routine with no question, so the plan shows no answer card. The same sentence with a question mark was answered every time we tried it. When Gemini is unavailable, the word-matching reader reads routines but not questions.
- **Hindi is modest.** The interface is English. The summary and notice can be written in Hindi by Gemini and checked; code supplies the Hindi words for each decision, the air band and the day. There is no Hindi template, so a failed Hindi request falls back to English with a note. Code checks a Hindi text for numbers, script and tone but not for fluency, so the wording is plain and can read stiffly.
- **Coverage of places and transport.** Transport options are listed for the cities counted under Measurements and other places get a generic bus line. The place search finds populated places only, and small localities may be missing. Place names in Devanagari, PIN codes and "NCR" are not recognised, and a listed name followed by another state ("Andheri, Punjab") is read as the listed place.
- **Free-tier limits.** Open-Meteo's free service is for non-commercial use and has no uptime guarantee. The Gemini free tier is a shared quota and there is no rate limiter, a deliberate choice recorded in SECURITY.md. When the quota is used up, or Google answers that a model is overloaded (HTTP 503, seen for the fallback model on 24 Nov 2026), text comes from code and the own-words box falls back to word matching.
- **No automated contrast test**, and the axe tests run on components in jsdom, not on full pages in a browser.
- **Samples use a recording only when live data fails.** Sample pages are built from live air for their place; the recordings (fetched 2026-11-21) are a fallback and the source of the smog-day comparison.
- **Several rows are P-FETCH.** They were read through a page summary and need their wording rechecked against the source before being relied on. See [ADR 0009](docs/adr/0009-rules-as-sourced-data.md).
- **Not medical advice.** See [DISCLAIMER.md](DISCLAIMER.md).

## More documents

- [CONTRIBUTING.md](CONTRIBUTING.md): adding a rule, re-recording fixtures, the checks.
- [SECURITY.md](SECURITY.md): headers, CSRF, sealed links, privacy, accepted risk.
- [DISCLAIMER.md](DISCLAIMER.md): what the guidance is and is not.
- [docs/PROMPTS.md](docs/PROMPTS.md): the Gemini prompts, settings, checks and changelog.
- [docs/adr/](docs/adr): nine short decision records.
- [AGENTS.md](AGENTS.md): conventions for contributors and coding agents.

Licensed under the Apache License 2.0 ([LICENSE](LICENSE)).
