-- Cloudflare auth: the one table the migration adds.
--
-- auth.users stays the source of truth. This is a lookup index, because GoTrue's
-- admin API has no stable exact-match email filter and paging through users on
-- every sign-in is not a login path.
--
-- Run once, before the Worker goes live.

create table if not exists public.auth_identities (
  user_id       uuid primary key references auth.users(id) on delete cascade,
  email         citext unique not null,
  provider      text not null,
  created_at    timestamptz not null default now(),
  last_login_at timestamptz
);

-- citext, not text: Google and Microsoft disagree about the case they return an
-- address in, and the same person must not end up with two rows and two user ids.
create extension if not exists citext;

create index if not exists auth_identities_email_idx on public.auth_identities (email);

-- Seed from the users who already exist, so everyone keeps the uuid their rows
-- are keyed on. Without this, the first Google sign-in by an existing user mints
-- a brand new id and that person sees an empty account with their data still in
-- the database under the old one.
insert into public.auth_identities (user_id, email, provider)
select id, lower(email), coalesce(raw_app_meta_data ->> 'provider', 'legacy')
from auth.users
where email is not null
on conflict (user_id) do nothing;

-- No policies, on purpose. RLS on with zero policies means PostgREST denies
-- everything for anon and authenticated; only the service role (which bypasses
-- RLS) can read it, and the only thing holding the service role is the Worker.
-- A table mapping every user's email to their uuid should never be client-readable.
alter table public.auth_identities enable row level security;

revoke all on public.auth_identities from anon, authenticated;

-- Verify after running:
--   select count(*) from public.auth_identities;            -- should equal the user count
--   select count(*) from auth.users where email is not null;
