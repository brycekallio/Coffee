/**
 * Auth against the Cloudflare Worker instead of GoTrue.
 *
 * The browser holds no refresh token and no password. Identity lives in an
 * HttpOnly cookie the Worker set; this module trades that cookie for a one-hour
 * Supabase access token whenever one is needed. Nothing here is readable by
 * script, so an XSS cannot walk off with a long-lived credential.
 *
 * The session shape intentionally mirrors the fields of Supabase's own Session
 * that this app actually used — `session.user.id`, `session.user.email`,
 * `session.access_token` — so the call sites did not all have to change shape
 * at the same time as changing provider.
 */

export type AuthProvider = "google" | "microsoft";

export interface CoffeeUser {
  id: string;
  email: string;
  provider: string;
  name?: string;
  avatar_url?: string;
}

export interface CoffeeSession {
  user: CoffeeUser;
  access_token: string;
  /** Unix seconds. */
  expires_at: number;
}

export const PROVIDER_LABEL: Record<AuthProvider, string> = {
  google: "Google",
  microsoft: "Microsoft",
};

/**
 * Why both providers exist: colorado.edu is a Microsoft tenant. Coffee is aimed
 * at CU freshmen and sophomores, so Google alone would show the entire target
 * audience a button that cannot work for them.
 */
export const PROVIDER_HINT: Record<AuthProvider, string> = {
  google: "Gmail and Google Workspace",
  microsoft: "@colorado.edu and Outlook",
};

/** Refresh this far before expiry, so a request never races the boundary. */
const REFRESH_SKEW = 120;

let current: CoffeeSession | null = null;
let inflight: Promise<CoffeeSession | null> | null = null;

type Listener = (session: CoffeeSession | null) => void;
const listeners = new Set<Listener>();

function emit() {
  for (const l of listeners) l(current);
}

export function subscribe(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function getSession(): CoffeeSession | null {
  return current;
}

function fresh(s: CoffeeSession | null): s is CoffeeSession {
  return !!s && s.expires_at - REFRESH_SKEW > Math.floor(Date.now() / 1000);
}

/**
 * Fetches a session from the Worker. Concurrent callers share one request —
 * on a cold load several components ask at once, and without this the Worker
 * would mint a different token for each of them.
 */
export async function loadSession(force = false): Promise<CoffeeSession | null> {
  if (!force && fresh(current)) return current;
  if (inflight) return inflight;

  inflight = (async () => {
    try {
      const res = await fetch("/auth/session", {
        credentials: "include",
        headers: { accept: "application/json" },
      });
      if (res.status === 401) {
        current = null;
      } else if (!res.ok) {
        // A 5xx is the Worker being unhappy, not the user being signed out.
        // Keeping the existing session avoids bouncing someone to the sign-in
        // screen over a blip; the token they hold is still valid until it isn't.
        return current;
      } else {
        current = (await res.json()) as CoffeeSession;
      }
    } catch {
      // Offline. Same reasoning: don't sign anyone out over a dropped request.
      return current;
    } finally {
      inflight = null;
    }
    emit();
    return current;
  })();

  return inflight;
}

/**
 * Handed to supabase-js as its `accessToken` option, so every PostgREST, storage
 * and edge-function call carries a current token without the caller thinking
 * about it.
 *
 * Setting that option is one-way: supabase-js then throws on any `supabase.auth.*`
 * access, which is why nothing in this app may call those any more.
 */
export async function getAccessToken(): Promise<string | null> {
  if (fresh(current)) return current.access_token;
  return (await loadSession())?.access_token ?? null;
}

/** Convenience for the places that used `supabase.auth.getUser()`. */
export async function getUser(): Promise<CoffeeUser | null> {
  if (fresh(current)) return current.user;
  return (await loadSession())?.user ?? null;
}

export function signIn(provider: AuthProvider, next = "/"): void {
  const url = new URL("/auth/start", window.location.origin);
  url.searchParams.set("provider", provider);
  url.searchParams.set("next", next);
  window.location.assign(url.toString());
}

export async function signOut(): Promise<void> {
  try {
    await fetch("/auth/logout", { method: "POST", credentials: "include" });
  } finally {
    current = null;
    emit();
  }
}

/**
 * Reads and clears the `?auth_error=` the Worker appends when a sign-in fails,
 * so the reason can be shown once and not survive a refresh.
 */
export function takeAuthError(): string | null {
  const params = new URLSearchParams(window.location.search);
  const code = params.get("auth_error");
  if (!code) return null;

  params.delete("auth_error");
  const qs = params.toString();
  window.history.replaceState({}, "", window.location.pathname + (qs ? `?${qs}` : ""));

  return (
    {
      access_denied: "Sign-in was cancelled.",
      expired_request: "That sign-in link timed out. Try again.",
      state_mismatch: "Sign-in could not be verified. Try again.",
      no_email: "That account did not share an email address with us.",
      email_unverified: "That account's email address isn't verified yet.",
      signin_failed: "Sign-in failed. Try again in a moment.",
    }[code] ?? "Sign-in failed. Try again."
  );
}

/**
 * Keeps the token ahead of expiry while the tab is open, and re-checks on focus
 * so a laptop that slept for an hour doesn't make its first click the one that
 * discovers the token is stale.
 */
export function startSessionRefresh(): () => void {
  const tick = () => {
    if (!current) return;
    if (!fresh(current)) void loadSession(true);
  };
  const timer = window.setInterval(tick, 60_000);
  window.addEventListener("focus", tick);
  return () => {
    window.clearInterval(timer);
    window.removeEventListener("focus", tick);
  };
}
