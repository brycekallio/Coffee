// Coffee's auth routes, as a Pages Function.
//
//   GET  /auth/providers      what the sign-in screen should offer
//   GET  /auth/start          -> provider consent screen
//   GET  /auth/callback       <- provider, sets the session cookie
//   GET  /auth/session        fresh Supabase access token, or 401
//   POST /auth/logout         drops the cookie
//
// A Pages Function rather than a standalone Worker, for one reason: it runs on
// the same origin as the app it serves, so the session cookie is first-party.
//
// A standalone Worker needs a route on a zone you own, which means buying a
// domain before anything can be tested. Pages Functions serve /auth/* on
// <project>.pages.dev from day one, and attaching a custom domain later changes
// no code at all. A separate auth.<domain> would have made the cookie
// third-party to the app and put it behind every browser's cookie blocking.

import {
  PROVIDERS,
  exchangeCode,
  emailFrom,
  isProviderId,
  pkceChallenge,
  randomString,
  readIdToken,
  type ProviderId,
} from "../_lib/oauth";
import { createSession, refreshSession, resolveUser, type Env } from "../_lib/supabase";
import {
  OAUTH_COOKIE,
  SESSION_COOKIE,
  SESSION_TTL,
  clearCookie,
  readCookie,
  sessionExpired,
  setCookie,
  sign,
  unsign,
  type SessionPayload,
} from "../_lib/session";

interface OAuthState {
  state: string;
  verifier: string;
  provider: ProviderId;
  next: string;
}

function credentials(env: Env, provider: ProviderId): { id?: string; secret?: string } {
  return provider === "google"
    ? { id: env.GOOGLE_CLIENT_ID, secret: env.GOOGLE_CLIENT_SECRET }
    : { id: env.MICROSOFT_CLIENT_ID, secret: env.MICROSOFT_CLIENT_SECRET };
}

/**
 * The origin to build redirect URIs from. APP_ORIGIN wins when set, because the
 * redirect_uri must match what is registered with Google and Microsoft exactly.
 * Falling back to the request's own origin is what lets a preview deployment run
 * without its own configuration.
 */
const originOf = (env: Env, url: URL) => env.APP_ORIGIN || url.origin;

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store", ...headers },
  });

/** Bounces the user back to the app with a readable reason instead of showing a
 *  Worker stack trace to a freshman trying to sign in. */
function failTo(origin: string, reason: string): Response {
  const url = new URL("/", origin);
  url.searchParams.set("auth_error", reason);
  return Response.redirect(url.toString(), 302);
}

/** Only ever redirect to a path on our own site. An open redirect here would let
 *  a crafted link hand a freshly-minted session to someone else's origin. */
function safeNext(raw: string | null): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) return "/";
  return raw;
}

async function handle(req: Request, env: Env): Promise<Response> {
  const url = new URL(req.url);

  switch (url.pathname) {
    case "/auth/providers":
      // Only what is actually configured. Rendering a button for a provider
      // whose credentials are missing gives the user a 500 and no way to tell
      // that it is our fault rather than theirs -- and providers get added one
      // at a time, so there is always a window where this matters.
      return json({
        providers: (["google", "microsoft"] as ProviderId[])
          .filter(p => { const c = credentials(env, p); return Boolean(c.id && c.secret); }),
      });

    case "/auth/start":
      return start(req, env, url);

    case "/auth/callback":
      return callback(req, env, url);

    case "/auth/session":
      return session(req, env);

    case "/auth/logout":
      if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
      return json({ ok: true }, 200, { "set-cookie": clearCookie(SESSION_COOKIE) });

    default:
      return json({ error: "not_found" }, 404);
  }
}

// [[route]] catches everything under /auth/. Pages serves the SPA for every other
// path, so the app and its auth share one origin and one deploy.
export const onRequest: PagesFunction<Env> = (ctx) => handle(ctx.request, ctx.env);

async function start(req: Request, env: Env, url: URL): Promise<Response> {
  const provider = url.searchParams.get("provider");
  if (!isProviderId(provider)) return json({ error: "unknown_provider" }, 400);

  const def = PROVIDERS[provider];
  const { id: clientId } = credentials(env, provider);
  if (!clientId) return json({ error: "provider_not_configured" }, 503);
  const state = randomString();
  const verifier = randomString(48);
  const redirectUri = new URL("/auth/callback", originOf(env, url)).toString();

  const authorize = new URL(def.authorizeUrl);
  authorize.search = new URLSearchParams({
    client_id: clientId,
    response_type: "code",
    redirect_uri: redirectUri,
    scope: def.scope,
    state,
    code_challenge: await pkceChallenge(verifier),
    code_challenge_method: "S256",
    ...(def.extraAuthParams ?? {}),
  }).toString();

  // The verifier rides in a signed, 10-minute, HttpOnly cookie rather than KV:
  // it is single-use, scoped to this one browser, and needs no storage binding.
  const pending: OAuthState = { state, verifier, provider, next: safeNext(url.searchParams.get("next")) };

  return new Response(null, {
    status: 302,
    headers: {
      location: authorize.toString(),
      "set-cookie": setCookie(OAUTH_COOKIE, await sign(pending, env.SESSION_SECRET), 600),
      "cache-control": "no-store",
    },
  });
}

async function callback(req: Request, env: Env, url: URL): Promise<Response> {
  const origin = originOf(env, url);
  const providerError = url.searchParams.get("error");
  if (providerError) return failTo(origin, providerError);

  const pending = await unsign<OAuthState>(readCookie(req, OAUTH_COOKIE), env.SESSION_SECRET);
  if (!pending) return failTo(origin, "expired_request");

  // The state check is what stops a third party from feeding us their own code.
  if (url.searchParams.get("state") !== pending.state) return failTo(origin, "state_mismatch");

  const code = url.searchParams.get("code");
  if (!code) return failTo(origin, "missing_code");

  const def = PROVIDERS[pending.provider];
  const { id: clientId, secret } = credentials(env, pending.provider);
  if (!clientId || !secret) return failTo(origin, "provider_not_configured");

  try {
    const { id_token } = await exchangeCode({
      provider: def,
      clientId,
      clientSecret: secret,
      code,
      verifier: pending.verifier,
      redirectUri: new URL("/auth/callback", origin).toString(),
    });

    const claims = readIdToken(id_token, def, clientId);
    const email = emailFrom(claims);
    if (!email) return failTo(origin, "no_email");

    // Google reports verification explicitly. Microsoft work/school accounts do
    // not carry email_verified at all — the tenant owns the mailbox, which is a
    // stronger guarantee than a verification click — so absent is accepted and
    // only an explicit false is rejected.
    if (claims.email_verified === false || claims.email_verified === "false") {
      return failTo(origin, "email_unverified");
    }

    const user = await resolveUser(env, email, pending.provider, {
      name: claims.name,
      avatar_url: claims.picture,
    });

    // Supabase issues the session; we only carry its refresh token.
    const supa = await createSession(env, user.email);

    const payload: SessionPayload = {
      ...user,
      refresh_token: supa.refresh_token,
      iat: Math.floor(Date.now() / 1000),
    };
    const headers = new Headers({ location: new URL(pending.next, origin).toString() });
    headers.append("set-cookie", setCookie(SESSION_COOKIE, await sign(payload, env.SESSION_SECRET), SESSION_TTL));
    headers.append("set-cookie", clearCookie(OAUTH_COOKIE));
    return new Response(null, { status: 302, headers });
  } catch (err) {
    console.error("auth callback failed", err);
    return failTo(origin, "signin_failed");
  }
}

async function session(req: Request, env: Env): Promise<Response> {
  const payload = await unsign<SessionPayload>(readCookie(req, SESSION_COOKIE), env.SESSION_SECRET);
  if (!payload) return json({ error: "no_session" }, 401);

  if (sessionExpired(payload)) {
    return json({ error: "session_expired" }, 401, { "set-cookie": clearCookie(SESSION_COOKIE) });
  }

  const supa = await refreshSession(env, payload.refresh_token);
  // A refused refresh means the token was revoked, expired, or already spent.
  // Nothing to recover: drop the cookie and let the user sign in again.
  if (!supa) {
    return json({ error: "refresh_failed" }, 401, { "set-cookie": clearCookie(SESSION_COOKIE) });
  }

  const { iat: _iat, refresh_token: _rt, ...user } = payload;

  // Supabase rotates refresh tokens on use, so the cookie has to carry the new
  // one. Storing the old would make the NEXT refresh fail and sign the user out
  // mid-session, which is a maddening bug to chase: it only shows up an hour in.
  const rotated: SessionPayload = { ...payload, refresh_token: supa.refresh_token };

  return json(
    { user, access_token: supa.access_token, expires_at: supa.expires_at },
    200,
    { "set-cookie": setCookie(SESSION_COOKIE, await sign(rotated, env.SESSION_SECRET), SESSION_TTL) },
  );
}
