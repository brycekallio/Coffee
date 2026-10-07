-- ── user_ai_settings ─────────────────────────────────────────────────────────
-- Per-user bring-your-own-key AI settings. A row with a non-null api_key puts the
-- user on the "power" tier: their requests run on their own provider quota and the
-- gated tools (outreach personalization, resume rewrite, long meeting transcripts)
-- unlock. No row, or a null key, means the free shared open-weight model.
--
-- Safe to re-run.

create table if not exists public.user_ai_settings (
  id          uuid primary key references auth.users(id) on delete cascade,
  provider    text not null default 'openrouter'
                check (provider in ('openrouter', 'anthropic')),
  model       text not null default 'nvidia/nemotron-3-ultra-550b-a55b:free',
  api_key     text,
  -- Last 4 characters, for showing the user which key is saved without exposing it.
  key_hint    text,
  verified_at timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table public.user_ai_settings enable row level security;

-- Users may READ their own row, but never write it: all writes go through the
-- `ai-settings` Edge Function, which validates the key against the provider first
-- and then writes with the service role.
drop policy if exists "user_ai_settings_select_own" on public.user_ai_settings;
create policy "user_ai_settings_select_own"
  on public.user_ai_settings for select
  using (auth.uid() = id);

-- RLS is row-level, so the select policy above would otherwise hand the plaintext key
-- straight back to the browser. Column-level privileges close that gap.
--
-- Two traps here, both of which silently leave api_key readable:
--   1. A table-wide SELECT grant covers every column, so `REVOKE SELECT (api_key)` is a
--      no-op while it exists. The table-level grant has to go first, then SELECT is
--      re-granted column by column with api_key left out.
--   2. Supabase re-grants ALL on new public tables via an event trigger that fires at
--      the END of the DDL transaction — so a revoke in the same statement batch as the
--      CREATE TABLE gets overwritten. Run this block separately (or re-run this file;
--      the second pass lands after the grant).
revoke all on public.user_ai_settings from authenticated;
revoke all on public.user_ai_settings from anon;

grant select (id, provider, model, key_hint, verified_at, created_at, updated_at)
  on public.user_ai_settings to authenticated;

create or replace function public.touch_user_ai_settings()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  new.key_hint := case
    when new.api_key is null then null
    else '…' || right(new.api_key, 4)
  end;
  return new;
end;
$$;

drop trigger if exists user_ai_settings_touch on public.user_ai_settings;
create trigger user_ai_settings_touch
  before insert or update on public.user_ai_settings
  for each row execute function public.touch_user_ai_settings();
