# 0003. Data sources and the failure ladder

Status: accepted. Date: 2026-11-22.

## Context

The product needs real air data for any place in India, with a forecast, a source and a timestamp, and it must run on free services with no key. A measured reading from a nearby monitor is a bonus that needs a free key, not a requirement. The one free source with an hourly forecast for India is Open-Meteo's Air Quality API (CAMS global model). It has no uptime guarantee, and it is a 45 km model, not a monitor. The page must never be blank when it fails.

## Decision

One adapter, `src/server/air/open-meteo.ts`, fetches the series, and `src/server/air/get-air.ts` applies the ladder. A second adapter, `src/server/air/openaq.ts`, adds a station reading when a key is set (see below the ladder).

1. **Live.** One request per plan for the place rounded to 0.1 degree: hourly PM2.5, PM10, NO2, O3, CO and SO2, `past_days=1`, `forecast_days=4`, in IST. The reply is parsed with zod (nulls allowed, one value per hour) and trimmed to 24 hours before and 72 hours after now. Timeout 3.5 seconds, one retry after a network error, a timeout or a 5xx, none after a 4xx or a malformed body. The request uses the framework fetch cache with a 30 minute revalidate window, which is best effort.
2. **Recorded, for the sample places only.** If the live call fails and the point is one of the five sample places (compared at 0.1 degree), a dated recording from `src/data/recorded` is used and the page says "Recorded <date>, not live".
3. **No data.** For any other place the plan is still built from an empty series. The home advice and the alternatives, which need no readings, still render, with a message and a retry link.

The station reading is separate from the ladder. It is asked for only when `OPENAQ_API_KEY` is set and the page is a live plan inside India. The adapter uses the OpenAQ v3 API with the key in the `X-API-Key` header only. It lists fixed monitors within the search radius of the place rounded to 0.1 degree, keeps those that measure PM2.5, reported in the last 4 hours and are within 10 km of the place, reads the latest values of the three nearest, and takes the nearest one with a fresh PM2.5 value (a reading counts as fresh up to 4 hours old, because CPCB and state board data arrive about 2 to 3 hours behind real time). Timeout 2 seconds. Monitor lists go through the framework fetch cache for 3 hours and latest values for 15 minutes. Any failure (no key, timeout, 401, 429, an odd body, no monitor) means no station, and the page is exactly what it would be without a key. The outcome, a failure included, is remembered for one minute per place, so a rate limit is not hit again by every page view.

A point outside India is refused, not papered over. Place search tries a built-in list of places first, then the Open-Meteo geocoder (3 second timeout, India only, populated places only, results not cached), and asks the family to choose when a name exists in several states. The attribution is printed on every page: "Air quality data: Open-Meteo.com (CC BY 4.0), CAMS; place names: GeoNames."

## Consequences

- Recordings are real replies saved with their URL and fetch time, regenerated only by `scripts/record-fixtures.ts`. They are the only air data in the repository, and the recorded smog day (13 Dec 2025) is the source of the smog-day comparison.
- The cached rung is weaker than it sounds. The framework fetch cache revalidates every 30 minutes, so a page can be built from a reply up to about 30 minutes old, and the page does not mark it. The fetch time it prints is when the page was built; the data hour beside it is the hour of the data. This is a known gap.
- The station value sits beside the model value and is never blended into the forecast or the AQI. Its only effect is the precaution rule in `src/core/plan/station.ts`: for today's live plan, when the monitor's PM2.5 level is worse than the model's level for the hour the monitor measured, the plan header says so and the advice for the current hour and the next 3 uses the worse level.
- Station data lags real time by about 2 to 3 hours, so it describes the air a few hours ago. A reading older than 4 hours is ignored.
- Free-tier terms for the key: OpenAQ's terms allow one key per person, ask users to acknowledge OpenAQ and the original source, and leave the data provider's own terms to the user. The README's data sources section records what was found about the licence.
- Free-tier terms apply: Open-Meteo's free service is for non-commercial use.
