// Pure core of exchange-google-token, with fetch and the database passed in so it can be tested.
export const GMAIL_SEND_SCOPE = "https://www.googleapis.com/auth/gmail.send";
export const CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.events";

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
  body: { success: true; gmail_send: boolean; calendar: boolean } | { error: string };
}

const granted = (scope: string | undefined, wanted: string) => (scope ?? "").split(/\s+/).includes(wanted);

/** True when Google says the user granted permission to send mail. */
export function grantedGmailSend(scope: string | undefined): boolean {
  return granted(scope, GMAIL_SEND_SCOPE);
}

/** True when Google says the user granted Calendar events. */
export function grantedCalendar(scope: string | undefined): boolean {
  return granted(scope, CALENDAR_SCOPE);
}

/** Google's `error` is a short code (invalid_grant…). Pass on only that shape, never free text. */
function googleErrorCode(e: unknown): string {
  return typeof e === "string" && /^[a-z_]{1,40}$/.test(e) ? e : "Google token exchange failed";
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
  let tokenData: { access_token?: string; refresh_token?: string; expires_in?: number; scope?: string; error?: unknown };
  try {
    tokenData = await tokenRes.json();
  } catch {
    // An HTML error page: its text may be anything, so it is never echoed.
    return { status: 502, body: { error: "Google token exchange failed" } };
  }
  if (!tokenRes.ok || !tokenData.access_token) {
    return { status: 400, body: { error: googleErrorCode(tokenData.error) } };
  }

  const values: Record<string, unknown> = {
    google_calendar_token: tokenData.access_token,
    google_calendar_token_expiry: tokenData.expires_in ? new Date(now() + tokenData.expires_in * 1000).toISOString() : null,
  };
  // google_connected = Calendar linked; google_gmail_send = may send. Each mirrors its scope.
  const gmailSend = grantedGmailSend(tokenData.scope);
  const calendar = grantedCalendar(tokenData.scope);
  if (tokenData.refresh_token) {
    // Google only returns a refresh token on a fresh consent; the flags describe that grant.
    values.google_calendar_refresh_token = tokenData.refresh_token;
    values.google_gmail_send = gmailSend;
    values.google_connected = calendar;
  } else {
    // No new refresh token: the stored one stays. A scope missing now turns its flag off
    // (fail closed), but nothing is turned on, since the old refresh token may not carry it.
    if (!gmailSend) values.google_gmail_send = false;
    if (!calendar) values.google_connected = false;
  }
  const { error } = await deps.service.from("profiles").update(values).eq("id", input.userId);
  // Postgres errors can quote the failing row, tokens included: never pass them on.
  if (error) return { status: 500, body: { error: "Couldn't save the Google connection. Try again." } };
  // Report what was persisted: a scope Google granted is not "on" unless a flag was saved for it.
  return {
    status: 200,
    body: { success: true, gmail_send: values.google_gmail_send === true, calendar: values.google_connected === true },
  };
}
