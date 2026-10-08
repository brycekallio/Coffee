import { supabase } from "./supabase";

/* ── Constants ─────────────────────────────────────────────────────── */

/**
 * Calendar events plus Gmail send, requested together so connecting Google is one
 * consent screen rather than two.
 *
 * gmail.send is a restricted scope: it permits sending only, never reading, and
 * Google shows an unverified-app warning until the app passes review. That is
 * acceptable while this is opt-in for power users and is the reason it is not on
 * by default.
 */
const GCAL_SCOPE = [
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/gmail.send",
].join(" ");

/** State value embedded in the OAuth redirect so App.tsx knows it's a GCal callback. */
export const GCAL_OAUTH_STATE = "gcal_connect";

/* ── OAuth URL builder ─────────────────────────────────────────────── */

/**
 * Builds the Google OAuth 2.0 authorisation URL.
 * Requires VITE_GOOGLE_CLIENT_ID to be set in .env.local
 */
export function buildGCalOAuthUrl(): string {
  // Public by design: an OAuth client ID identifies the app and is visible in
  // every authorisation URL. Committed with an env override for the same reason
  // as the Clerk key -- a missing build variable fails silently, and that has
  // already cost a deploy.
  const clientId =
    (import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined) ||
    "915763641909-m92u6u6anv5dckj7is6u4ahv1tj9f2ks.apps.googleusercontent.com";

  // The redirect_uri must exactly match one of the URIs registered in
  // Google Cloud Console → OAuth 2.0 Client IDs.
  // Register both http://localhost:5173 and your Netlify production URL.
  const redirectUri = `${window.location.origin}/`;

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: GCAL_SCOPE,
    access_type: "offline",   // request a refresh_token
    prompt: "consent",         // force consent screen so refresh_token is always returned
    state: GCAL_OAUTH_STATE,
  });

  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

/** Kicks off the Google OAuth flow by redirecting the current tab. */
export function initiateGCalOAuth(): void {
  window.location.href = buildGCalOAuthUrl();
}

/* ── Calendar event creation ───────────────────────────────────────── */

export interface CalendarEventInput {
  title: string;
  description?: string;
  /** ISO 8601 datetime string, e.g. "2025-06-01T14:00:00" */
  startDatetime: string;
  /** ISO 8601 datetime string — defaults to startDatetime + 30 min */
  endDatetime?: string;
}

/**
 * Creates a Google Calendar event by invoking the `create-calendar-event`
 * Supabase Edge Function.  The Edge Function handles token refresh automatically.
 *
 * Throws if the user has not connected Google Calendar or if the API call fails.
 */
export async function createCalendarEvent(
  input: CalendarEventInput
): Promise<void> {
  // Derive end time: start + 30 minutes if not provided
  let end = input.endDatetime;
  if (!end) {
    const startMs = new Date(input.startDatetime).getTime();
    end = new Date(startMs + 30 * 60 * 1000).toISOString();
  }

  const { error } = await supabase.functions.invoke("create-calendar-event", {
    body: {
      title: input.title,
      description: input.description ?? "",
      start_datetime: input.startDatetime,
      end_datetime: end,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    },
  });

  if (error) {
    throw new Error(error.message ?? "Failed to create calendar event.");
  }
}
