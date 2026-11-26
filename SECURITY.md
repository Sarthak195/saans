# Security

## Reporting a problem

Open a private security advisory on the repository, or contact the maintainers directly. Please do not post a working exploit in a public issue.

## What the app does

- **Headers.** Every page and form response carries a Content-Security-Policy with a fresh nonce per request, `Strict-Transport-Security`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: same-origin`, `Cross-Origin-Opener-Policy: same-origin` and a restrictive `Permissions-Policy`. `Cache-Control: private, no-store` is set on every response that is not a static file, so no cache keeps a family's details.
- **CSRF.** Every form POST must carry an `Origin` header equal to this site's own origin. The host comes from the `Host` header only; `X-Forwarded-Host` is ignored, and `X-Forwarded-Proto` is used for the scheme alone. A missing `Origin`, or the literal `null`, is accepted only when the browser says `Sec-Fetch-Site: same-origin`. A POST also needs a signed form token that expires after 30 minutes.
- **Sealed links.** A household, a draft and a written summary are packed into URL-safe tokens that are encrypted and authenticated (AES-256-GCM), with a separate version byte for each kind, so one kind of token never opens as another. Written text is also bound to the household link, plan day, air mode, language and audience it was made for, expires after 6 hours, and is checked again against the plan on the page before it is shown. Notes and status lines in an address are fixed keys, never free text. A place picked from a list is an index into a sealed list, not fields a client can set.
- **Privacy.** Saans keeps no copy of a family's details on the server. A household travels inside its link, encrypted with AES-256-GCM, so anyone holding the link can open the plan, and the pages say so. Because plan and form links carry those details, the live service keeps no request log: a log exclusion drops Cloud Run's request entries for it (the command is in the README), and the app writes no addresses to its own output. The family's own text is sent to Gemini only when the family submits it, and is not logged. When a plan page loads, the plan's readings, times and decisions (no names or place) are sent to Gemini to word the English summary, and a checked reply is kept for half an hour. A device location is rounded to about 11 km in the browser and sent in the body of the form post; when the family still has a form to fill in, it travels on inside the sealed draft link, never as plain values in an address.
- **Third-party keys.** `OPENAQ_API_KEY` is optional and is sent to OpenAQ only in the `X-API-Key` header, never in an address. An error from OpenAQ is reduced to its status code, so the request and the key never reach a message or a log. The OpenAQ request carries the place rounded to 0.1 degree and nothing about the family.
- **Environment.** `SEAL_KEY` and `FORM_KEY` must each be 32 random bytes in base64 and must differ from each other. The server checks them when it starts in production, so a bad deploy stops there, and `/api/health` reports ok only when the environment is valid (it never shows a value).
- **Supply chain.** CI pins actions by commit, runs with read-only permissions, does not keep the checkout token, fails if an environment file is tracked, scans for key-shaped strings and audits production dependencies. The image installs dependencies without install scripts and runs as a non-root user.

## Accepted risk: shared quotas

The app has no rate limiter. Anyone can script requests to the public site, and the free tiers it depends on (Gemini, the Open-Meteo air and place services and the free OpenAQ key) are shared quotas that scripted traffic could use up. We accept this on purpose: a limiter that lives in one process cannot see other instances and adds state to the server.

What limits the harm instead:

- When the Gemini quota runs out, the app shows code-written text. Plans, advice and numbers never depend on Gemini.
- When the OpenAQ key is rate limited or fails, the page shows no monitor reading and is otherwise unchanged, and the same place is not asked again for a minute.
- Place searches typed by a visitor are not cached, so unique queries cannot fill a cache.
- Cloud Run instances are capped, so the cost and the traffic to the free services have an upper bound.
