// Getting a real Supabase session for a user we have authenticated ourselves.
//
// The earlier design had this Worker sign its own ES256 JWTs with a key imported
// into Supabase. That works in principle -- Postgres only reads `sub` out of the
// token -- but it rests on being able to import a signing key, and the dashboard
// did not offer it. Rather than forge tokens with a borrowed key, we ask Supabase
// to issue real ones:
//
//   1. admin/generate_link  -> a one-time OTP for this email (service_role)
//   2. auth/v1/verify       -> exchanges it for a genuine session (anon key)
//
// Both calls are server-side and back-to-back; the OTP never leaves this Worker
// and is consumed immediately. What comes back is an ordinary Supabase session,
// signed by Supabase, with a real refresh token -- so nothing downstream has to
// trust anything we made up, and RLS, storage policies and auth.uid() behave
// exactly as they always did.

export interface Env {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  SUPABASE_ANON_KEY: string;
  SESSION_SECRET: string;
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  MICROSOFT_CLIENT_ID?: string;
  MICROSOFT_CLIENT_SECRET?: string;
  APP_ORIGIN?: string;
}

export interface SessionUser {
  id: string;
  email: string;
  provider: string;
  name?: string;
  avatar_url?: string;
}

export interface SupabaseSession {
  access_token: string;
  refresh_token: string;
  expires_at: number;
}

async function admin(env: Env, path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${env.SUPABASE_URL}${path}`, {
    ...init,
    headers: {
      ...(init.headers ?? {}),
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      "content-type": "application/json",
    },
  });
}

/**
 * Maps an email to the auth.users row that owns that user's data, creating the
 * user on first sign-in.
 *
 * Creation goes through GoTrue's admin API rather than inserting a uuid of our
 * own, because every table in this schema has `references auth.users(id)` and
 * there is an `on_auth_user_created` trigger that seeds the profile row. A
 * locally-minted uuid would pass RLS and then fail every insert on a foreign key.
 *
 * `public.auth_identities` is a lookup index, not the source of truth -- GoTrue's
 * admin list endpoint has no stable exact-match email filter, and paging through
 * users is not a login path. See the migration for how it is seeded from the
 * existing auth.users rows, which is what preserves everyone's data.
 */
export async function resolveUser(
  env: Env,
  email: string,
  provider: string,
  profile: { name?: string; avatar_url?: string },
): Promise<SessionUser> {
  const lookup = await admin(
    env,
    `/rest/v1/auth_identities?select=user_id&email=eq.${encodeURIComponent(email)}&limit=1`,
  );
  if (!lookup.ok) throw new Error(`identity lookup failed (${lookup.status})`);
  const rows = (await lookup.json()) as Array<{ user_id: string }>;

  let userId = rows[0]?.user_id;

  if (!userId) {
    const created = await admin(env, "/auth/v1/admin/users", {
      method: "POST",
      body: JSON.stringify({
        email,
        // The provider already proved control of this address; a confirmation
        // email would be a dead end, since there is no password flow to confirm
        // into any more.
        email_confirm: true,
        user_metadata: { ...profile, email },
        app_metadata: { provider, providers: [provider] },
      }),
    });
    const body = await created.text();
    if (!created.ok) throw new Error(`user creation failed (${created.status}): ${body.slice(0, 200)}`);
    userId = (JSON.parse(body) as { id: string }).id;
  }

  // Index upsert. Failure is not fatal: the user has a valid id and should get
  // their session; the next sign-in retries.
  await admin(env, "/rest/v1/auth_identities?on_conflict=email", {
    method: "POST",
    headers: { prefer: "resolution=merge-duplicates" },
    body: JSON.stringify({
      user_id: userId,
      email,
      provider,
      last_login_at: new Date().toISOString(),
    }),
  }).catch(() => {});

  return { id: userId, email, provider, ...profile };
}

const expiresAt = (expiresIn: number | undefined) =>
  Math.floor(Date.now() / 1000) + (expiresIn ?? 3600);

/** Issues a genuine Supabase session for an email we have already authenticated. */
export async function createSession(env: Env, email: string): Promise<SupabaseSession> {
  const linked = await admin(env, "/auth/v1/admin/generate_link", {
    method: "POST",
    body: JSON.stringify({ type: "magiclink", email }),
  });
  const linkBody = await linked.text();
  if (!linked.ok) throw new Error(`generate_link failed (${linked.status}): ${linkBody.slice(0, 200)}`);

  const { email_otp } = JSON.parse(linkBody) as { email_otp?: string };
  if (!email_otp) throw new Error("generate_link returned no email_otp");

  // verify takes the anon key, not service_role: it is the same call the browser
  // would make, we are simply making it here so the OTP never reaches the client.
  const verified = await fetch(`${env.SUPABASE_URL}/auth/v1/verify`, {
    method: "POST",
    headers: { apikey: env.SUPABASE_ANON_KEY, "content-type": "application/json" },
    body: JSON.stringify({ type: "magiclink", email, token: email_otp }),
  });
  const body = await verified.text();
  if (!verified.ok) throw new Error(`verify failed (${verified.status}): ${body.slice(0, 200)}`);

  const s = JSON.parse(body) as { access_token?: string; refresh_token?: string; expires_in?: number };
  if (!s.access_token || !s.refresh_token) throw new Error("verify returned no session");
  return { access_token: s.access_token, refresh_token: s.refresh_token, expires_at: expiresAt(s.expires_in) };
}

/**
 * Trades a refresh token for a fresh session. Supabase rotates refresh tokens on
 * use, so the caller must store the one that comes back -- keeping the old one
 * means the next refresh fails and the user is signed out mid-session.
 */
export async function refreshSession(env: Env, refreshToken: string): Promise<SupabaseSession | null> {
  const res = await fetch(`${env.SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
    method: "POST",
    headers: { apikey: env.SUPABASE_ANON_KEY, "content-type": "application/json" },
    body: JSON.stringify({ refresh_token: refreshToken }),
  });
  if (!res.ok) return null;                     // revoked, expired, or already used
  const s = (await res.json()) as { access_token?: string; refresh_token?: string; expires_in?: number };
  if (!s.access_token || !s.refresh_token) return null;
  return { access_token: s.access_token, refresh_token: s.refresh_token, expires_at: expiresAt(s.expires_in) };
}
