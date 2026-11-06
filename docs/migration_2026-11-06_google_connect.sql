-- Google connect hardening, step 1 of 2 (ticket C, 2026-11-06). ADDITIVE ONLY: safe to apply
-- before or after the client deploy.
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

-- Existing connections: anyone with a saved refresh token is connected.
update public.profiles
   set google_connected = true
 where google_calendar_refresh_token is not null
   and google_connected = false;

-- BEST GUESS backfill: we never recorded which scopes were granted, so any saved refresh token
-- is assumed to include gmail.send. A user who unticked "send email" will show as send-capable
-- until they reconnect (their scheduled email then fails and is shown in "Not sent").
update public.profiles
   set google_gmail_send = true
 where google_calendar_refresh_token is not null
   and google_gmail_send = false;
