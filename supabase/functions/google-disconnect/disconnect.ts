// Pure core of google-disconnect, with fetch and the database passed in so it can be tested.
export interface ProfilesDb {
  from(table: "profiles"): {
    select(cols: string): {
      eq(col: string, val: string): { maybeSingle(): PromiseLike<{ data: Record<string, unknown> | null; error: { message: string } | null }> };
    };
    update(values: Record<string, unknown>): { eq(col: string, val: string): PromiseLike<{ error: { message: string } | null }> };
  };
}

export interface DisconnectOutput {
  status: number;
  body: { success: true; revoked: boolean } | { error: string };
}

/**
 * Revokes the grant at Google, THEN clears our copy. If Google can't be reached we keep the
 * tokens and report an error, so the user can retry rather than believe it's gone while the
 * grant lives on. A 400 from Google means the token is already dead (revoked elsewhere or
 * expired), which is the state we want, so we clear and carry on.
 */
export async function disconnectGoogle(
  userId: string,
  deps: { fetch: typeof fetch; service: ProfilesDb },
): Promise<DisconnectOutput> {
  const { data, error } = await deps.service
    .from("profiles")
    .select("google_calendar_refresh_token, google_calendar_token")
    .eq("id", userId)
    .maybeSingle();
  // Postgres errors can quote the failing row, tokens included: never pass them on.
  if (error) return { status: 500, body: { error: "Couldn't disconnect Google. Try again." } };

  const token = (data?.google_calendar_refresh_token ?? data?.google_calendar_token) as string | null | undefined;
  let revoked = false;
  if (token) {
    let res: Response;
    try {
      res = await deps.fetch("https://oauth2.googleapis.com/revoke", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ token }),
      });
    } catch {
      return { status: 502, body: { error: "Couldn't reach Google to revoke access. Try again." } };
    }
    if (res.status >= 500 || res.status === 429) {
      return { status: 502, body: { error: "Google couldn't revoke access right now. Try again." } };
    }
    revoked = res.ok;
  }

  const { error: updateError } = await deps.service
    .from("profiles")
    .update({
      google_calendar_token: null,
      google_calendar_refresh_token: null,
      google_calendar_token_expiry: null,
      google_connected: false,
      google_gmail_send: false,
    })
    .eq("id", userId);
  if (updateError) return { status: 500, body: { error: "Couldn't disconnect Google. Try again." } };
  return { status: 200, body: { success: true, revoked } };
}
