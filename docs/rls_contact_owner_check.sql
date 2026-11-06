-- RLS + auth check for docs/migration_2026-11-06_db_hardening.sql (2026-11-06).
-- Written check, run against REAL Postgres. Never run it on the live project.
--
--   createdb coffee_hardening && psql -v ON_ERROR_STOP=1 -d coffee_hardening -f docs/rls_contact_owner_check.sql
-- Negative control (must print FAILs and exit non-zero):
--   psql -v ON_ERROR_STOP=1 -v rls_off=1 -d coffee_hardening -f docs/rls_contact_owner_check.sql
--
-- It builds a minimal replica (auth/storage stubs, the tables, the LIVE policies and the LIVE
-- function bodies as of 2026-11-05), applies part 1 and part 2 of the migration as separate
-- statements, then prints PASS/FAIL per check and raises on any FAIL.
-- Covers: cross-owner contact_id refused / own allowed / null allowed on all four tables
-- (insert and update); email_verified absent -> links (old behaviour), false -> refused, true ->
-- links, already-linked user unaffected by the claim; claim counters; bucket limits; anon
-- cannot execute the L8 functions while triggers still fire; the L4 daily cap.

\set ON_ERROR_STOP on
drop schema if exists auth cascade;
drop schema if exists storage cascade;
drop schema public cascade; create schema public;
drop role if exists anon; drop role if exists authenticated; drop role if exists service_role;
create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
grant usage on schema public to anon, authenticated, service_role;

create schema auth;
create table auth.users (
  id uuid primary key default gen_random_uuid(), instance_id uuid, aud text, role text, email text,
  raw_app_meta_data jsonb, raw_user_meta_data jsonb default '{}',
  confirmation_token text, recovery_token text, email_change text, email_change_token_new text,
  email_change_token_current text, phone_change text, phone_change_token text, reauthentication_token text,
  created_at timestamptz, updated_at timestamptz);
create function auth.jwt() returns jsonb language sql stable as
  $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
grant usage on schema auth to anon, authenticated, service_role;
grant execute on function auth.jwt() to anon, authenticated, service_role;

create schema storage;
create table storage.buckets (id text primary key, public boolean, file_size_limit bigint, allowed_mime_types text[]);
insert into storage.buckets (id, public) values ('resumes', false);

create table public.profiles (id uuid primary key, full_name text);
create function public.handle_new_user() returns trigger language plpgsql security definer set search_path to '' as $f$
begin insert into public.profiles (id, full_name) values (new.id, coalesce(new.raw_user_meta_data->>'full_name', '')); return new; end; $f$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

create table public.auth_identities (
  user_id uuid not null references auth.users(id), email text, provider text,
  clerk_user_id text unique, last_login_at timestamptz);

-- Verbatim from the live project.
create function public.app_user_id() returns uuid language sql stable security definer set search_path to 'public' as $f$
  select coalesce(
    (select ai.user_id from public.auth_identities ai where ai.clerk_user_id = (auth.jwt() ->> 'sub')),
    case when (auth.jwt() ->> 'sub') ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
         then (auth.jwt() ->> 'sub')::uuid end);
$f$;
revoke all on function public.app_user_id() from public;
grant execute on function public.app_user_id() to anon, authenticated, service_role;

-- Live link_clerk_identity / create_clerk_account (before the migration).
create function public.link_clerk_identity() returns uuid language plpgsql security definer set search_path to 'public' as $f$
declare
  v_sub   text := auth.jwt() ->> 'sub';
  v_email text := lower(nullif(auth.jwt() ->> 'email', ''));
  v_id    uuid;
begin
  if v_sub is null or v_email is null then raise exception 'session token is missing sub or email'; end if;
  update public.auth_identities set clerk_user_id = v_sub, last_login_at = now()
   where email = v_email and (clerk_user_id is null or clerk_user_id = v_sub)
  returning user_id into v_id;
  return v_id;
end; $f$;
revoke all on function public.link_clerk_identity() from public;
grant execute on function public.link_clerk_identity() to anon, authenticated, service_role;

create function public.create_clerk_account() returns uuid language plpgsql security definer set search_path to 'public' as $f$
declare
  v_sub   text := auth.jwt() ->> 'sub';
  v_email text := lower(nullif(btrim(auth.jwt() ->> 'email'), ''));
  v_id    uuid;
begin
  if v_sub is null or v_email is null then raise exception 'session token is missing sub or email'; end if;
  if v_sub !~ '^user_[A-Za-z0-9]+$' then raise exception 'only a Clerk session can create an account'; end if;
  perform pg_advisory_xact_lock(hashtextextended('create_clerk_account:' || v_sub, 0));
  select ai.user_id into v_id from public.auth_identities ai where ai.clerk_user_id = v_sub;
  if v_id is not null then return v_id; end if;
  if exists (select 1 from public.auth_identities ai where lower(ai.email) = v_email)
     or exists (select 1 from auth.users u where lower(u.email) = v_email) then
    raise exception 'email already belongs to another account' using errcode = 'CF409';
  end if;
  insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data,
    confirmation_token, recovery_token, email_change, email_change_token_new, email_change_token_current,
    phone_change, phone_change_token, reauthentication_token, created_at, updated_at)
  values (gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', v_email,
    jsonb_build_object('provider','clerk','providers',jsonb_build_array('clerk')), '{}'::jsonb,
    '','','','','','','','', now(), now())
  returning id into v_id;
  insert into public.auth_identities (user_id, email, provider, clerk_user_id, last_login_at)
  values (v_id, v_email, 'clerk', v_sub, now());
  return v_id;
end; $f$;
revoke all on function public.create_clerk_account() from public;
grant execute on function public.create_clerk_account() to authenticated, service_role;

-- user_ai_settings + the live (pre-migration) touch trigger.
create table public.user_ai_settings (id uuid primary key references auth.users(id), provider text, api_key text, key_hint text, updated_at timestamptz);
create function public.touch_user_ai_settings() returns trigger language plpgsql as $f$
begin
  new.updated_at := now();
  new.key_hint := case when new.api_key is null then null else '…' || right(new.api_key, 4) end;
  return new;
end; $f$;
create trigger user_ai_settings_touch before insert or update on public.user_ai_settings for each row execute function public.touch_user_ai_settings();

-- Tables carrying a contact_id, with the live policies (names and conditions as of 2026-11-05).
create table public.contacts (id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users(id), first_name text);
create table public.scheduled_outreach (id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users(id), contact_id uuid references public.contacts(id), subject text);
create table public.applications (id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users(id), contact_id uuid references public.contacts(id), company text);
create table public.contact_meetings (id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users(id), contact_id uuid references public.contacts(id), title text);
create table public.meeting_notes (id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users(id), contact_id uuid references public.contacts(id), body text);
alter table public.contacts enable row level security;
alter table public.scheduled_outreach enable row level security;
alter table public.applications enable row level security;
alter table public.contact_meetings enable row level security;
alter table public.meeting_notes enable row level security;
create policy "read own contacts" on public.contacts for select to authenticated using (app_user_id() = owner_id);
create policy "insert own contacts" on public.contacts for insert to authenticated with check (app_user_id() = owner_id);
create policy outreach_all_own on public.scheduled_outreach for all to public using (app_user_id() = owner_id) with check (app_user_id() = owner_id);
create policy applications_delete_own on public.applications for delete to authenticated using (app_user_id() = owner_id);
create policy applications_insert_own on public.applications for insert to authenticated with check (app_user_id() = owner_id);
create policy applications_select_own on public.applications for select to authenticated using (app_user_id() = owner_id);
create policy applications_update_own on public.applications for update to authenticated using (app_user_id() = owner_id);
create policy meetings_delete_own on public.contact_meetings for delete to authenticated using (app_user_id() = owner_id);
create policy meetings_insert_own on public.contact_meetings for insert to authenticated with check (app_user_id() = owner_id);
create policy meetings_select_own on public.contact_meetings for select to authenticated using (app_user_id() = owner_id);
create policy meetings_update_own on public.contact_meetings for update to authenticated using (app_user_id() = owner_id) with check (app_user_id() = owner_id);
create policy "delete own meeting_notes" on public.meeting_notes for delete to authenticated using (app_user_id() = owner_id);
create policy "insert own meeting_notes" on public.meeting_notes for insert to authenticated with check (app_user_id() = owner_id);
create policy "read own meeting_notes" on public.meeting_notes for select to authenticated using (app_user_id() = owner_id);
create policy "update own meeting_notes" on public.meeting_notes for update to authenticated using (app_user_id() = owner_id) with check (app_user_id() = owner_id);
grant select, insert, update, delete on public.contacts, public.scheduled_outreach, public.applications, public.contact_meetings, public.meeting_notes to authenticated;
grant select on public.auth_identities to service_role;

-- ── The migration under test: part 1, then part 2 as its own statement batch. ──
-- (The file is one document; split it at the PART 2 marker exactly as it is applied live.)
\set part1 `awk '/PART 2 \(separate migration\)/{exit} {print}' docs/migration_2026-11-06_db_hardening.sql`
\set part2 `awk 'f{print} /PART 2 \(separate migration\)/{f=1}' docs/migration_2026-11-06_db_hardening.sql`
:part1
:part2

-- Data: two users with a contact each; unclaimed identities; one already-linked user.
insert into auth.users (id) values ('11111111-1111-4111-8111-111111111111'), ('22222222-2222-4222-8222-222222222222'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'), ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'), ('cccccccc-cccc-4ccc-8ccc-cccccccccccc'), ('dddddddd-dddd-4ddd-8ddd-dddddddddddd');
insert into public.auth_identities (user_id, email, provider, clerk_user_id) values
  ('11111111-1111-4111-8111-111111111111', 'me@x.test',   'clerk', 'user_me'),
  ('22222222-2222-4222-8222-222222222222', 'them@x.test', 'clerk', 'user_them'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'a@x.test', 'email', null),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'b@x.test', 'email', null),
  ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'c@x.test', 'email', null),
  ('dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'd@x.test', 'clerk', 'user_d');
insert into public.contacts (id, owner_id, first_name) values
  ('c1111111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-111111111111', 'mine'),
  ('c2222222-2222-4222-8222-222222222222', '22222222-2222-4222-8222-222222222222', 'theirs');
-- Pre-existing own rows to update in the update checks.
insert into public.scheduled_outreach (id, owner_id) values ('51111111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-111111111111');
insert into public.applications (id, owner_id) values ('a1111111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-111111111111');
insert into public.contact_meetings (id, owner_id) values ('e1111111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-111111111111');
insert into public.meeting_notes (id, owner_id) values ('f1111111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-111111111111');

\if :{?rls_off}
  \echo '*** NEGATIVE CONTROL: row level security switched OFF on the five tables ***'
  alter table public.contacts disable row level security;
  alter table public.scheduled_outreach disable row level security;
  alter table public.applications disable row level security;
  alter table public.contact_meetings disable row level security;
  alter table public.meeting_notes disable row level security;
\endif

create temp table results (name text, ok boolean);
grant all on results to anon, authenticated, service_role;
create function pg_temp.claims(c text) returns void language sql as $$ select set_config('request.jwt.claims', c, false) $$;
-- Runs stmt; ok == it was refused by RLS (insufficient_privilege).
create function pg_temp.refused(n text, stmt text) returns void language plpgsql as $$
begin
  execute stmt;
  insert into results values (n, false);
exception when insufficient_privilege then insert into results values (n, true);
end $$;
-- Runs stmt; ok == it succeeded and touched exactly one row (or p_rows rows).
create function pg_temp.allowed(n text, stmt text, p_rows int default 1) returns void language plpgsql as $$
declare c int;
begin
  execute stmt;
  get diagnostics c = row_count;
  insert into results values (n, c = p_rows);
exception when others then insert into results values (n || ' (' || sqlerrm || ')', false);
end $$;
grant execute on function pg_temp.claims(text), pg_temp.refused(text, text), pg_temp.allowed(text, text, int) to anon, authenticated;

-- 1. M1 as "me". Their contact id is known to me (the leak scenario).
set role authenticated;
select pg_temp.claims('{"sub":"user_me"}');

select pg_temp.refused('outreach insert: their contact refused',  $$insert into public.scheduled_outreach (owner_id, contact_id) values ('11111111-1111-4111-8111-111111111111','c2222222-2222-4222-8222-222222222222')$$);
select pg_temp.refused('applications insert: their contact refused', $$insert into public.applications (owner_id, contact_id) values ('11111111-1111-4111-8111-111111111111','c2222222-2222-4222-8222-222222222222')$$);
select pg_temp.refused('meetings insert: their contact refused', $$insert into public.contact_meetings (owner_id, contact_id) values ('11111111-1111-4111-8111-111111111111','c2222222-2222-4222-8222-222222222222')$$);
select pg_temp.refused('notes insert: their contact refused',    $$insert into public.meeting_notes (owner_id, contact_id) values ('11111111-1111-4111-8111-111111111111','c2222222-2222-4222-8222-222222222222')$$);

select pg_temp.refused('outreach update: re-point to their contact refused', $$update public.scheduled_outreach set contact_id='c2222222-2222-4222-8222-222222222222' where id='51111111-1111-4111-8111-111111111111'$$);
select pg_temp.refused('applications update: re-point to their contact refused', $$update public.applications set contact_id='c2222222-2222-4222-8222-222222222222' where id='a1111111-1111-4111-8111-111111111111'$$);
select pg_temp.refused('meetings update: re-point to their contact refused', $$update public.contact_meetings set contact_id='c2222222-2222-4222-8222-222222222222' where id='e1111111-1111-4111-8111-111111111111'$$);
select pg_temp.refused('notes update: re-point to their contact refused', $$update public.meeting_notes set contact_id='c2222222-2222-4222-8222-222222222222' where id='f1111111-1111-4111-8111-111111111111'$$);

select pg_temp.allowed('outreach insert: own contact allowed',  $$insert into public.scheduled_outreach (owner_id, contact_id) values ('11111111-1111-4111-8111-111111111111','c1111111-1111-4111-8111-111111111111')$$);
select pg_temp.allowed('applications insert: own contact allowed', $$insert into public.applications (owner_id, contact_id) values ('11111111-1111-4111-8111-111111111111','c1111111-1111-4111-8111-111111111111')$$);
select pg_temp.allowed('meetings insert: own contact allowed', $$insert into public.contact_meetings (owner_id, contact_id) values ('11111111-1111-4111-8111-111111111111','c1111111-1111-4111-8111-111111111111')$$);
select pg_temp.allowed('notes insert: own contact allowed',    $$insert into public.meeting_notes (owner_id, contact_id) values ('11111111-1111-4111-8111-111111111111','c1111111-1111-4111-8111-111111111111')$$);

select pg_temp.allowed('outreach insert: null contact allowed',  $$insert into public.scheduled_outreach (owner_id, contact_id) values ('11111111-1111-4111-8111-111111111111', null)$$);
select pg_temp.allowed('applications insert: null contact allowed', $$insert into public.applications (owner_id, contact_id) values ('11111111-1111-4111-8111-111111111111', null)$$);
select pg_temp.allowed('meetings insert: null contact allowed', $$insert into public.contact_meetings (owner_id, contact_id) values ('11111111-1111-4111-8111-111111111111', null)$$);
select pg_temp.allowed('notes insert: null contact allowed',    $$insert into public.meeting_notes (owner_id, contact_id) values ('11111111-1111-4111-8111-111111111111', null)$$);

select pg_temp.allowed('outreach update: own contact allowed', $$update public.scheduled_outreach set contact_id='c1111111-1111-4111-8111-111111111111' where id='51111111-1111-4111-8111-111111111111'$$);
select pg_temp.allowed('applications update: own contact allowed', $$update public.applications set contact_id='c1111111-1111-4111-8111-111111111111' where id='a1111111-1111-4111-8111-111111111111'$$);
select pg_temp.allowed('meetings update: own contact allowed', $$update public.contact_meetings set contact_id='c1111111-1111-4111-8111-111111111111' where id='e1111111-1111-4111-8111-111111111111'$$);
select pg_temp.allowed('notes update: own contact allowed', $$update public.meeting_notes set contact_id='c1111111-1111-4111-8111-111111111111' where id='f1111111-1111-4111-8111-111111111111'$$);
select pg_temp.allowed('notes update: set back to null allowed', $$update public.meeting_notes set contact_id=null where id='f1111111-1111-4111-8111-111111111111'$$);
select pg_temp.refused('outreach insert: row owned by someone else still refused', $$insert into public.scheduled_outreach (owner_id) values ('22222222-2222-4222-8222-222222222222')$$);

-- 2. H4: email_verified claim. Each call is made as `authenticated` with that token.
create function pg_temp.linked(n text, c text, expected uuid) returns void language plpgsql as $$
declare got uuid;
begin
  perform pg_temp.claims(c);
  got := public.link_clerk_identity();
  insert into results values (n, got is not distinct from expected);
exception when others then insert into results values (n || ' (' || sqlerrm || ')', false);
end $$;
create function pg_temp.created_refused(n text, c text) returns void language plpgsql as $$
begin
  perform pg_temp.claims(c);
  perform public.create_clerk_account();
  insert into results values (n, false);
exception when sqlstate 'CF403' then insert into results values (n, true);
          when others then insert into results values (n || ' (' || sqlerrm || ')', false);
end $$;
grant execute on function pg_temp.linked(text,text,uuid), pg_temp.created_refused(text,text) to authenticated;

-- claim ABSENT -> today's behaviour: the unclaimed row links.
select pg_temp.linked('claim absent: unclaimed row links (old behaviour)', '{"sub":"user_a","email":"a@x.test"}', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
-- claim FALSE -> refused, row stays unclaimed; string "false" and the empty string are also "not true".
select pg_temp.linked('claim false: unclaimed row NOT linked', '{"sub":"user_b","email":"b@x.test","email_verified":false}', null);
select pg_temp.linked('claim "false" string: NOT linked', '{"sub":"user_b","email":"b@x.test","email_verified":"false"}', null);
select pg_temp.linked('claim empty string: NOT linked', '{"sub":"user_b","email":"b@x.test","email_verified":""}', null);
-- claim TRUE (boolean or string) -> links.
select pg_temp.linked('claim true: unclaimed row links', '{"sub":"user_c","email":"c@x.test","email_verified":true}', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc');
-- Already-linked user is unaffected by the claim, in every state.
select pg_temp.linked('already linked + claim absent: signs in', '{"sub":"user_d","email":"d@x.test"}', 'dddddddd-dddd-4ddd-8ddd-dddddddddddd');
select pg_temp.linked('already linked + claim false: signs in', '{"sub":"user_d","email":"d@x.test","email_verified":false}', 'dddddddd-dddd-4ddd-8ddd-dddddddddddd');
select pg_temp.linked('already linked + claim true: signs in', '{"sub":"user_d","email":"d@x.test","email_verified":true}', 'dddddddd-dddd-4ddd-8ddd-dddddddddddd');
-- create_clerk_account: refuses claim false for a brand-new user, allows absent/true, and an
-- already-linked sub is returned before the claim is even looked at.
select pg_temp.created_refused('create_clerk_account: claim false refused', '{"sub":"user_new1","email":"new1@x.test","email_verified":false}');
do $$ declare v uuid; begin
  perform pg_temp.claims('{"sub":"user_new2","email":"new2@x.test"}');
  v := public.create_clerk_account();
  insert into results values ('create_clerk_account: claim absent creates (old behaviour)', v is not null);
exception when others then insert into results values ('create_clerk_account: claim absent creates (' || sqlerrm || ')', false); end $$;
do $$ declare v uuid; begin
  perform pg_temp.claims('{"sub":"user_new3","email":"new3@x.test","email_verified":true}');
  v := public.create_clerk_account();
  insert into results values ('create_clerk_account: claim true creates', v is not null);
exception when others then insert into results values ('create_clerk_account: claim true creates (' || sqlerrm || ')', false); end $$;
do $$ declare v uuid; begin
  perform pg_temp.claims('{"sub":"user_d","email":"d@x.test","email_verified":false}');
  v := public.create_clerk_account();
  insert into results values ('create_clerk_account: already-linked + claim false returns existing', v = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd');
exception when others then insert into results values ('create_clerk_account: already-linked + claim false (' || sqlerrm || ')', false); end $$;

-- Users cannot read or write the observation or usage tables, or call the counter helper.
select pg_temp.refused('authenticated cannot read auth_claim_observations', $$select * from public.auth_claim_observations$$);
select pg_temp.refused('authenticated cannot write auth_claim_observations', $$update public.auth_claim_observations set claim_true = 0$$);
select pg_temp.refused('authenticated cannot read ai_settings_usage', $$select * from public.ai_settings_usage$$);
select pg_temp.refused('authenticated cannot call note_email_verified_claim', $$select public.note_email_verified_claim()$$);
select pg_temp.refused('authenticated cannot call consume_ai_settings_attempt', $$select public.consume_ai_settings_attempt('11111111-1111-4111-8111-111111111111', 5)$$);

-- 3. L8 as anon.
set role anon;
select pg_temp.refused('anon cannot execute app_user_id', $$select public.app_user_id()$$);
select pg_temp.refused('anon cannot execute link_clerk_identity', $$select public.link_clerk_identity()$$);
select pg_temp.refused('anon cannot execute handle_new_user', $$select public.handle_new_user()$$);
select pg_temp.refused('anon cannot execute touch_user_ai_settings', $$select public.touch_user_ai_settings()$$);
set role authenticated;
select pg_temp.claims('{"sub":"user_me"}');
insert into results select 'authenticated can still execute app_user_id', public.app_user_id() = '11111111-1111-4111-8111-111111111111';

-- 4. Superuser-side facts.
reset role;
insert into results select 'claim counters: 3 absent, 3 true, 4 false (create_clerk_account refusal rolls its own count back)', (select claim_absent from public.auth_claim_observations) = 3
  and (select claim_false from public.auth_claim_observations) = 4 and (select claim_true from public.auth_claim_observations) = 3 ;
insert into results select 'unclaimed b row still unclaimed', (select clerk_user_id is null from public.auth_identities where email = 'b@x.test');
insert into results select 'resumes bucket: 5 MB limit', (select file_size_limit = 5242880 from storage.buckets where id = 'resumes');
insert into results select 'resumes bucket: pdf, doc, docx only', (select allowed_mime_types @> array['application/pdf','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document'] and cardinality(allowed_mime_types) = 3 from storage.buckets where id = 'resumes');
insert into results select 'handle_new_user trigger still fires after revoke (profile row exists)', exists (select 1 from public.profiles where id = '11111111-1111-4111-8111-111111111111');
insert into public.user_ai_settings (id, provider, api_key) values ('11111111-1111-4111-8111-111111111111', 'openrouter', 'sk-secret-1234');
insert into results select 'touch trigger still fires after revoke (key_hint set)', (select key_hint = '…1234' and updated_at is not null from public.user_ai_settings);
insert into results select 'touch_user_ai_settings has search_path set', (select proconfig @> array['search_path=""'] from pg_proc where proname = 'touch_user_ai_settings');

-- 5. L4: the daily cap (service_role, like the Edge Function).
set role service_role;
create temp table cap as select 1 as n;  -- placeholder so the role has a temp context
insert into results select 'cap: 1st attempt counts', public.consume_ai_settings_attempt('11111111-1111-4111-8111-111111111111', 2) = 1;
insert into results select 'cap: 2nd attempt counts', public.consume_ai_settings_attempt('11111111-1111-4111-8111-111111111111', 2) = 2;
insert into results select 'cap: 3rd attempt refused (NULL)', public.consume_ai_settings_attempt('11111111-1111-4111-8111-111111111111', 2) is null;
insert into results select 'cap: another user unaffected', public.consume_ai_settings_attempt('22222222-2222-4222-8222-222222222222', 2) = 1;
insert into results select 'cap: limit 0 refuses', public.consume_ai_settings_attempt('22222222-2222-4222-8222-222222222222', 0) is null;
reset role;

select case when ok then 'PASS' else 'FAIL' end as result, name from results order by ok, name;
select count(*) filter (where ok) as pass, count(*) filter (where not ok) as fail from results;
do $$ begin
  if exists (select 1 from results where not ok) then raise exception 'RLS contact-owner check FAILED'; end if;
end $$;
