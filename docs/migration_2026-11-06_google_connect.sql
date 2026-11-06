-- Google connect hardening, step 1 of 2 (ticket C, 2026-11-06). ADDITIVE ONLY, but it MUST be applied
-- FIRST, before the new client and Edge Functions deploy: they read and write these columns,
-- and fail without them. (Old clients ignore the new columns, so applying early is safe.)
--
-- The browser used to read google_calendar_refresh_token just to ask "is Google connected?".
-- This adds a plain yes/no flag the client reads instead. Only the Edge Functions
-- (service role) write it: exchange-google-token sets true, google-disconnect sets false.
-- The token columns are locked away from the browser in step 2
-- (migration_2026-11-06_google_token_revoke.sql), which must run AFTER the new client
-- is deployed, because the old client still selects those columns.

alter table public.profiles
  add column if not exists google_connected boolean not null default false;

-- Separate yes/no: did the user grant "send email"? Outreach auto-send reads this one.
alter table public.profiles
  add column if not exists google_gmail_send boolean not null default false;

-- Rule (owner, 2026-11-06): google_connected = Calendar linked (refresh token + calendar.events
-- granted); google_gmail_send = gmail.send granted. calendar.events has been requested on every
-- connect since 2026-04-15, so a saved refresh token means Calendar is linked.
update public.profiles
   set google_connected = true
 where google_calendar_refresh_token is not null
   and google_connected = false;

-- NO gmail.send backfill (owner decision, 2026-11-06): we never recorded which scopes were
-- granted, and gmail.send was only requested from 2026-10-08 (commit 1bcf6d1), so a saved refresh
-- token does not prove send permission. Everyone starts at google_gmail_send = false; the UI asks
-- them to reconnect Google to turn sending on. Wrong-but-safe: no send is attempted without proof.
