-- RLS check for bulk select (2026-11-02). Written check, run against REAL Postgres.
--
-- What it proves: with the live policies (`app_user_id() = owner_id`, copied from the live
-- project) and the new starred/tags columns, a signed-in user's bulk delete / star / tag /
-- move-style insert cannot touch another user's rows, even when handed their ids and even
-- without the client's extra `owner_id` filter.
--
-- Run it on a THROWAWAY database, never on the live project:
--   createdb coffee_rls && psql -v ON_ERROR_STOP=1 -d coffee_rls -f docs/rls_bulk_check.sql
-- It builds a minimal replica (auth stubs, the two tables, the live policies, the migration)
-- and prints PASS/FAIL per check, then exits non-zero on a FAIL.

\set ON_ERROR_STOP on
drop schema if exists auth cascade;
drop schema public cascade; create schema public;
drop role if exists authenticated; drop role if exists service_role_x;
create role authenticated nologin;
grant usage on schema public to authenticated;

create schema auth;
create table auth.users (id uuid primary key default gen_random_uuid());
-- Supabase's auth.jwt(): the claims of the current request.
create function auth.jwt() returns jsonb language sql stable as
  $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
grant usage on schema auth to authenticated;
grant execute on function auth.jwt() to authenticated;

create table public.auth_identities (user_id uuid not null references auth.users(id), clerk_user_id text unique);
-- Verbatim from the live project.
create function public.app_user_id() returns uuid language sql stable security definer set search_path to 'public' as $f$
  select coalesce(
    (select ai.user_id from public.auth_identities ai where ai.clerk_user_id = (auth.jwt() ->> 'sub')),
    case when (auth.jwt() ->> 'sub') ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
         then (auth.jwt() ->> 'sub')::uuid end);
$f$;
grant execute on function public.app_user_id() to authenticated;

-- Live tables (columns as of 2026-11-02, before the migration).
create table public.contacts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id),
  first_name text, last_name text, company text, title text, email text, linkedin_url text,
  status text not null default 'to_contact', last_touch_at timestamptz, next_touch_at timestamptz,
  created_at timestamptz default now(), updated_at timestamptz default now(), phone text, notes text);
create table public.watchlist_targets (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id),
  person_name text not null, company text not null, role text,
  status text not null default 'not_contacted', next_action_date date, notes text,
  created_at timestamptz not null default now());
alter table public.contacts enable row level security;
alter table public.watchlist_targets enable row level security;
create policy "read own contacts"   on public.contacts for select to authenticated using (app_user_id() = owner_id);
create policy "insert own contacts" on public.contacts for insert to authenticated with check (app_user_id() = owner_id);
create policy "update own contacts" on public.contacts for update to authenticated using (app_user_id() = owner_id) with check (app_user_id() = owner_id);
create policy "delete own contacts" on public.contacts for delete to authenticated using (app_user_id() = owner_id);
create policy watchlist_all_own on public.watchlist_targets for all to public using (app_user_id() = owner_id) with check (app_user_id() = owner_id);
grant select, insert, update, delete on public.contacts, public.watchlist_targets to authenticated;

-- The migration under test.
\i docs/migration_2026-11-02_bulk_select.sql

-- Two users, three rows each, in both tables.
insert into auth.users (id) values ('11111111-1111-4111-8111-111111111111'), ('22222222-2222-4222-8222-222222222222');
insert into public.auth_identities values ('11111111-1111-4111-8111-111111111111', 'user_me'), ('22222222-2222-4222-8222-222222222222', 'user_them');
insert into public.contacts (owner_id, first_name) select u, 'P' || n from unnest(array['11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222']::uuid[]) u, generate_series(1,3) n;
insert into public.watchlist_targets (owner_id, person_name, company) select u, 'T' || n, 'Co' from unnest(array['11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222']::uuid[]) u, generate_series(1,3) n;

create temp table results (name text, ok boolean);
grant all on results to authenticated;
create function pg_temp.check(name text, ok boolean) returns void language sql as $$ insert into results values (name, ok) $$;

-- Act as "me" (a Clerk subject, mapped through auth_identities exactly like production).
set role authenticated;
select set_config('request.jwt.claims', '{"sub":"user_me"}', false);

-- Their ids, as an attacker would have them (read as the superuser a moment ago would be
-- cheating, so take them from the table owner via a security-definer helper).
reset role;
create temp table theirs_c as select id from public.contacts where owner_id = '22222222-2222-4222-8222-222222222222';
create temp table theirs_w as select id from public.watchlist_targets where owner_id = '22222222-2222-4222-8222-222222222222';
grant select on theirs_c, theirs_w to authenticated;
set role authenticated;

-- 1. Star + tag their rows by id (what a forged bulk request would send), WITHOUT the owner_id filter.
with u as (update public.contacts set starred = true, tags = array['sneaky'] where id in (select id from theirs_c) returning 1)
  insert into results select 'contacts: star+tag by their ids touches 0 rows', (select count(*) from u) = 0;
with u as (update public.watchlist_targets set starred = true, tags = array['sneaky'] where id in (select id from theirs_w) returning 1)
  insert into results select 'watchlist: star+tag by their ids touches 0 rows', (select count(*) from u) = 0;

-- 2. Delete their rows by id.
with d as (delete from public.contacts where id in (select id from theirs_c) returning 1)
  insert into results select 'contacts: delete by their ids removes 0 rows', (select count(*) from d) = 0;
with d as (delete from public.watchlist_targets where id in (select id from theirs_w) returning 1)
  insert into results select 'watchlist: delete by their ids removes 0 rows', (select count(*) from d) = 0;

-- 3. Hand a row over to them (a move/insert naming their owner_id, or an update changing owner_id) is refused.
do $$ begin
  begin
    insert into public.watchlist_targets (owner_id, person_name, company) values ('22222222-2222-4222-8222-222222222222', 'planted', 'x');
    insert into results values ('watchlist: insert as another owner is refused', false);
  exception when insufficient_privilege then
    insert into results values ('watchlist: insert as another owner is refused', true);
  end;
  begin
    insert into public.contacts (owner_id, first_name) values ('22222222-2222-4222-8222-222222222222', 'planted');
    insert into results values ('contacts: insert as another owner is refused', false);
  exception when insufficient_privilege then
    insert into results values ('contacts: insert as another owner is refused', true);
  end;
  begin
    update public.contacts set owner_id = '22222222-2222-4222-8222-222222222222' where owner_id = '11111111-1111-4111-8111-111111111111';
    insert into results values ('contacts: re-owning my rows to them is refused', false);
  exception when insufficient_privilege then
    insert into results values ('contacts: re-owning my rows to them is refused', true);
  end;
end $$;

-- 4. The legitimate path still works: my own rows can be starred, tagged and deleted in bulk.
with u as (update public.contacts set starred = true, tags = array['Banking','Consulting'] where owner_id = app_user_id() returning 1)
  insert into results select 'contacts: my own star+tag works (3 rows)', (select count(*) from u) = 3;
with d as (delete from public.watchlist_targets where owner_id = app_user_id() returning 1)
  insert into results select 'watchlist: my own bulk delete works (3 rows)', (select count(*) from d) = 3;

-- 5. The tag cap holds.
do $$ begin
  begin
    update public.contacts set tags = (select array_agg('t' || n) from generate_series(1,21) n) where owner_id = app_user_id();
    insert into results values ('contacts: more than 20 tags is refused', false);
  exception when check_violation then
    insert into results values ('contacts: more than 20 tags is refused', true);
  end;
end $$;

-- 6. Their rows are untouched, checked as the superuser.
reset role;
insert into results select 'their contacts: still 3, none starred/tagged',
  (select count(*) from public.contacts where owner_id = '22222222-2222-4222-8222-222222222222' and not starred and tags = '{}') = 3;
insert into results select 'their watchlist: still 3, none starred/tagged',
  (select count(*) from public.watchlist_targets where owner_id = '22222222-2222-4222-8222-222222222222' and not starred and tags = '{}') = 3;
insert into results select 'no planted rows anywhere',
  (select count(*) from public.contacts where first_name = 'planted') + (select count(*) from public.watchlist_targets where person_name = 'planted') = 0;

select case when ok then 'PASS' else 'FAIL' end as result, name from results order by ok, name;
do $$ begin
  if exists (select 1 from results where not ok) then raise exception 'RLS bulk check FAILED'; end if;
end $$;
