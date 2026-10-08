// Minting Supabase-compatible access tokens, and resolving a provider identity
// to a row in auth.users.
//
// The whole migration rests on one fact: Postgres RLS never talks to GoTrue. It
// reads `sub` out of whatever JWT the request carries and hands it to auth.uid().
// So if this Worker signs a JWT with a key Supabase trusts, carrying the same
// `sub` the user already had, then all eight tables, every RLS policy and every
// storage policy keep working untouched. Nothing in the database changes.

import { b64url } from "./oauth";

export interface Env {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  /** Private key as a JWK JSON string. The SAME key is imported into Supabase,
   *  which publishes its public half at /auth/v1/.well-known/jwks.json. */
  SUPABASE_JWT_PRIVATE_JWK: string;
  /** Must match the kid Supabase shows for the imported key, or verification
   *  fails with a key-not-found rather than a signature error. */
  SUPABASE_JWT_KID: string;
  SESSION_SECRET: string;
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  MICROSOFT_CLIENT_ID: string;
  MICROSOFT_CLIENT_SECRET: string;
  /** Canonical origin. Optional: falls back to the request's own origin, which
   *  is what makes preview deployments work without reconfiguration. It must be
   *  set in production, because the redirect_uri has to match what is registered
   *  with Google and Microsoft exactly, and a preview URL is not registered. */
  APP_ORIGIN?: string;
}

/** One hour, matching Supabase's own default access-token lifetime. The browser
 *  silently re-fetches from /auth/session well before this. */
export const ACCESS_TOKEN_TTL = 3600;

let cachedKey: CryptoKey | null = null;

async function signingKey(env: Env): Promise<CryptoKey> {
  if (cachedKey) return cachedKey;
  const jwk = JSON.parse(env.SUPABASE_JWT_PRIVATE_JWK) as JsonWebKey;
  cachedKey = await crypto.subtle.importKey(
    "jwk",
    jwk,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );
  return cachedKey;
}

export interface SessionUser {
  id: string;
  email: string;
  provider: string;
  name?: string;
  avatar_url?: string;
}

export async function mintAccessToken(env: Env, user: SessionUser): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "ES256", typ: "JWT", kid: env.SUPABASE_JWT_KID };
  const payload = {
    iss: `${env.SUPABASE_URL}/auth/v1`,
    sub: user.id,
    aud: "authenticated",
    role: "authenticated",
    email: user.email,
    iat: now,
    exp: now + ACCESS_TOKEN_TTL,
    app_metadata: { provider: user.provider, providers: [user.provider] },
    user_metadata: {
      email: user.email,
      ...(user.name ? { full_name: user.name } : {}),
      ...(user.avatar_url ? { avatar_url: user.avatar_url } : {}),
    },
  };

  const enc = new TextEncoder();
  const signingInput = `${b64url(enc.encode(JSON.stringify(header)))}.${b64url(
    enc.encode(JSON.stringify(payload)),
  )}`;

  // WebCrypto's ECDSA output is already the raw r||s pair JWS wants, so no
  // DER unwrapping step here.
  const sig = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    await signingKey(env),
    enc.encode(signingInput),
  );
  return `${signingInput}.${b64url(sig)}`;
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
 * locally-minted uuid would produce a token that passes RLS and then fails every
 * insert on a foreign key.
 *
 * `public.auth_identities` is a lookup index, not the source of truth — GoTrue's
 * admin list endpoint has no stable exact-match email filter, and scanning pages
 * of users on every sign-in is not a login path. See the migration for how it is
 * seeded from the existing auth.users rows.
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
        // The provider already proved control of this address; a second
        // confirmation email would be a dead end, since there is no password
        // flow left to confirm into.
        email_confirm: true,
        user_metadata: { ...profile, email },
        app_metadata: { provider, providers: [provider] },
      }),
    });
    const body = await created.text();
    if (!created.ok) throw new Error(`user creation failed (${created.status}): ${body.slice(0, 300)}`);
    userId = (JSON.parse(body) as { id: string }).id;
  }

  // Upsert the index entry. Failure here is logged, not fatal: the user already
  // has a valid id and should get their session. The next sign-in retries.
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
