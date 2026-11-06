-- DO NOT APPLY YET. Strict mode for the H4 backstop.
--
-- Apply only when ALL are true:
--   1. Bryce added `email_verified` to the Clerk session-token template (Clerk dashboard,
--      Sessions -> Customize session token: "email_verified": "{{user.email_verified}}"
--      or the equivalent claim for your Clerk version).
--   2. select * from public.auth_claim_observations order by day desc;  shows claim_absent
--      NOT growing for several days (every live sign-in carries the claim).
--   3. migration_2026-11-06_db_hardening.sql (parts 1 and 2) is already applied.
--
-- Effect: a claim that is absent now counts as NOT verified, so an unclaimed row can only be
-- taken by a token that says email_verified = true, and create_clerk_account needs it too.
-- Users already bound to a Clerk id (clerk_user_id set) keep signing in whatever the claim says.
-- Rollback: re-apply the two function bodies from migration_2026-11-06_db_hardening.sql.

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
          or (clerk_user_id is null and v_claim = 'true'))
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
  if v_claim <> 'true' then
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
