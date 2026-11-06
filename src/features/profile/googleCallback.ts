import { consumeOAuthState } from "@/lib/googleOAuthState";

export type ExchangeResult = { error: { message: string } | null; data?: { gmail_send?: boolean; calendar?: boolean } | null };

export type CallbackOutcome =
  | { kind: "ignored" }
  | { kind: "rejected" }
  | { kind: "failed"; message: string }
  | { kind: "connected"; gmailSend: boolean; calendar: boolean };

/**
 * Handles Google's redirect back to "/?code=...&state=...". Never calls `exchange` unless the
 * state matches the one we stored when the user clicked Connect.
 */
export async function handleGoogleCallback(
  search: string,
  origin: string,
  exchange: (body: { code: string; redirect_uri: string }) => Promise<ExchangeResult>,
  userId: string,
  store?: Pick<Storage, "getItem" | "setItem" | "removeItem">,
): Promise<CallbackOutcome> {
  const params = new URLSearchParams(search);
  const code = params.get("code");
  const state = params.get("state");
  if (!code && !state) return { kind: "ignored" };
  // A `code` from some other OAuth flow is not ours; only treat it as ours if it carries a state.
  if (!code || !state) return { kind: "rejected" };
  if (!consumeOAuthState(state, userId, store)) return { kind: "rejected" };
  const { error, data } = await exchange({ code, redirect_uri: `${origin}/` });
  if (error) return { kind: "failed", message: error.message };
  // Fail closed: only an explicit `true` from the server counts as granted.
  return { kind: "connected", gmailSend: data?.gmail_send === true, calendar: data?.calendar === true };
}
