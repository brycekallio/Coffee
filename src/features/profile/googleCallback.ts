import { consumeOAuthState } from "@/lib/googleOAuthState";

export type ExchangeResult = { error: { message: string } | null; data?: { gmail_send?: boolean; calendar?: boolean } | null };

export type CallbackOutcome =
  | { kind: "ignored" }
  | { kind: "rejected" }
  | { kind: "failed"; message: string }
  | { kind: "notice"; message: string } // Google sent the user back without a code (Cancel etc.); message is shown as-is
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
  const googleError = params.get("error");
  if (!code && !state && !googleError) return { kind: "ignored" };
  if (googleError) {
    // Google sends the user back with error=access_denied on Cancel. Our own state must still match.
    if (!state || !consumeOAuthState(state, userId, store)) return { kind: "rejected" };
    return { kind: "notice", message: googleError === "access_denied" ? "Google connection cancelled." : "Google didn't connect. Try again." };
  }
  // A `code` from some other OAuth flow is not ours; only treat it as ours if it carries a state.
  if (!code || !state) return { kind: "rejected" };
  if (!consumeOAuthState(state, userId, store)) return { kind: "rejected" };
  const { error, data } = await exchange({ code, redirect_uri: `${origin}/` });
  if (error) return { kind: "failed", message: error.message };
  // Fail closed: only an explicit `true` from the server counts as granted.
  return { kind: "connected", gmailSend: data?.gmail_send === true, calendar: data?.calendar === true };
}
