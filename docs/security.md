# Security Audit Report

**Date:** 2026-09-14
**Dependencies Pinned:** All production and dev dependencies pinned to exact versions per `package.json`

## Summary

Pre-launch audit ahead of hosting the app for real users. Found and fixed three unauthenticated Supabase Edge Functions that let anyone on the internet burn the project's Anthropic API key, patched dependency vulnerabilities down from 40 to 5 (all remaining require major-version bumps to build-only tooling), removed an unused dependency, and updated two AI edge functions off deprecated Claude model snapshots.

## Findings Fixed This Audit

### HIGH — Unauthenticated Edge Functions (unrestricted use of a paid API key)

`summarize-contact`, `score-jd`, and `process-meeting-notes` had no application-level check that the caller was a signed-in Coffee user. Supabase's platform `verify_jwt` gate does not protect against this on its own — it accepts the public anon key, which ships in every client bundle and is visible in the Chrome extension manifest — so any caller who knew (or found) the function URL could invoke it and consume `ANTHROPIC_API_KEY` for free, with no rate limit.

**Fix:** all three functions now verify the caller's JWT via `supabase.auth.getUser()` before doing any work, matching the pattern already used correctly in `exchange-google-token` and `create-calendar-event`. Deployed to the live project.

### MEDIUM — Broken AI Summary feature (correctness, not security)

`ContactDetailsPage.tsx`'s "AI Summary" button called `fetch("/functions/v1/summarize-contact", ...)` — a relative path with no proxy configured, so in production it would hit the app's own Netlify origin (404/index.html) instead of Supabase. It also read the auth token from `sessionStorage.getItem("supabase.auth.token")`, a key Supabase's client never writes to (it uses `localStorage` under a project-specific key). The feature was non-functional end-to-end. Fixed to use `supabase.functions.invoke(...)`, the same working pattern used elsewhere in the app.

### LOW — Deprecated Claude model snapshots

`summarize-contact`, `score-jd`, and `process-meeting-notes` targeted `claude-3-5-sonnet-20241022` / `claude-3-5-haiku-20241022`. Updated to current models (`claude-sonnet-5`, `claude-haiku-4-5-20251001`).

### Not fixed — flag before ever distributing the desktop build

`electron-builder`'s config bundles `.env.local` — which contains `SUPABASE_SERVICE_ROLE_KEY` — into every packaged `.dmg`/`.zip` as an `extraResource`. The service role key bypasses Row-Level Security entirely. Today this only matters if the packaged desktop app is shared with anyone outside this machine — **do not distribute the Electron build until this is addressed** (e.g. desktop worker re-architected to use the user's own session instead of the service role key).

## npm audit

Went from 40 vulnerabilities (4 critical, 30 high) down to 5 high, by:
- Removing the unused `papaparse` dependency
- Bumping `vite`, `electron`, `electron-builder`, `concurrently` to their patched versions (non-breaking)
- Applying `npm audit fix` for `brace-expansion`

Remaining 5 high-severity findings all require a **major** version bump (`electron` 40→44, `puppeteer` 24→25) to fix, and are confined to build/install-time tooling (Electron packaging, Chromium download/extraction for the local `scripts/worker.ts`) — not shipped to the production web bundle. Deferred pending a scoped test of the desktop build after a major bump.

## Row-Level Security

All tables (`contacts`, `profiles`, `contact_meetings`, `applications`, `watchlist_targets`, `scheduled_outreach`) have RLS enabled with `auth.uid() = owner_id` (or `= id` for `profiles`) policies. No gaps found.

## Resume storage

The `resumes` Storage bucket is public, with objects keyed by `<user_id>/resume.<ext>`. Anyone who obtains a user's UUID could fetch their resume directly. UUIDs aren't guessable, and no code path currently exposes another user's UUID client-side, so this is a defense-in-depth note rather than an active vulnerability — worth revisiting if the bucket's contents become more sensitive.

## How to Re-audit

```bash
npm audit
```

All findings will be documented in this file with dates.


---

## 2026-10-07 — AI provider swap

Moved the default AI engine off Anthropic and onto free open-weight models on OpenRouter,
and added a per-user bring-your-own-key tier. Three security-relevant notes:

### Shared key is no longer a blank cheque

Previously every AI call spent `ANTHROPIC_API_KEY` at Anthropic's per-token rates, so an
authenticated-but-abusive user could run up a real bill. The default engine now costs
nothing per token and OpenRouter caps the shared key at 20 requests/minute and 50/day, so
the worst case is denial of service against other users rather than an invoice. The
auth checks added in the previous audit still apply — `resolveTier()` rejects
unauthenticated callers before any provider call, in all six AI functions.

### BYO keys are not readable by the browser

`user_ai_settings.api_key` holds a user's own provider key in plaintext. RLS is row-level,
so the owner-scoped select policy on that table would have returned the key to the client.
Closed with column privileges: the table-level grant is revoked and SELECT re-granted
column by column with `api_key` omitted, leaving `key_hint` (last 4 chars) for the UI.
Users have no INSERT/UPDATE privilege or policy on the table at all — writes go only
through the `ai-settings` function under the service role.

Two ways this silently fails open, both worth re-checking after any DDL change to the
table (`select grantee, privilege_type, column_name from information_schema.column_privileges
where table_name = 'user_ai_settings'`):
1. A table-wide SELECT grant covers every column, making a column-level REVOKE a no-op.
2. Supabase re-grants ALL on new public tables from an event trigger that fires at the end
   of the DDL transaction, overwriting a revoke issued in the same batch.

### Keys are verified before storage

`ai-settings` makes a 16-token probe call against the provider before writing a key, so a
bad key fails loudly at save time instead of breaking every AI feature later with an
opaque provider error.

### Not yet verified

The OpenRouter request shape is built from the provider's documentation and has not been
exercised against a live key — `OPENROUTER_API_KEY` is not yet set in Supabase secrets.
Until it is, the free tier returns a 500 explaining that; the BYO path is untested too.
