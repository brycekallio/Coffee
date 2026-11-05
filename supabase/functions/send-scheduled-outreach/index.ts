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
import { type Deliver, processDue } from "./process.ts";

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GMAIL_SEND_URL = "https://gmail.googleapis.com/gmail/v1/users/me/messages/send";

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

/** Sends one message from the owner's own Gmail. Reasons are shown to the user, so keep them short. */
const deliver: Deliver = async (refreshToken, to, subject, body) => {
  const token = await accessTokenFor(refreshToken);
  if (!token) return { ok: false, reason: "Not sent: Google access was revoked, reconnect Gmail in Settings" };

  // "me" resolves to the authenticated mailbox, so the From line is correct
  // without us storing the address.
  const send = await fetch(GMAIL_SEND_URL, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ raw: encodeMessage(to, "me", subject, body) }),
  });
  if (send.ok) return { ok: true };

  // Google states the reason plainly (a disabled API, a missing scope, a revoked grant).
  // It goes to the function logs; the row carries only the short version.
  console.error("Gmail refused the message", send.status, (await send.text()).slice(0, 200));
  return { ok: false, reason: `Not sent: Gmail refused it (${send.status})` };
};

Deno.serve(async (req) => {
  // Shared secret, because cron cannot present a user session. A plain comparison, not
  // constant-time: harmless for a long random secret at this scale.
  const given = req.headers.get("x-cron-secret") ?? "";
  const want = Deno.env.get("CRON_SECRET") ?? "";
  if (!want || given.length !== want.length || given !== want) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401, headers: { "content-type": "application/json" },
    });
  }

  let results;
  try {
    results = await processDue(svc(), { now: new Date(), deliver });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { "content-type": "application/json" },
    });
  }

  return new Response(JSON.stringify(results), {
    headers: { "content-type": "application/json" },
  });
});
