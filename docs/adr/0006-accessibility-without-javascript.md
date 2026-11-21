# 0006. Accessibility, and a core that works without JavaScript

Status: accepted. Date: 2026-11-22.

## Context

Saans is for families on any phone, often on a slow connection, and for people using screen readers, large text or no JavaScript at all. A health plan that needs a script to render, or that signals a danger only with a colour, fails the people it is for. The server also sends a per-request Content-Security-Policy with a nonce, which blocks any script that is not part of the framework's own bootstrap.

## Decision

The whole core path works as plain HTML:

- Every action is a link or a form. Forms post to a route handler that answers with a 303 redirect to a page, so the browser's back button and a reload behave. A form that fails shows a small complete page (or the form again) with a reason and a way forward.
- Pages are rendered on the server for every request. JavaScript adds two small enhancements: "Use my location" (rounds to 0.1 degree in the browser before it is sent in a form field, not in an address) and the copy button for a notice. The framework's own scripts and `error.tsx` also run, and nothing depends on them for the plan.
- "Use this example" fills the text box through a server-side query parameter, not a script.
- After an action the redirect lands on an anchor: the main heading, the answer, the summary or the changed routine. A `role="status"` line on every plan page announces what happened, and a form error summary is a `role="alert"` with the fields marked invalid and described.
- A band is a word, a shape (aria-hidden) and a colour, never colour alone. A decision is a word with a drawing. Tables have captions and header cells and stack as cards on narrow screens. The Hindi summary carries `lang="hi"`. No external fonts, images or scripts are loaded.
- Pages have a skip link, a jump bar, a single main heading, visible focus, reduced-motion styles, and 44 px targets for buttons, fields, summaries and sample links.
- Tests: axe-core runs on the rendered components (bands, the hour strip, the answer card and routine items, the home page components, both forms and the place chooser), and route tests post to the handlers and assert the 303 redirects, status codes and sealed results.

## Consequences

- Features that would need a client script (live validation, auto-refresh, drag and drop) are not built. Every what-if is a round trip.
- The axe tests run in jsdom, which has no layout engine, so colour contrast is not tested there. Contrast depends on the colour tokens in `src/app/globals.css`, and no automated contrast test exists. Pages are not tested in a real browser with a screen reader.
- The no-JavaScript claim is tested at the route-handler and component level. No test drives a browser with scripts disabled.
- The nonce policy means any future inline script would need the nonce, which is the intent.
