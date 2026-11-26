# 0004. Sealed household links, sealed drafts and written text binding

Status: accepted. Date: 2026-11-22.

## Context

Saans keeps nothing about a family on the server, yet a plan page needs the family's profile on every request, and a form that needs one more answer has to carry the family's text to the next page. A link may also be shared by message, so it must not show routines or health conditions to anyone who reads the address, and it must not be editable by hand. Written text (a Gemini summary or notice) has to survive a redirect without being stored, and must never show beside a plan it was not written for.

## Decision

`src/server/seal.ts` packs a value as: one version byte, a 12-byte IV, the AES-256-GCM ciphertext of the deflated JSON, and a 16-byte tag, written as base64url. The version byte is authenticated as additional data, so it cannot be swapped.

- Three kinds, each with its own version byte so one never opens as another: a household (1), a draft (2: the family's text, places to choose from, or a form with mistakes) and written text (3).
- A token is at most 2,000 characters, checked before any decoding. The inflated size is capped at 16 KiB so a small token cannot expand into memory. Drafts and written text are cut until they fit (written text that had to be cut is replaced by the code-built text); a household that does not fit is refused.
- Every failure (bad characters, wrong version, failed tag, bad inflate, not JSON, not a valid household) is one `token_invalid` error, shown as one friendly page with a link home.
- The household is validated with the same zod schema as everywhere else after it is opened.
- A place picked from a list is an index into a sealed list, not fields a client can set. Notes and status lines in an address are fixed keys, never free text.
- Written text is bound to the household link, the plan day, the air mode (live or smog day), the language and the audience by a SHA-256 hash, and stamped with its issue time. It expires after 6 hours. When a page reads it back it is checked again against the plan on that page (numbers, tone, no reassurance), so a stale or edited text reads as nothing and the code-built text shows. Code-built text is not carried at all: the page rebuilds it from the plan it shows.
- Sample pages sit at stable unsealed addresses; forms on them seal a copy of the sample household.

## Consequences

- The link is the profile. Anyone who has it can read the plan, and the pages say "This link contains your family's profile." Plan pages at sealed addresses are `noindex`, and every page response is `Cache-Control: private, no-store`.
- A log of request addresses would hold every family's sealed details, so the live service keeps none: a log exclusion drops Cloud Run's request entries for it (the command is in the README).
- Nothing can be revoked. Rotating `SEAL_KEY` invalidates every link ever shared.
- A household that does not fit in 2,000 characters is refused, not shortened.
- Changing a household's shape (the zod schema) can make old links invalid, which shows the friendly page.
