# 0008. Time and IST

Status: accepted. Date: 2026-11-22.

## Context

A plan is for a day and for hours of that day. The server may run in any time zone (a container is usually UTC), the air source is asked for IST times, and families think in the Indian clock. India has one zone and no daylight saving. A bug of a few hours would move a child's evening play into the worst air of the day.

## Decision

- The offset is fixed: +05:30. `src/core/time/ist.ts` adds it to an instant and reads the result only with the UTC getters, so the host's time zone and its time zone database are never consulted. A test runs the same instants under UTC, New York and Kolkata and expects the same answer.
- An hour is a fixed-width stamp, `YYYY-MM-DDTHH:00`, so text order is time order. `addHours` refuses anything that is not a real hour, including a date that would roll over (31 February).
- `now` is always a parameter in the core. Pages read the clock once and pass it down.
- Plan day rule: the plan opens on today when IST is before 17:00 and on tomorrow from 17:00. Today, Tomorrow and Day after are one click apart. The header reads "Plan for Tue 24 Nov, all times IST". The forecast covers about 72 hours, which is why three days are offered.
- A routine touches every clock hour it overlaps (17:30 for 60 minutes covers 17 and 18; 17:00 for 60 covers only 17).
- A routine not scheduled on the plan day's weekday is left alone and says it is not on that weekday. On today's plan, no window earlier than the current time is offered, and a window must end inside the plan day.
- A question about "this evening" asked from 17:00 is answered for tomorrow evening, and the answer says so.
- A recorded series is read on its own date: the real time of day is kept and moved onto the recorded day, so "this evening" on the smog-day page means the evening of that recorded day.
- Time tests use fixed instants at 06:00, 14:00, 16:59, 17:00, 21:30 and 23:55 IST, and just after midnight, including month and year ends.

## Consequences

- No time zone setting is needed on the server or in the container.
- If India ever adopted daylight saving, the fixed offset would be wrong. This is accepted.
- Times shown anywhere are IST. A family abroad sees IST, which the page says.
- The 17:00 cut-off is a choice about how much of the day is left to plan around. It is a constant in `src/core/time/plan-day.ts` and easy to change.
