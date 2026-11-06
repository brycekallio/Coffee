// The OAuth `state` is a one-time random value that proves WE started this Google sign-in.
// Without it, anyone could send a signed-in user a link carrying their own Google code and
// attach the attacker's Google account to the victim's profile.
// It is also tied to the Coffee user who clicked Connect (so a sign-out/sign-in in the same
// tab can't hand A's Google account to B) and expires, so a leftover one can't be reused.
const KEY = "coffee_google_oauth_state";
export const OAUTH_STATE_MAX_AGE_MS = 10 * 60 * 1000;

type Store = Pick<Storage, "getItem" | "setItem" | "removeItem">;
type Saved = { state: string; user: string; at: number };

/** Makes a fresh random state for this user and remembers it for this tab. Only the random part goes to Google. */
export function newOAuthState(userId: string, store: Store = sessionStorage): string {
  const state = crypto.randomUUID();
  store.setItem(KEY, JSON.stringify({ state, user: userId, at: Date.now() } satisfies Saved));
  return state;
}

/** True only for an exact, fresh match made by this same user. Always forgets it (one use). */
export function consumeOAuthState(received: string | null, userId: string, store: Store = sessionStorage): boolean {
  const raw = store.getItem(KEY);
  store.removeItem(KEY);
  let saved: Partial<Saved> | null = null;
  try {
    saved = raw ? (JSON.parse(raw) as Partial<Saved>) : null;
  } catch {
    return false;
  }
  if (!saved || typeof saved.state !== "string" || !saved.state || !received) return false;
  if (saved.user !== userId || typeof saved.at !== "number") return false;
  const age = Date.now() - saved.at;
  return age >= 0 && age <= OAUTH_STATE_MAX_AGE_MS && received === saved.state;
}
