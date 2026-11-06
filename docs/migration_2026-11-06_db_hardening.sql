-- DB hardening (2026-11-06): audit items M1, H4 backstop, L3, L4, L8.
-- Source: reviews/code-audit-2026-11-05.md, ticket B. NOT applied to the live project yet.
--
-- Live bodies/policies were read from the live project on 2026-11-05 (pg_policies,
-- pg_get_functiondef), not copied from older repo files.
--
-- Apply as TWO migrations, in order (Supabase's event trigger re-grants ALL on new public
-- tables at the end of the creating transaction, so the revoke in part 2 must be separate):
--   Part 1 = everything down to the "PART 2" marker.  Part 2 = the marker to the end.
-- Prove it first: psql -d <throwaway> -f docs/rls_contact_owner_check.sql
--
-- Apply-order safety (12 live users):
--   * M1: live data had 0 cross-owner rows on 2026-11-05, so no existing row is affected.
--   * H4: with the email_verified claim ABSENT from the session token, behaviour is exactly
--     today's (the claim is only counted). Only a claim that is PRESENT and not true refuses
--     a first claim of an unclaimed row / a new account. Already-linked users never look at it.
--   * L8/L3/L4 touch no path the signed-in app uses.

-- ═════════════════════════ PART 1 ═════════════════════════

-- ── M1. A row's contact_id must be one of the caller's own contacts ────────────────────
-- Same policies as live; only the INSERT/UPDATE check gains the contact condition.
-- Live policy names: scheduled_outreach.outreach_all_own (ALL, public), applications_*_own,
-- meetings_*_own (contact_meetings), "insert/update own meeting_notes".
alter policy outreach_all_own on public.scheduled_outreach
  with check (
    app_user_id() = owner_id
    and (contact_id is null or exists (
      select 1 from public.contacts c where c.id = contact_id and c.owner_id = app_user_id()))
  );

alter policy applications_insert_own on public.applications
  with check (
    app_user_id() = owner_id
    and (contact_id is null or exists (
      select 1 from public.contacts c where c.id = contact_id and c.owner_id = app_user_id()))
  );
-- Live applications_update_own had USING only (Postgres then reuses USING as the check).
alter policy applications_update_own on public.applications
  with check (
    app_user_id() = owner_id
    and (contact_id is null or exists (
      select 1 from public.contacts c where c.id = contact_id and c.owner_id = app_user_id()))
  );

alter policy meetings_insert_own on public.contact_meetings
  with check (
    app_user_id() = owner_id
    and (contact_id is null or exists (
      select 1 from public.contacts c where c.id = contact_id and c.owner_id = app_user_id()))
  );
alter policy meetings_update_own on public.contact_meetings
  with check (
    app_user_id() = owner_id
    and (contact_id is null or exists (
      select 1 from public.contacts c where c.id = contact_id and c.owner_id = app_user_id()))
  );

alter policy "insert own meeting_notes" on public.meeting_notes
  with check (
    app_user_id() = owner_id
    and (contact_id is null or exists (
      select 1 from public.contacts c where c.id = contact_id and c.owner_id = app_user_id()))
  );
alter policy "update own meeting_notes" on public.meeting_notes
  with check (
    app_user_id() = owner_id
    and (contact_id is null or exists (
      select 1 from public.contacts c where c.id = contact_id and c.owner_id = app_user_id()))
  );

-- ── H4 backstop. Observation table: how often does the Clerk token carry email_verified? ─
-- No PII: one row per UTC day with counters. Nobody but the SECURITY DEFINER functions and
-- service_role touches it (RLS on, no policies, privileges revoked in part 2).
create table if not exists public.auth_claim_observations (
  day           date    primary key,
  claim_true    integer not null default 0,
  claim_false   integer not null default 0,
  claim_absent  integer not null default 0
);
comment on table public.auth_claim_observations is
  'Per-day count of link_clerk_identity/create_clerk_account calls by email_verified claim state. Present = claim_true + claim_false. Flip to strict (docs/migration_LATER_email_verified_strict.sql) once claim_absent stops growing.';
alter table public.auth_claim_observations enable row level security;

-- Returns 'true' | 'false' | 'absent' for the current token and counts it. Internal only.
create or replace function public.note_email_verified_claim()
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_raw   text := auth.jwt() ->> 'email_verified';
  v_state text := case when v_raw is null then 'absent' when lower(v_raw) = 'true' then 'true' else 'false' end;
begin
  insert into public.auth_claim_observations as o (day, claim_true, claim_false, claim_absent)
  values ((now() at time zone 'utc')::date,
          (v_state = 'true')::int, (v_state = 'false')::int, (v_state = 'absent')::int)
  on conflict (day) do update
    set claim_true   = o.claim_true   + (v_state = 'true')::int,
        claim_false  = o.claim_false  + (v_state = 'false')::int,
        claim_absent = o.claim_absent + (v_state = 'absent')::int;
  return v_state;
end;
$$;
revoke all on function public.note_email_verified_claim() from public, anon, authenticated;

-- Live body + the claim check. claim 'false' (present, not true) => never claim an unclaimed
-- row. 'absent' or 'true' => today's behaviour. A row already bound to this sub is always
-- returned, whatever the claim says.
create or replace function public.link_clerk_identity()
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_sub   text := auth.jwt() ->> 'sub';
  v_email text := lower(nullif(auth.jwt() ->> 'email', ''));
  v_id    uuid;
  v_claim text;
begin
  if v_sub is null or v_email is null then
    raise exception 'session token is missing sub or email';
  end if;

  v_claim := public.note_email_verified_claim();

  update public.auth_identities
     set clerk_user_id = v_sub,
         last_login_at = now()
   where email = v_email
     and (clerk_user_id = v_sub
          or (clerk_user_id is null and v_claim <> 'false'))
  returning user_id into v_id;

  return v_id;
end;
$$;

create or replace function public.create_clerk_account()
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_sub   text := auth.jwt() ->> 'sub';
  v_email text := lower(nullif(btrim(auth.jwt() ->> 'email'), ''));
  v_id    uuid;
  v_claim text;
begin
  if v_sub is null or v_email is null then
    raise exception 'session token is missing sub or email';
  end if;

  if v_sub !~ '^user_[A-Za-z0-9]+$' then
    raise exception 'only a Clerk session can create an account';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('create_clerk_account:' || v_sub, 0));

  select ai.user_id into v_id
    from public.auth_identities ai
   where ai.clerk_user_id = v_sub;
  if v_id is not null then
    return v_id;
  end if;

  v_claim := public.note_email_verified_claim();
  if v_claim = 'false' then
    raise exception 'email is not verified'
      using errcode = 'CF403';
  end if;

  if exists (select 1 from public.auth_identities ai where lower(ai.email) = v_email)
     or exists (select 1 from auth.users u where lower(u.email) = v_email) then
    raise exception 'email already belongs to another account'
      using errcode = 'CF409';
  end if;

  insert into auth.users (
    id, instance_id, aud, role,
    raw_app_meta_data, raw_user_meta_data,
    confirmation_token, recovery_token, email_change, email_change_token_new,
    email_change_token_current, phone_change, phone_change_token, reauthentication_token,
    created_at, updated_at
  ) values (
    gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
    jsonb_build_object('provider', 'clerk', 'providers', jsonb_build_array('clerk')), '{}'::jsonb,
    '', '', '', '',
    '', '', '', '',
    now(), now()
  )
  returning id into v_id;

  insert into public.auth_identities (user_id, email, provider, clerk_user_id, last_login_at)
  values (v_id, v_email, 'clerk', v_sub, now());

  return v_id;
end;
$$;
-- CREATE OR REPLACE keeps the live ACLs (create_clerk_account: authenticated + service_role).

-- ── L3. resumes bucket: 5 MB, PDF / Word only ───────────────────────────────────────────
-- The app accepts .pdf, .doc, .docx (OnboardingPage, SettingsPage); live objects: 6 PDFs, max ~200 KB.
update storage.buckets
   set file_size_limit = 5242880,
       allowed_mime_types = array[
         'application/pdf',
         'application/msword',
         'application/vnd.openxmlformats-officedocument.wordprocessingml.document']
 where id = 'resumes';

-- ── L8. Functions the anon role has no business executing ──────────────────────────────
-- app_user_id / link_clerk_identity: no PUBLIC grant, so revoking anon is enough.
-- Trigger functions are granted to PUBLIC too, so revoke that as well; triggers still fire
-- (EXECUTE is checked at CREATE TRIGGER time, not at fire time). The signed-in app calls
-- only app_user_id and link_clerk_identity, as `authenticated`, which keeps EXECUTE.
-- /demo uses a fake client, nothing anon-side calls these.
revoke execute on function public.app_user_id()          from anon;
revoke execute on function public.link_clerk_identity()  from anon;
revoke execute on function public.handle_new_user()          from public, anon, authenticated;
revoke execute on function public.touch_user_ai_settings()   from public, anon, authenticated;

-- touch_user_ai_settings: immutable search_path (body uses only pg_catalog builtins).
create or replace function public.touch_user_ai_settings()
returns trigger
language plpgsql
set search_path = ''
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
revoke execute on function public.touch_user_ai_settings() from public, anon, authenticated;

-- ── L4. Per-user daily cap on ai-settings test/save (same pattern as ai_free_usage) ─────
create table if not exists public.ai_settings_usage (
  user_id  uuid    not null references auth.users(id) on delete cascade,
  day      date    not null,
  attempts integer not null default 0 check (attempts >= 0),
  primary key (user_id, day)
);
comment on table public.ai_settings_usage is
  'ai-settings test/save attempts per user per UTC day. Written only by consume_ai_settings_attempt() (service_role).';
alter table public.ai_settings_usage enable row level security;

create or replace function public.consume_ai_settings_attempt(p_user uuid, p_limit integer)
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

  insert into public.ai_settings_usage as u (user_id, day, attempts)
  values (p_user, (now() at time zone 'utc')::date, 1)
  on conflict (user_id, day) do update
    set attempts = u.attempts + 1
    where u.attempts < p_limit
  returning u.attempts into v_count;

  return v_count;  -- NULL when the WHERE refused the update
end;
$$;
revoke all on function public.consume_ai_settings_attempt(uuid, integer) from public, anon, authenticated;
grant execute on function public.consume_ai_settings_attempt(uuid, integer) to service_role;

-- ═════════════════════════ PART 2 (separate migration) ═════════════════════════

revoke all on table public.auth_claim_observations from anon, authenticated;
revoke all on table public.ai_settings_usage       from anon, authenticated;
grant select, insert, update, delete on table public.ai_settings_usage to service_role;
grant select on table public.auth_claim_observations to service_role;
