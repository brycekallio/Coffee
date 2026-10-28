-- Applied to the live project (ypyvkqysnowgegcjydnd) on 2026-10-28.
--
-- schema.sql declared these columns, but the live tables predate them: its
-- `create table if not exists` skipped the existing tables, and the "email open
-- tracking" block was never run. PostgREST rejects a payload naming an unknown
-- column (PGRST204), so in production:
--   * every Applications save failed ("Could not find the 'contact_id' column")
--     -- the table held 0 rows across 13 users;
--   * "Mark opened" in Outreach failed, and email-open-tracker matched nothing.
-- Both are additive and nullable. Found by generating src/lib/database.types.ts
-- and typing the client, which now makes this class of drift a compile error.

alter table public.applications
  add column if not exists contact_id uuid references public.contacts(id) on delete set null;
create index if not exists idx_applications_contact_id on public.applications(contact_id);

alter table public.scheduled_outreach
  add column if not exists tracking_token uuid default gen_random_uuid(),
  add column if not exists opened_at timestamptz;
create index if not exists idx_outreach_tracking_token
  on public.scheduled_outreach(tracking_token);

notify pgrst, 'reload schema';
