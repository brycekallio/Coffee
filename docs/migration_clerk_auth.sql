-- Clerk third-party auth.
--
-- Supabase trusts Clerk's JWTs directly, so there is no signing key to import
-- and no Worker minting tokens. What changes is who `sub` refers to: Clerk's
-- user id ("user_2abc..."), not the Supabase UUID that every row is keyed on.
--
-- All 21 policies are `auth.uid() = owner_id`, so the whole rewrite is one
-- substitution: auth.uid() -> public.app_user_id(), which maps a Clerk subject
-- back to the UUID that user's data already uses. Nobody's rows move.
--
-- DO NOT RUN until the Clerk integration is added in the Supabase dashboard and
-- the session token is confirmed to carry an `email` claim.

-- ---------------------------------------------------------------------------
-- 1. The mapping
-- ---------------------------------------------------------------------------

alter table public.auth_identities
  add column if not exists clerk_user_id text unique;

/**
 * The Supabase UUID for whoever is making this request.
 *
 * Handles both token types on purpose. During the switchover some sessions are
 * still Supabase-issued (sub is a UUID) and some are Clerk's (sub is
 * "user_2abc..."). Note the regex guard: auth.uid() casts sub to uuid and raises
 * on a Clerk subject, so this cannot simply coalesce the two.
 */
create or replace function public.app_user_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select ai.user_id
       from public.auth_identities ai
      where ai.clerk_user_id = (auth.jwt() ->> 'sub')),
    case
      when (auth.jwt() ->> 'sub') ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
      then (auth.jwt() ->> 'sub')::uuid
    end
  );
$$;

revoke all on function public.app_user_id() from public;
grant execute on function public.app_user_id() to authenticated;

/**
 * Attaches a Clerk subject to the row that already owns this person's data,
 * matched on the email Clerk verified. Called once by the app after sign-in.
 *
 * This is what preserves thirteen existing accounts: the first time someone
 * signs in through Clerk, their new Clerk id is bound to the UUID their
 * contacts, applications and meetings are already keyed on, rather than a fresh
 * account being created beside their data.
 *
 * Returns null for an email nobody holds -- a genuinely new user -- which the
 * caller handles by provisioning.
 */
create or replace function public.link_clerk_identity()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sub   text := auth.jwt() ->> 'sub';
  v_email text := lower(nullif(auth.jwt() ->> 'email', ''));
  v_id    uuid;
begin
  if v_sub is null or v_email is null then
    raise exception 'session token is missing sub or email';
  end if;

  -- Only claim a row that is unclaimed or already ours. Without that guard, two
  -- Clerk accounts sharing an email address would take turns stealing each
  -- other's data.
  update public.auth_identities
     set clerk_user_id = v_sub,
         last_login_at = now()
   where email = v_email
     and (clerk_user_id is null or clerk_user_id = v_sub)
  returning user_id into v_id;

  return v_id;
end;
$$;

revoke all on function public.link_clerk_identity() from public;
grant execute on function public.link_clerk_identity() to authenticated;

-- ---------------------------------------------------------------------------
-- 2. The policies
-- ---------------------------------------------------------------------------
-- Mechanical: every policy is `auth.uid() = <owner column>`. Written out rather
-- than generated so the diff is reviewable and a mistake is visible.

alter policy "applications_select_own" on public.applications using (public.app_user_id() = owner_id);
alter policy "applications_insert_own" on public.applications with check (public.app_user_id() = owner_id);
alter policy "applications_update_own" on public.applications using (public.app_user_id() = owner_id);
alter policy "applications_delete_own" on public.applications using (public.app_user_id() = owner_id);

alter policy "meetings_select_own" on public.contact_meetings using (public.app_user_id() = owner_id);
alter policy "meetings_insert_own" on public.contact_meetings with check (public.app_user_id() = owner_id);
alter policy "meetings_update_own" on public.contact_meetings using (public.app_user_id() = owner_id) with check (public.app_user_id() = owner_id);
alter policy "meetings_delete_own" on public.contact_meetings using (public.app_user_id() = owner_id);

alter policy "read own contacts"   on public.contacts using (public.app_user_id() = owner_id);
alter policy "insert own contacts" on public.contacts with check (public.app_user_id() = owner_id);
alter policy "update own contacts" on public.contacts using (public.app_user_id() = owner_id) with check (public.app_user_id() = owner_id);
alter policy "delete own contacts" on public.contacts using (public.app_user_id() = owner_id);

alter policy "read own meeting_notes"   on public.meeting_notes using (public.app_user_id() = owner_id);
alter policy "insert own meeting_notes" on public.meeting_notes with check (public.app_user_id() = owner_id);
alter policy "update own meeting_notes" on public.meeting_notes using (public.app_user_id() = owner_id) with check (public.app_user_id() = owner_id);
alter policy "delete own meeting_notes" on public.meeting_notes using (public.app_user_id() = owner_id);

alter policy "read own profile"   on public.profiles using (public.app_user_id() = id);
alter policy "insert own profile" on public.profiles with check (public.app_user_id() = id);
alter policy "update own profile" on public.profiles using (public.app_user_id() = id) with check (public.app_user_id() = id);

alter policy "outreach_all_own" on public.scheduled_outreach using (public.app_user_id() = owner_id) with check (public.app_user_id() = owner_id);

alter policy "user_ai_settings_select_own" on public.user_ai_settings using (public.app_user_id() = id);

-- Verify afterwards: every policy should mention app_user_id and none auth.uid.
--   select tablename, policyname, qual, with_check from pg_policies
--   where schemaname = 'public' and (qual like '%auth.uid%' or with_check like '%auth.uid%');
