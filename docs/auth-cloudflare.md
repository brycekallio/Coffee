# Auth: Cloudflare Worker + Supabase database

Sign-in is Google or Microsoft through a Cloudflare Worker. Supabase keeps the
database, the storage buckets, the edge functions and `auth.users` — it just no
longer issues the tokens.

## Why both providers

`colorado.edu` is a Microsoft tenant:

```
$ dig +short MX colorado.edu
colorado-edu.mail.protection.outlook.com
```

Coffee is aimed at CU freshmen and sophomores, so Google-only sign-in would show
the entire target audience a button that cannot work for them. Microsoft is
listed first on the sign-in screen for the same reason.

The Worker uses Microsoft's `common` endpoint, which accepts both work/school
accounts (colorado.edu) and personal Microsoft accounts. A tenant-scoped
endpoint would lock the app to one university.

## Why this works at all

Postgres never talks to GoTrue. RLS reads `sub` out of whatever JWT the request
carries and hands it to `auth.uid()`. So if the Worker signs a token with a key
Supabase trusts, carrying the `sub` the user already had, then **all eight
tables, every RLS policy and every storage policy keep working untouched**.

```
browser ──► /auth/start ──► Google / Microsoft
                               │
browser ◄── session cookie ◄── /auth/callback ──► auth.users (admin API)
   │
   └─ /auth/session ──► 1-hour ES256 JWT ──► Supabase REST / Storage / Functions
```

The browser never holds a refresh token or a password. The session cookie is
HttpOnly and says only "this browser proved it controls <email>"; the Worker
re-derives a fresh one-hour access token from it on every `/auth/session` call.

## Two traps, both already handled

**Setting `accessToken` on the Supabase client disables `supabase.auth.*`
entirely** — every property access on it throws at runtime. TypeScript does
**not** catch this; the calls still compile. All thirteen call sites were found
by hand and replaced with `src/lib/authClient.ts`. If you add a
`supabase.auth.something` later, it will typecheck, build, deploy, and then
throw in front of a user.

**New users must be created through the GoTrue admin API, not with a uuid of our
own.** Every table in `docs/schema.sql` has `references auth.users(id)`, and
there is an `on_auth_user_created` trigger that seeds the profile row. A locally
minted uuid produces a token that passes RLS and then fails every insert on a
foreign key.

## Setup

Steps 1–4 need you; nothing else can proceed without them.

### 1. Generate the signing key

```bash
cd cloudflare/auth
node scripts/generate-signing-key.mjs
```

One key, used twice: the PEM goes into **Supabase → Authentication → JWT Keys →
import**, and the same key goes to the Worker as `SUPABASE_JWT_PRIVATE_JWK`.
Supabase publishes the public half at `/auth/v1/.well-known/jwks.json` and
verifies the Worker's tokens against it.

Confirm the `kid` Supabase displays matches the one the script printed. A
mismatch fails as *key not found*, not as a bad signature, which is a confusing
error to debug.

### 2. OAuth clients

**Google** — [console.cloud.google.com](https://console.cloud.google.com) →
APIs & Services → Credentials → OAuth client ID → Web application.
Authorised redirect URI: `https://<your-domain>/auth/callback`.

**Microsoft** — [entra.microsoft.com](https://entra.microsoft.com) → App
registrations → New registration. Under *Supported account types* pick
**"Accounts in any organizational directory and personal Microsoft accounts"** —
anything narrower excludes either CU or everyone else. Redirect URI (type Web):
`https://<your-domain>/auth/callback`.

### 3. Domain

The Worker must run on the **same origin as the app**, as a route on `/auth/*`.
A separate `auth.<domain>` subdomain makes the session cookie third-party and
puts it behind every browser's cookie blocking. Attach the domain to Cloudflare
and fill in the `[[routes]]` block in `wrangler.toml`.

### 4. Secrets and deploy

```bash
cd cloudflare/auth
npm install
for s in SUPABASE_SERVICE_ROLE_KEY SUPABASE_JWT_PRIVATE_JWK SUPABASE_JWT_KID \
         SESSION_SECRET GOOGLE_CLIENT_ID GOOGLE_CLIENT_SECRET \
         MICROSOFT_CLIENT_ID MICROSOFT_CLIENT_SECRET; do
  npx wrangler secret put "$s"
done
npx wrangler deploy
```

### 5. Database

Run `docs/migration_cloudflare_auth.sql` once. It adds `public.auth_identities`
and **seeds it from the users who already exist**.

That seed is the whole migration for existing users. Without it, the first
Google sign-in by an existing user mints a brand new uuid and that person sees an
empty account with all their data still in the database under the old one.

Verify:

```sql
select count(*) from public.auth_identities;
select count(*) from auth.users where email is not null;   -- must match
```

## What existing users experience

Everyone signs in again once, with the provider matching the address already on
their account — the email is the join key, so their data follows them.

The one exception is an address no provider owns (an iCloud or similar account
that was created with an email and password). Those need the address changed in
`auth.users` to one they can actually sign in with, or a new sign-in and a
manual re-point of `auth_identities.user_id`.

## Reverting

Delete the `accessToken` option in `src/lib/supabase.ts` and restore the
`supabase.auth.*` calls. The database is untouched by the switch — `auth.users`
is still the registry, and GoTrue still works — so a revert is a frontend
change, not a data migration.
