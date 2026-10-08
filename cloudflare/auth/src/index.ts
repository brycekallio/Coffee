// Coffee's auth Worker.
//
//   GET  /auth/providers      what the sign-in screen should offer
//   GET  /auth/start          -> provider consent screen
//   GET  /auth/callback       <- provider, sets the session cookie
//   GET  /auth/session        fresh Supabase access token, or 401
//   POST /auth/logout         drops the cookie
//
// Mounted on the app's own origin (a Worker route on /auth/*), so the session
// cookie is first-party. A separate auth.<domain> subdomain would make it
// third-party to the app and put it in front of every browser's cookie blocking.

import {
  PROVIDERS,
  exchangeCode,
  emailFrom,
  isProviderId,
  pkceChallenge,
  randomString,
  readIdToken,
  type ProviderId,
} from "./oauth";
import { ACCESS_TOKEN_TTL, mintAccessToken, resolveUser, type Env } from "./supabase";
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
} from "./session";

interface OAuthState {
  state: string;
  verifier: string;
  provider: ProviderId;
  next: string;
}

function credentials(env: Env, provider: ProviderId): { id: string; secret: string } {
  return provider === "google"
    ? { id: env.GOOGLE_CLIENT_ID, secret: env.GOOGLE_CLIENT_SECRET }
    : { id: env.MICROSOFT_CLIENT_ID, secret: env.MICROSOFT_CLIENT_SECRET };
}

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store", ...headers },
  });

/** Bounces the user back to the app with a readable reason instead of showing a
 *  Worker stack trace to a freshman trying to sign in. */
function failTo(env: Env, reason: string): Response {
  const url = new URL("/", env.APP_ORIGIN);
  url.searchParams.set("auth_error", reason);
  return Response.redirect(url.toString(), 302);
}

/** Only ever redirect to a path on our own site. An open redirect here would let
 *  a crafted link hand a freshly-minted session to someone else's origin. */
function safeNext(raw: string | null): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) return "/";
  return raw;
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);

    switch (url.pathname) {
      case "/auth/providers":
        return json({ providers: ["google", "microsoft"] });

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
  },
};

async function start(req: Request, env: Env, url: URL): Promise<Response> {
  const provider = url.searchParams.get("provider");
  if (!isProviderId(provider)) return json({ error: "unknown_provider" }, 400);

  const def = PROVIDERS[provider];
  const { id: clientId } = credentials(env, provider);
  const state = randomString();
  const verifier = randomString(48);
  const redirectUri = new URL("/auth/callback", env.APP_ORIGIN).toString();

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
  const providerError = url.searchParams.get("error");
  if (providerError) return failTo(env, providerError);

  const pending = await unsign<OAuthState>(readCookie(req, OAUTH_COOKIE), env.SESSION_SECRET);
  if (!pending) return failTo(env, "expired_request");

  // The state check is what stops a third party from feeding us their own code.
  if (url.searchParams.get("state") !== pending.state) return failTo(env, "state_mismatch");

  const code = url.searchParams.get("code");
  if (!code) return failTo(env, "missing_code");

  const def = PROVIDERS[pending.provider];
  const { id: clientId, secret } = credentials(env, pending.provider);

  try {
    const { id_token } = await exchangeCode({
      provider: def,
      clientId,
      clientSecret: secret,
      code,
      verifier: pending.verifier,
      redirectUri: new URL("/auth/callback", env.APP_ORIGIN).toString(),
    });

    const claims = readIdToken(id_token, def, clientId);
    const email = emailFrom(claims);
    if (!email) return failTo(env, "no_email");

    // Google reports verification explicitly. Microsoft work/school accounts do
    // not carry email_verified at all — the tenant owns the mailbox, which is a
    // stronger guarantee than a verification click — so absent is accepted and
    // only an explicit false is rejected.
    if (claims.email_verified === false || claims.email_verified === "false") {
      return failTo(env, "email_unverified");
    }

    const user = await resolveUser(env, email, pending.provider, {
      name: claims.name,
      avatar_url: claims.picture,
    });

    const payload: SessionPayload = { ...user, iat: Math.floor(Date.now() / 1000) };
    const headers = new Headers({ location: new URL(pending.next, env.APP_ORIGIN).toString() });
    headers.append("set-cookie", setCookie(SESSION_COOKIE, await sign(payload, env.SESSION_SECRET), SESSION_TTL));
    headers.append("set-cookie", clearCookie(OAUTH_COOKIE));
    return new Response(null, { status: 302, headers });
  } catch (err) {
    console.error("auth callback failed", err);
    return failTo(env, "signin_failed");
  }
}

async function session(req: Request, env: Env): Promise<Response> {
  const payload = await unsign<SessionPayload>(readCookie(req, SESSION_COOKIE), env.SESSION_SECRET);
  if (!payload) return json({ error: "no_session" }, 401);

  if (sessionExpired(payload)) {
    return json({ error: "session_expired" }, 401, { "set-cookie": clearCookie(SESSION_COOKIE) });
  }

  const { iat: _iat, ...user } = payload;
  return json({
    user,
    access_token: await mintAccessToken(env, user),
    expires_at: Math.floor(Date.now() / 1000) + ACCESS_TOKEN_TTL,
  });
}
