-- Open sign-ups (decided 2026-11-02, Projects/Coffee/CLAUDE.md -> Decisions).
--
-- Additive only: one new function. link_clerk_identity, app_user_id, every policy and
-- every existing row are untouched, so the 13 existing accounts behave exactly as before.
--
-- How sign-in works after this:
--   1. link_clerk_identity()   -- unchanged. Binds the Clerk user to the account that
--                                 already holds their email; returns its UUID, or null.
--   2. create_clerk_account()  -- new. Only called when step 1 returned null: makes a
--                                 fresh, empty account for this Clerk user and returns it.
--
-- Why a row in auth.users at all: every owner_id / profiles.id column has a foreign key to
-- auth.users(id). Inserting the row is what lets the new user's own rows exist. The
-- on_auth_user_created trigger then creates their blank profiles row, like any other user.
--
-- The auth.users row has no email and no password on purpose. Supabase's own sign-in is
-- not used (Clerk owns sessions), so nothing should be able to start a Supabase session for
-- this account. The email lives in auth_identities, where link_clerk_identity reads it.

create or replace function public.create_clerk_account()
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

  -- Clerk subjects look like "user_2abc...". A UUID subject would be a Supabase-issued
  -- session, which already belongs to an account and must never mint a second one.
  if v_sub !~ '^user_[A-Za-z0-9]+$' then
    raise exception 'only a Clerk session can create an account';
  end if;

  -- Serialise per Clerk user: React StrictMode, two tabs or a retry can call this twice at
  -- once, and both must get the same account rather than one of them an error.
  perform pg_advisory_xact_lock(hashtextextended('create_clerk_account:' || v_sub, 0));

  select ai.user_id into v_id
    from public.auth_identities ai
   where ai.clerk_user_id = v_sub;
  if v_id is not null then
    return v_id;
  end if;

  -- The email already belongs to an account that a *different* Clerk user has claimed
  -- (link_clerk_identity returned null for this one). Never create a second account beside
  -- it and never take it over: refuse, and let the app say so.
  if exists (select 1 from public.auth_identities ai where ai.email = v_email) then
    raise exception 'email already belongs to another account'
      using errcode = 'CF409';
  end if;

  -- Token columns are '' rather than null, matching every existing row: Supabase's auth
  -- server fails to scan a null there, which would break the dashboard's user list.
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

-- Supabase's default privileges grant EXECUTE on new functions to anon as well; revoke it
-- explicitly (revoking from public alone leaves that grant in place).
revoke all on function public.create_clerk_account() from public;
revoke all on function public.create_clerk_account() from anon;
grant execute on function public.create_clerk_account() to authenticated;

-- Verify afterwards:
--   select grantee from information_schema.routine_privileges
--    where routine_name = 'create_clerk_account';   -- authenticated, postgres, service_role
