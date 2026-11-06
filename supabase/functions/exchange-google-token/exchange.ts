// Pure core of exchange-google-token, with fetch and the database passed in so it can be tested.
export const GMAIL_SEND_SCOPE = "https://www.googleapis.com/auth/gmail.send";

export interface ProfilesWriter {
  from(table: "profiles"): {
    update(values: Record<string, unknown>): { eq(col: string, val: string): PromiseLike<{ error: { message: string } | null }> };
  };
}

export interface ExchangeInput {
  code: string;
  redirectUri: string;
  userId: string;
  clientId: string;
  clientSecret: string;
}

export interface ExchangeOutput {
  status: number;
  body: { success: true; gmail_send: boolean } | { error: string };
}

/** True when Google says the user granted permission to send mail. */
export function grantedGmailSend(scope: string | undefined): boolean {
  return (scope ?? "").split(/\s+/).includes(GMAIL_SEND_SCOPE);
}

export async function exchangeAndStore(
  input: ExchangeInput,
  deps: { fetch: typeof fetch; service: ProfilesWriter; now?: () => number },
): Promise<ExchangeOutput> {
  const now = deps.now ?? Date.now;
  const tokenRes = await deps.fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code: input.code,
      client_id: input.clientId,
      client_secret: input.clientSecret,
      redirect_uri: input.redirectUri,
      grant_type: "authorization_code",
    }),
  });
  const tokenData = (await tokenRes.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    scope?: string;
    error?: string;
  };
  if (!tokenRes.ok || !tokenData.access_token) {
    return { status: 400, body: { error: tokenData.error ?? "Google token exchange failed" } };
  }

  const values: Record<string, unknown> = {
    google_calendar_token: tokenData.access_token,
    google_calendar_token_expiry: tokenData.expires_in ? new Date(now() + tokenData.expires_in * 1000).toISOString() : null,
  };
  // Google only returns a refresh token on a fresh consent. Never overwrite a good one with nothing.
  const gmailSend = grantedGmailSend(tokenData.scope);
  if (tokenData.refresh_token) {
    values.google_calendar_refresh_token = tokenData.refresh_token;
    // Outreach auto-sends through Gmail only when send was really granted.
    values.google_gmail_send = gmailSend;
    values.google_connected = gmailSend;
  }
  const { error } = await deps.service.from("profiles").update(values).eq("id", input.userId);
  if (error) return { status: 500, body: { error: error.message } };
  return { status: 200, body: { success: true, gmail_send: gmailSend } };
}
