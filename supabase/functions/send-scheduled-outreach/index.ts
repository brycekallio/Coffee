// Delivers due scheduled email, server-side, via each user's own Gmail account.
//
// Called on a schedule by pg_cron -- not by a browser -- so there is no user
// session here. Authorisation is a shared secret, and every row is fetched with
// the service role and scoped by its own owner_id.
//
// Why Gmail rather than a transactional sender: outreach that arrives from
// "Coffee" instead of from the person is a different message. This way it lands
// in the recipient's inbox from a real human, and in the sender's own Sent
// folder, which is also where they will look for it later.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.89.0";

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GMAIL_SEND_URL = "https://gmail.googleapis.com/gmail/v1/users/me/messages/send";

/** How far past its time a message may still go out. */
const MAX_LATENESS_MINUTES = 120;

interface Due {
  id: string;
  owner_id: string;
  contact_id: string | null;
  subject: string | null;
  message: string;
  scheduled_at: string;
}

const svc = () =>
  createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

/**
 * Trades a stored refresh token for a usable access token.
 *
 * Always refreshes rather than reusing the stored access token: these sit unused
 * for days between sends, so the stored one is almost always expired, and a
 * refresh is cheaper than discovering that mid-send.
 */
async function accessTokenFor(refreshToken: string): Promise<string | null> {
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: Deno.env.get("GOOGLE_CLIENT_ID")!,
      client_secret: Deno.env.get("GOOGLE_CLIENT_SECRET")!,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) return null;                 // revoked, or consent withdrawn
  const j = await res.json() as { access_token?: string };
  return j.access_token ?? null;
}

/** RFC 2822 message, base64url encoded as Gmail requires. */
function encodeMessage(to: string, from: string, subject: string, body: string): string {
  // Subjects are RFC 2047 encoded so accented names and em dashes survive.
  const encodedSubject = `=?UTF-8?B?${btoa(unescape(encodeURIComponent(subject)))}?=`;
  const raw = [
    `To: ${to}`,
    `From: ${from}`,
    `Subject: ${encodedSubject}`,
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="UTF-8"',
    "",
    body,
  ].join("\r\n");

  const bytes = new TextEncoder().encode(raw);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

Deno.serve(async (req) => {
  // Shared secret, because cron cannot present a user session. Compared in full
  // rather than short-circuiting on the first differing byte.
  const given = req.headers.get("x-cron-secret") ?? "";
  const want = Deno.env.get("CRON_SECRET") ?? "";
  if (!want || given.length !== want.length || given !== want) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401, headers: { "content-type": "application/json" },
    });
  }

  const db = svc();
  const now = new Date();
  const floor = new Date(now.getTime() - MAX_LATENESS_MINUTES * 60_000);

  const { data: due, error } = await db
    .from("scheduled_outreach")
    .select("id, owner_id, contact_id, subject, message, scheduled_at")
    .eq("status", "scheduled")
    .eq("channel", "email")
    .lte("scheduled_at", now.toISOString())
    .gte("scheduled_at", floor.toISOString())   // don't resurrect week-old messages
    .limit(50);

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { "content-type": "application/json" },
    });
  }

  const results = { sent: 0, failed: 0, skipped: 0 };

  for (const row of (due ?? []) as Due[]) {
    // Claim it first. Two cron ticks can overlap if one runs long, and sending
    // the same outreach twice is worse than sending it late.
    const { data: claimed } = await db
      .from("scheduled_outreach")
      .update({ status: "sending" })
      .eq("id", row.id)
      .eq("status", "scheduled")
      .select("id");
    if (!claimed?.length) { results.skipped++; continue; }

    const fail = async (reason: string) => {
      await db.from("scheduled_outreach")
        .update({ status: "failed", failure_reason: reason.slice(0, 200) })
        .eq("id", row.id);
      results.failed++;
    };

    const { data: profile } = await db
      .from("profiles")
      .select("google_calendar_refresh_token")
      .eq("id", row.owner_id)
      .single();

    const refresh = profile?.google_calendar_refresh_token;
    if (!refresh) { await fail("Gmail is not connected"); continue; }

    let to: string | null = null;
    if (row.contact_id) {
      const { data: c } = await db
        .from("contacts").select("email").eq("id", row.contact_id).single();
      to = c?.email ?? null;
    }
    if (!to) { await fail("Contact has no email address"); continue; }

    const token = await accessTokenFor(refresh);
    if (!token) { await fail("Google access was revoked; reconnect Gmail"); continue; }

    // "me" resolves to the authenticated mailbox, so the From line is correct
    // without us storing the address.
    const send = await fetch(GMAIL_SEND_URL, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({
        raw: encodeMessage(to, "me", row.subject ?? "(no subject)", row.message),
      }),
    });

    if (!send.ok) { await fail(`Gmail refused the message (${send.status})`); continue; }

    await db.from("scheduled_outreach")
      .update({ status: "sent", sent_at: new Date().toISOString() })
      .eq("id", row.id);
    results.sent++;
  }

  return new Response(JSON.stringify(results), {
    headers: { "content-type": "application/json" },
  });
});
