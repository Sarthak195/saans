# 0003. Data sources and the failure ladder

Status: accepted. Date: 2026-11-22.

## Context

The product needs real air data for any place in India, with a forecast, a source and a timestamp, and it must run on free services with no key. The one free source with an hourly forecast for India is Open-Meteo's Air Quality API (CAMS global model). It has no uptime guarantee, and it is a 45 km model, not a monitor. The page must never be blank when it fails.

## Decision

One adapter, `src/server/air/open-meteo.ts`, fetches the series, and `src/server/air/get-air.ts` applies the ladder.

1. **Live.** One request per plan for the place rounded to 0.1 degree: hourly PM2.5, PM10, NO2, O3, CO and SO2, `past_days=1`, `forecast_days=4`, in IST. The reply is parsed with zod (nulls allowed, one value per hour) and trimmed to 24 hours before and 72 hours after now. Timeout 3.5 seconds, one retry after a network error, a timeout or a 5xx, none after a 4xx or a malformed body. The request uses the framework fetch cache with a 30 minute revalidate window, which is best effort.
2. **Recorded, for the sample places only.** If the live call fails and the point is one of the five sample places (compared at 0.1 degree), a dated recording from `src/data/recorded` is used and the page says "Recorded <date>, not live".
3. **No data.** For any other place the plan is still built from an empty series. The home advice and the alternatives, which need no readings, still render, with a message and a retry link.

A point outside India is refused, not papered over. Place search tries a list of 41 places first, then the Open-Meteo geocoder (3 second timeout, India only, populated places only, results not cached), and asks the family to choose when a name exists in several states. The attribution is printed on every page: "Air quality data: Open-Meteo.com (CC BY 4.0), CAMS; place names: GeoNames."

## Consequences

- Recordings are real replies saved with their URL and fetch time, regenerated only by `scripts/record-fixtures.ts`. They are the only air data in the repository, and the recorded smog day (13 Dec 2025) is the source of the smog-day comparison.
- The cached rung is weaker than it sounds. The page has wording for a stale reading (`series.stale`), but no code sets it, so a reply served from the framework cache is not labelled. This is a known gap.
- OpenAQ station data is not used. The environment accepts a key and the series type has a station slot, but no adapter exists. When one does, the station value should sit beside the model value and never be blended into the forecast.
- Free-tier terms apply: Open-Meteo's free service is for non-commercial use.
