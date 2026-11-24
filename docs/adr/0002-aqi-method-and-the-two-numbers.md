# 0002. The AQI method and the two numbers

Status: accepted. Date: 2026-11-22.

## Context

The air data source returns concentrations (ug/m3), not the Indian AQI. It also returns only model values for a 45 km grid. Families need one headline number they recognise, and routines need an hour-level signal. A daily average cannot say that 14:00 is cleaner than 17:00, and an hourly value is not an AQI.

## Decision

Saans shows two numbers and keeps them apart.

**AQI today (CPCB method, model estimate).**

- Window: the 24 hours ending at the latest data hour that is not after now.
- PM2.5 and PM10 are averaged separately and each needs at least 16 valid hours. A null or non-finite reading counts as missing. With neither pollutant valid there is no headline, and the page says there is not enough data.
- Each mean is rounded to the precision CPCB prints for that pollutant, then looked up in the CPCB table and put through the sub-index formula `(IHI - ILO) / (BHI - BLO) * (C - BLO) + ILO`, rounded to a whole number. A band's upper edge belongs to that band, so a value at the edge takes the lower band.
- The AQI is the larger sub-index. A tie goes to PM2.5.
- Severe has no printed top. App rule: it runs from its printed lower edge to twice that edge, mapped to 401 to 500, and no sub-index exceeds 500.
- The 16-valid-hour rule is also an app rule. It comes from a secondary source, not a CPCB document, and sits in the code, not in `src/data/naqi.json`.
- NO2, SO2 (24-hour) and O3, CO (8-hour, at least 6 valid hours) are averaged for a details table and never change the headline. Model gases over India are less reliable, and one suspect ozone value must not set a family's day.
- CPCB requires three pollutants. Saans uses two, so the label says "model estimate".

**PM2.5 by the hour (a yardstick).** The hourly value is placed in a band using the CPCB PM2.5 breakpoints. It is not an official hourly AQI and is labelled so. Every routine decision uses it, taken from the unrounded mean over the routine's hours. For display it is rounded to the nearest 5, and where that would print a number from the band below (251 is Severe, 250 is Very Poor), it steps up by 5 so the number and its label agree.

## Consequences

- The breakpoints, the band wording and the three app rules live in `src/data/naqi.json`, each with a source and a status, and are parsed at load.
- Tests pin the CPCB published vector (PM2.5 of 31, 45 and 60 give 51, 75 and 100), every band edge on both sides, the rounding rule, the CO unit change and the Severe cap.
- The headline can differ from a station reading or an app such as Sameer, because the input is a model and the average is over 24 hours. The page says so. When an OpenAQ key is set the page also shows the nearest recent monitor reading beside the AQI. It never changes the AQI headline, and it affects the hourly decisions only through the precaution rule described in [ADR 0003](0003-data-sources-and-the-failure-ladder.md).
- For tomorrow or the day after, the same method runs on the 24 hours ending at 23:00 of that day, which are forecast values. That result only sets the day's level for the rules (for example whether the Poor-day hours apply); the headline on the page is for today.
