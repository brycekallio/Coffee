// Pure core of create-calendar-event, with fetch, the database and the clock passed in so it
// can be tested. index.ts resolves the caller (auth) and hands the user id in; nothing here
// decides who the user is.
export interface EventBody {
  title: string;
  description?: string;
  start_datetime: string;
  end_datetime: string;
  timezone?: string;
}

export interface ProfilesDb {
  from(table: "profiles"): {
    select(cols: string): {
      eq(col: string, val: string): {
        single(): PromiseLike<{ data: Record<string, unknown> | null; error: unknown }>;
      };
    };
    update(values: Record<string, unknown>): { eq(col: string, val: string): PromiseLike<unknown> };
  };
}

export interface EventDeps {
  fetch: typeof fetch;
  service: ProfilesDb;
  googleClientId: string;
  googleClientSecret: string;
  now?: () => number;
  log?: (...args: unknown[]) => void;
}

export interface EventOutput {
  status: number;
  body: Record<string, unknown>;
}

const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})?$/;

function parseIso(s: unknown): number | null {
  if (typeof s !== "string" || !ISO.test(s)) return null;
  const t = Date.parse(s);
  return Number.isNaN(t) ? null : t;
}

/** Refresh an expired access token and persist the new one. Null if Google refuses. */
async function refreshAndPersist(deps: EventDeps, userId: string, refreshToken: string): Promise<string | null> {
  try {
    return await doRefresh(deps, userId, refreshToken);
  } catch (err) {
    // A network error or non-JSON reply is a failed refresh, not a crash. Log the kind only:
    // messages can quote tokens.
    (deps.log ?? console.error)("Google token refresh failed", err instanceof Error ? err.name : typeof err);
    return null;
  }
}

async function doRefresh(deps: EventDeps, userId: string, refreshToken: string): Promise<string | null> {
  const now = deps.now ?? Date.now;
  const res = await deps.fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: deps.googleClientId,
      client_secret: deps.googleClientSecret,
      grant_type: "refresh_token",
    }),
  });

  const data = await res.json() as { access_token?: string; expires_in?: number; error?: string };
  if (!res.ok || !data.access_token) return null;

  const expiry = data.expires_in ? new Date(now() + data.expires_in * 1000).toISOString() : null;

  await deps.service
    .from("profiles")
    .update({
      google_calendar_token: data.access_token,
      google_calendar_token_expiry: expiry,
    })
    .eq("id", userId);

  return data.access_token;
}

/** POST an event to Google Calendar API v3. */
async function postEvent(
  deps: EventDeps,
  accessToken: string,
  body: EventBody,
): Promise<{ ok: boolean; status: number; body?: string }> {
  const tz = body.timezone ?? "UTC";
  const event = {
    summary: body.title,
    description: body.description ?? "",
    start: { dateTime: body.start_datetime, timeZone: tz },
    end: { dateTime: body.end_datetime, timeZone: tz },
  };

  const res = await deps.fetch("https://www.googleapis.com/calendar/v3/calendars/primary/events", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(event),
  });

  // Keep the body on failure: Google explains refusals clearly, and discarding
  // that turned a one-line diagnosis into a guessing game.
  return { ok: res.ok, status: res.status, body: res.ok ? undefined : await res.text() };
}

/** Creates the event for an already-authenticated user (userId comes from app_user_id()). */
export async function createCalendarEvent(
  userId: string,
  readBody: () => Promise<unknown>,
  deps: EventDeps,
): Promise<EventOutput> {
  const now = deps.now ?? Date.now;
  const log = deps.log ?? console.error;

  // ── Fetch user's stored tokens ──────────────────────────────────────────────
  const { data: profile, error: profileError } = await deps.service
    .from("profiles")
    .select("google_calendar_token, google_calendar_refresh_token, google_calendar_token_expiry")
    .eq("id", userId)
    .single();

  if (profileError || !profile) return { status: 404, body: { error: "Profile not found" } };

  if (!profile.google_calendar_token) {
    return { status: 400, body: { error: "Google Calendar not connected. Connect it in Settings first." } };
  }

  // ── Parse request body ──────────────────────────────────────────────────────
  let raw: unknown;
  try {
    raw = await readBody();
  } catch {
    return { status: 400, body: { error: "Request body must be valid JSON" } };
  }
  const body = (raw && typeof raw === "object" ? raw : {}) as EventBody;
  if (!body.title || !body.start_datetime || !body.end_datetime) {
    return { status: 400, body: { error: "title, start_datetime, and end_datetime are required" } };
  }
  const start = parseIso(body.start_datetime);
  const end = parseIso(body.end_datetime);
  if (start === null || end === null) {
    return { status: 400, body: { error: "start_datetime and end_datetime must be ISO 8601 datetimes" } };
  }
  if (end < start) {
    return { status: 400, body: { error: "end_datetime must not be before start_datetime" } };
  }

  // ── Try creating the event (refresh if token is expired) ────────────────────
  let token = profile.google_calendar_token as string;

  // Pre-emptively refresh if token expiry is known and within 60 seconds
  const expiry = profile.google_calendar_token_expiry
    ? new Date(profile.google_calendar_token_expiry as string).getTime()
    : null;
  if (expiry && expiry - now() < 60_000 && profile.google_calendar_refresh_token) {
    const refreshed = await refreshAndPersist(deps, userId, profile.google_calendar_refresh_token as string);
    if (refreshed) token = refreshed;
  }

  let result = await postEvent(deps, token, body);

  // If 401, attempt one token refresh and retry
  if (result.status === 401 && profile.google_calendar_refresh_token) {
    const refreshed = await refreshAndPersist(deps, userId, profile.google_calendar_refresh_token as string);
    if (!refreshed) {
      return { status: 401, body: { error: "Google Calendar access expired. Reconnect it in Settings." } };
    }
    result = await postEvent(deps, refreshed, body);
  }

  if (!result.ok) {
    // Pass Google's own message through. "returned 403" sent us looking at
    // tokens and scopes when the actual cause was the Calendar API being
    // disabled on the project -- which Google says plainly if you let it.
    const detail = typeof result.body === "string"
      ? result.body.slice(0, 300)
      : JSON.stringify(result.body ?? {}).slice(0, 300);
    log("Google Calendar rejected the event", result.status, detail);
    return { status: 502, body: { error: `Google Calendar API returned ${result.status}`, detail } };
  }

  return { status: 200, body: { success: true } };
}
