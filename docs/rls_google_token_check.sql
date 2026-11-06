-- Proves migration_2026-11-06_google_token_revoke.sql on a THROWAWAY Postgres (never live):
--   initdb -D /tmp/pgcheck && pg_ctl -D /tmp/pgcheck -o "-p 54399 -k /tmp" start
--   createdb -h /tmp -p 54399 g && psql -h /tmp -p 54399 -v ON_ERROR_STOP=1 -d g -f docs/rls_google_token_check.sql
-- Replicates the LIVE state first (table-wide grants to anon + authenticated, 19 columns, own-row RLS).
\set ON_ERROR_STOP on
drop role if exists authenticated; drop role if exists anon;
create role authenticated nologin; create role anon nologin;
grant usage on schema public to authenticated, anon;
create function public.app_user_id() returns uuid language sql stable as
  $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
grant execute on function public.app_user_id() to authenticated, anon;

create table public.profiles (
  id uuid primary key, full_name text, linkedin_text text, resume_text text, tone_prefs jsonb default '{}',
  created_at timestamptz default now(), updated_at timestamptz default now(), username text, linkedin_url text,
  avatar_url text, resume_path text, google_calendar_token text, google_calendar_refresh_token text,
  google_calendar_token_expiry timestamptz, career_interests text, phone text, my_linkedin_url text,
  resume_url text, onboarding_completed_at timestamptz);
alter table public.profiles enable row level security;
create policy "read own profile" on public.profiles for select using (app_user_id() = id);
create policy "insert own profile" on public.profiles for insert with check (app_user_id() = id);
create policy "update own profile" on public.profiles for update using (app_user_id() = id) with check (app_user_id() = id);
-- LIVE STATE: Supabase's default table-wide grants.
grant all on public.profiles to authenticated, anon;

insert into public.profiles (id, full_name, google_calendar_token, google_calendar_refresh_token)
values ('00000000-0000-0000-0000-000000000001', 'Alice', 'access-A', 'refresh-A'),
       ('00000000-0000-0000-0000-000000000002', 'Bob', null, null);

\i docs/migration_2026-11-06_google_connect.sql
-- pre-revoke sanity: the trap is real (browser can still read the token)
set role authenticated; set test.uid = '00000000-0000-0000-0000-000000000001';
select 'BEFORE revoke token readable (expected a row)' as note, google_calendar_refresh_token from public.profiles;
reset role;

\i docs/migration_2026-11-06_google_token_revoke.sql

create temp table results(name text, ok boolean);
grant all on results to authenticated, anon;
create function pg_temp.try(sql text) returns boolean language plpgsql as $$
begin execute sql; return true; exception when insufficient_privilege then return false; end $$;

-- backfill worked (as superuser)
insert into results select 'backfill: Alice connected, Bob not',
  (select google_connected from public.profiles where id='00000000-0000-0000-0000-000000000001')
  and not (select google_connected from public.profiles where id='00000000-0000-0000-0000-000000000002');

set role authenticated; set test.uid = '00000000-0000-0000-0000-000000000001';
insert into results values ('authenticated select token -> denied', not pg_temp.try('select google_calendar_token from public.profiles'));
insert into results values ('authenticated select refresh token -> denied', not pg_temp.try('select google_calendar_refresh_token from public.profiles'));
insert into results values ('authenticated select expiry -> denied', not pg_temp.try('select google_calendar_token_expiry from public.profiles'));
insert into results values ('authenticated select * -> denied', not pg_temp.try('select * from public.profiles'));
insert into results values ('authenticated update token -> denied', not pg_temp.try($$update public.profiles set google_calendar_refresh_token='evil' where id=app_user_id()$$));
insert into results values ('authenticated update google_connected -> denied', not pg_temp.try($$update public.profiles set google_connected=true where id=app_user_id()$$));
insert into results values ('authenticated insert with token -> denied', not pg_temp.try($$insert into public.profiles(id, google_calendar_token) values (gen_random_uuid(),'x')$$));
insert into results values ('authenticated select profile columns + google_connected -> ok', pg_temp.try('select id, full_name, resume_text, onboarding_completed_at, google_connected from public.profiles'));
insert into results values ('authenticated update full_name (own row) -> ok', pg_temp.try($$update public.profiles set full_name='Alice2' where id=app_user_id()$$));
set test.uid = '00000000-0000-0000-0000-000000000003';
insert into results values ('authenticated insert own blank profile -> ok', pg_temp.try($$insert into public.profiles(id, full_name) values (app_user_id(),'x')$$));
set test.uid = '00000000-0000-0000-0000-000000000001';
insert into results select 'RLS still hides Bob: 1 visible row', (select count(*) from public.profiles)=1;
reset role;

set role anon;
insert into results values ('anon select token -> denied', not pg_temp.try('select google_calendar_refresh_token from public.profiles'));
insert into results values ('anon select any column -> denied', not pg_temp.try('select id from public.profiles'));
insert into results values ('anon update token -> denied', not pg_temp.try($$update public.profiles set google_calendar_token='x'$$));
reset role;

-- service role (here: superuser/owner) can still write the tokens and the flag
insert into results values ('owner/service can still write tokens + flag',
  pg_temp.try($$update public.profiles set google_calendar_token=null, google_calendar_refresh_token=null, google_connected=false where id='00000000-0000-0000-0000-000000000001'$$));

select case when ok then 'PASS' else 'FAIL' end as result, name from results;
do $$ begin if exists (select 1 from results where not ok) then raise exception 'FAIL: some checks failed'; end if; end $$;
