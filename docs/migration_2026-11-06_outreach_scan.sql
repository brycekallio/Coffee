-- 2026-11-06: supporting index for the outreach cron's candidate scan.
-- Additive and safe to re-run. The cron now reads only Gmail owners' rows
-- (status 'scheduled', channel 'email'), oldest first; this partial index keeps that
-- scan cheap however many manual-reminder rows accumulate.
create index if not exists scheduled_outreach_email_due_idx
  on public.scheduled_outreach (scheduled_at)
  where status = 'scheduled' and channel = 'email';
