-- Per-user daily cap on the shared free AI tier (2026-11-02).
--
-- Why: the free tier runs on the project's one OpenRouter key, which allows 50 requests a
-- day across ALL users. Sign-ups are open, so one account could spend the whole day's
-- quota. Each free-tier request now counts against the caller's own daily allowance
-- (FREE_AI_DAILY_LIMIT_PER_USER, default 5) before the model is called; see
-- spendFreeRequest() in supabase/functions/_shared/tier.ts.
--
-- Additive only: one new table, one new function. Nothing existing changes.
--
-- Run as TWO migrations, in order (part 1, then part 2). Supabase's event trigger
-- re-grants ALL on every new public table at the end of the transaction that creates it,
-- so a revoke in the same transaction is silently undone (the trap documented in
-- migration_add_ai_settings.sql). RLS with no policies already blocks anon/authenticated
-- from every row; the revoke in part 2 is the second lock.

-- ── Part 1 ──────────────────────────────────────────────────────────────────────────

create table if not exists public.ai_free_usage (
  user_id  uuid    not null references auth.users(id) on delete cascade,
  day      date    not null,
  requests integer not null default 0 check (requests >= 0),
  primary key (user_id, day)
);

comment on table public.ai_free_usage is
  'Free-tier AI requests per user per UTC day. Written only by consume_free_ai_request() (service_role).';

-- No policies on purpose: nobody but service_role reads or writes this table.
alter table public.ai_free_usage enable row level security;

-- Returns the caller's new count for today, or NULL when the request would exceed p_limit
-- (and then nothing is written). One statement, so two concurrent requests can't both take
-- the last slot: ON CONFLICT ... DO UPDATE ... WHERE locks the row and re-checks the count.
create or replace function public.consume_free_ai_request(p_user uuid, p_limit integer)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_count integer;
begin
  if p_user is null or p_limit is null or p_limit <= 0 then
    return null;
  end if;

  insert into public.ai_free_usage as u (user_id, day, requests)
  values (p_user, (now() at time zone 'utc')::date, 1)
  on conflict (user_id, day) do update
    set requests = u.requests + 1
    where u.requests < p_limit
  returning u.requests into v_count;

  return v_count;  -- NULL when the WHERE refused the update
end;
$$;

revoke all on function public.consume_free_ai_request(uuid, integer) from public, anon, authenticated;
grant execute on function public.consume_free_ai_request(uuid, integer) to service_role;

-- ── Part 2 (separate migration, after part 1 has committed) ────────────────────────

revoke all on table public.ai_free_usage from anon, authenticated;
grant select, insert, update, delete on table public.ai_free_usage to service_role;

-- ── Part 3 (added after code review, 2026-11-02) ───────────────────────────────────
-- Gives one request back when the provider refused the shared key outright (rate limited
-- or key rejected), so a user isn't charged for a call that did no work. tier.ts decides
-- which failures qualify; model errors stay counted.

create or replace function public.refund_free_ai_request(p_user uuid)
returns void
language sql
security invoker
set search_path = ''
as $$
  update public.ai_free_usage
     set requests = requests - 1
   where user_id = p_user
     and day = (now() at time zone 'utc')::date
     and requests > 0;
$$;

revoke all on function public.refund_free_ai_request(uuid) from public, anon, authenticated;
grant execute on function public.refund_free_ai_request(uuid) to service_role;
