-- 2026-11-06: drop the leftover tracking_token column (email-open tracking was removed
-- before it ever shipped; no deployed Edge Function or app code reads it).
-- Safe to re-run. Apply after the app build without tracking_token is live.
drop index if exists public.idx_outreach_tracking_token;
alter table public.scheduled_outreach drop column if exists tracking_token;
