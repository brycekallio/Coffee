-- Google connect hardening, step 2 of 2 (ticket C, 2026-11-06). RUN THIS AS ITS OWN MIGRATION,
-- AFTER migration_2026-11-06_google_connect.sql AND AFTER the new client is deployed.
-- The old client selects the token columns and would break the moment this lands.
--
-- Goal: the browser (roles authenticated and anon) can never read or write the three
-- google_calendar_* token columns. Only the service role (Edge Functions) can. A token that
-- sends Gmail as the student must not be reachable by an XSS bug or a malicious extension.
--
-- Same traps as user_ai_settings.api_key (see BUILD.md "Do not break"):
--   1. profiles has a TABLE-WIDE grant to both roles today. A table-wide SELECT/INSERT/UPDATE
--      covers every column, so `revoke select (col)` alone is a silent no-op. The table-level
--      grant has to go first, then access is granted back column by column without the tokens.
--   2. Supabase re-grants ALL on new public tables via an event trigger at the end of the
--      creating transaction. This is a revoke on an existing table, in its own migration,
--      so nothing re-grants over it. If profiles is ever dropped and recreated, re-run this.
--
-- Row-level security (read/insert/update own profile) is unchanged and still applies.
-- DELETE, TRUNCATE, REFERENCES, TRIGGER table grants are left as they are.

-- anon never needs profiles. Remove read/write entirely (table level and column level).
revoke select, insert, update on public.profiles from anon;
revoke select, insert, update (google_calendar_token, google_calendar_refresh_token, google_calendar_token_expiry, google_connected)
  on public.profiles from anon;

-- authenticated: drop the table-wide grants, then give back every column EXCEPT the tokens.
revoke select, insert, update on public.profiles from authenticated;
revoke select, insert, update (google_calendar_token, google_calendar_refresh_token, google_calendar_token_expiry, google_connected)
  on public.profiles from authenticated;

grant select (
  id, full_name, linkedin_text, resume_text, tone_prefs, created_at, updated_at, username,
  linkedin_url, avatar_url, resume_path, career_interests, phone, my_linkedin_url, resume_url,
  onboarding_completed_at,
  google_connected            -- readable, so the UI can show "Connected"; never writable
) on public.profiles to authenticated;

grant insert (
  id, full_name, linkedin_text, resume_text, tone_prefs, created_at, updated_at, username,
  linkedin_url, avatar_url, resume_path, career_interests, phone, my_linkedin_url, resume_url,
  onboarding_completed_at
) on public.profiles to authenticated;

grant update (
  id, full_name, linkedin_text, resume_text, tone_prefs, created_at, updated_at, username,
  linkedin_url, avatar_url, resume_path, career_interests, phone, my_linkedin_url, resume_url,
  onboarding_completed_at
) on public.profiles to authenticated;

-- Note: any column added to profiles later is NOT readable by the browser until granted
-- explicitly. That is deliberate (deny by default) but remember it when adding columns.
