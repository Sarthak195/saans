# 0007. Stateless by design

Status: accepted. Date: 2026-11-22.

## Context

A household plan involves health details, and the service runs on a free tier that can scale to several instances or to none. A database or a session would store what is private, need deletion and access rules, and tie the app to one region and one instance. An in-memory rate limiter looks like protection, but each instance has its own count and the state lives in a process-global that survives across requests.

## Decision

Saans keeps no state of its own on the server.

- **No database and no session.** A household is sealed into the link ([ADR 0004](0004-sealed-links-and-written-text.md)). Nothing about a family is written anywhere.
- **No in-memory rate limiter** and no module-scope mutable state in `src/server`. Lint rejects module-scope `let`, `var`, `Map`, `Set`, `WeakMap` and `WeakSet` there. One exception in spirit: `getEnv` keeps the parsed environment in a module-level `const` holder that is filled on first use. The environment does not change while the server runs, and it is read-only configuration, not request state.
- **Framework caches only.** Upstream air data goes through the fetch cache (30 minute revalidate), OpenAQ monitor lists and latest readings through the same cache (3 hours and 15 minutes), and the outcome of a station lookup, a failure included, through the framework's data cache for one minute. Written text goes through the data cache too (30 minutes, keyed by a hash of placeholder facts). They are best effort: each instance has its own, they can be cold or empty after a deploy, and correctness never depends on them. A failed text is not remembered.
- **Bounds without counters.** Request bodies are capped (8 KiB, and 16 KiB for the own-words form), the family's text at 1,500 characters, every upstream call has a timeout and Gemini calls have an output cap. A form needs a signed token that expires after 30 minutes. Typed place searches are not cached, so unique queries cannot fill a cache. Instances are capped at deploy time, so cost and traffic to free services have an upper bound.

## Consequences

- **Accepted risk.** Anyone can script requests to the public site, and the free tiers behind it (Gemini, the Open-Meteo services and the OpenAQ key) are shared quotas that scripted traffic could use up. SECURITY.md records this. What limits the harm: when Gemini's quota runs out, text comes from code and plans never depend on Gemini; place searches are not cached; and instances are capped.
- Nothing can be looked up, listed or deleted on the server for a family, because nothing is there. Links cannot be revoked except by rotating the key.
- Each request does its own work. A page view fetches air data (unless the framework cache has it) and rebuilds the plan, which is cheap because the core is pure.
- A quota or an outage affects every visitor equally and shows up as code-written text, not as an error.
