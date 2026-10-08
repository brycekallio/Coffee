import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface EventBody {
  title: string;
  description?: string;
  start_datetime: string;
  end_datetime: string;
  timezone?: string;
}

/** Refresh an expired access token and persist the new one. */
async function refreshAndPersist(
  serviceClient: ReturnType<typeof createClient>,
  userId: string,
  refreshToken: string
): Promise<string | null> {
  const googleClientId = Deno.env.get("GOOGLE_CLIENT_ID")!;
  const googleClientSecret = Deno.env.get("GOOGLE_CLIENT_SECRET")!;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: googleClientId,
      client_secret: googleClientSecret,
      grant_type: "refresh_token",
    }),
  });

  const data = await res.json() as { access_token?: string; expires_in?: number; error?: string };
  if (!res.ok || !data.access_token) return null;

  const expiry = data.expires_in
    ? new Date(Date.now() + data.expires_in * 1000).toISOString()
    : null;

  await serviceClient
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
  accessToken: string,
  body: EventBody
): Promise<{ ok: boolean; status: number }> {
  const tz = body.timezone ?? "UTC";
  const event = {
    summary: body.title,
    description: body.description ?? "",
    start: { dateTime: body.start_datetime, timeZone: tz },
    end: { dateTime: body.end_datetime, timeZone: tz },
  };

  const res = await fetch(
    "https://www.googleapis.com/calendar/v3/calendars/primary/events",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(event),
    }
  );

  return { ok: res.ok, status: res.status };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS });
  }

  try {
    // ── Auth ──────────────────────────────────────────────────────────────────
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing Authorization header" }), {
        status: 401,
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    // Resolve the user through app_user_id(), not auth.getUser(). getUser asks
    // GoTrue, which has never seen a Clerk token and answers 401 for every real
    // user. app_user_id() is the same function every RLS policy uses, so this
    // cannot disagree with what the database enforces a moment later.
    const { data: appUserId, error: userError } = await userClient.rpc("app_user_id");
    if (userError || !appUserId) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    // ── Fetch user's stored tokens ────────────────────────────────────────────
    const serviceClient = createClient(supabaseUrl, supabaseServiceKey);
    const { data: profile, error: profileError } = await serviceClient
      .from("profiles")
      .select("google_calendar_token, google_calendar_refresh_token, google_calendar_token_expiry")
      .eq("id", appUserId)
      .single();

    if (profileError || !profile) {
      return new Response(JSON.stringify({ error: "Profile not found" }), {
        status: 404,
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    if (!profile.google_calendar_token) {
      return new Response(
        JSON.stringify({ error: "Google Calendar not connected. Connect it in Settings first." }),
        { status: 400, headers: { ...CORS, "Content-Type": "application/json" } }
      );
    }

    // ── Parse request body ────────────────────────────────────────────────────
    const body = await req.json() as EventBody;
    if (!body.title || !body.start_datetime || !body.end_datetime) {
      return new Response(JSON.stringify({ error: "title, start_datetime, and end_datetime are required" }), {
        status: 400,
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    // ── Try creating the event (refresh if token is expired) ──────────────────
    let token = profile.google_calendar_token;

    // Pre-emptively refresh if token expiry is known and within 60 seconds
    const expiry = profile.google_calendar_token_expiry
      ? new Date(profile.google_calendar_token_expiry).getTime()
      : null;
    if (expiry && expiry - Date.now() < 60_000 && profile.google_calendar_refresh_token) {
      const refreshed = await refreshAndPersist(serviceClient, appUserId, profile.google_calendar_refresh_token);
      if (refreshed) token = refreshed;
    }

    let result = await postEvent(token, body);

    // If 401, attempt one token refresh and retry
    if (result.status === 401 && profile.google_calendar_refresh_token) {
      const refreshed = await refreshAndPersist(serviceClient, appUserId, profile.google_calendar_refresh_token);
      if (refreshed) {
        result = await postEvent(refreshed, body);
      }
    }

    if (!result.ok) {
      return new Response(
        JSON.stringify({ error: `Google Calendar API returned ${result.status}` }),
        { status: 502, headers: { ...CORS, "Content-Type": "application/json" } }
      );
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
});
