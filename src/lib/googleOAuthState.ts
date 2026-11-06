// The OAuth `state` is a one-time random value that proves WE started this Google sign-in.
// Without it, anyone could send a signed-in user a link carrying their own Google code and
// attach the attacker's Google account to the victim's profile.
const KEY = "coffee_google_oauth_state";

type Store = Pick<Storage, "getItem" | "setItem" | "removeItem">;

/** Makes a fresh random state and remembers it for this tab. */
export function newOAuthState(store: Store = sessionStorage): string {
  const state = crypto.randomUUID();
  store.setItem(KEY, state);
  return state;
}

/** True only for an exact match with the remembered state. Always forgets it (one use). */
export function consumeOAuthState(received: string | null, store: Store = sessionStorage): boolean {
  const expected = store.getItem(KEY);
  store.removeItem(KEY);
  return Boolean(expected) && Boolean(received) && received === expected;
}
