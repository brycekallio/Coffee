// The cron's decisions, kept apart from Deno.serve and the Google calls so they can be
// tested against a fake database. index.ts wires in the real Gmail delivery.

/** How far past its time a message may still go out. */
export const MAX_LATENESS_MINUTES = 120;
/** A send that has been going longer than this was abandoned (the function died after claiming it). */
export const STUCK_SENDING_MINUTES = 15;
/** Rows per tick, and how far we page past rows that belong to people without Gmail. */
const BATCH = 50;
const PAGE = 100;
const MAX_PAGES = 10;

export type Deliver = (
  refreshToken: string,
  to: string,
  subject: string,
  body: string,
) => Promise<{ ok: true } | { ok: false; reason: string }>;

interface Due {
  id: string;
  owner_id: string;
  contact_id: string | null;
  subject: string | null;
  message: string;
}

// Only the slice of supabase-js used here; the real client is passed in at runtime.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

/** Short human reason from Google's JSON error body. Never the raw body. */
export function gmailRefusalReason(status: number, body: string): string {
  let detail = "";
  try {
    const e = JSON.parse(body)?.error;
    const m = typeof e?.message === "string" ? e.message : typeof e?.status === "string" ? e.status : "";
    detail = m.replace(/\s+/g, " ").trim().slice(0, 120);
  } catch { /* not JSON: keep just the code */ }
  return detail ? `Not sent: Gmail refused it (${status}: ${detail})` : `Not sent: Gmail refused it (${status})`;
}

/** One plain address: no whitespace, CR/LF, list separators or angle brackets (header injection). */
const SIMPLE_ADDRESS = /^[^\s@,;<>()"\\]+@[^\s@,;<>()"\\]+\.[^\s@,;<>()"\\]+$/;

export async function processDue(
  db: Db,
  opts: { now: Date; deliver: Deliver },
): Promise<{ sent: number; failed: number; skipped: number; missed: number }> {
  const { now, deliver } = opts;
  const results = { sent: 0, failed: 0, skipped: 0, missed: 0 };
  const ago = (min: number) => new Date(now.getTime() - min * 60_000).toISOString();

  // A row stuck in 'sending' is hidden from the page. There is no claimed-at column, so we
  // bound it by scheduled_at: a row is only claimable up to MAX_LATENESS_MINUTES late, so
  // one still 'sending' beyond that plus STUCK_SENDING_MINUTES cannot be in flight. Using
  // scheduled_at alone (as before) could fail a row another overlapping tick was sending.
  const { error: sweepErr } = await db.from("scheduled_outreach")
    .update({
      status: "failed",
      failure_reason: "Not sent: it got stuck. Check your Sent folder before retrying",
    })
    .eq("status", "sending")
    .lt("scheduled_at", ago(MAX_LATENESS_MINUTES + STUCK_SENDING_MINUTES));
  if (sweepErr) throw new Error(sweepErr.message);

  // Only people with Gmail connected get automatic sending. Everyone else's email rows
  // stay 'scheduled': for them Outreach is a reminder list and they send by hand.
  // Tokens are fetched lazily, only for owners of candidate rows.
  const tokens = new Map<string, string | null>();
  const loadTokens = async (ownerIds: string[]) => {
    const need = [...new Set(ownerIds)].filter((id) => !tokens.has(id));
    if (!need.length) return;
    const { data, error } = await db
      .from("profiles")
      .select("id, google_calendar_refresh_token")
      .in("id", need);
    if (error) throw new Error(error.message);
    for (const id of need) tokens.set(id, null);
    for (const p of (data ?? []) as { id: string; google_calendar_refresh_token: string | null }[]) {
      if (p.google_calendar_refresh_token) tokens.set(p.id, p.google_calendar_refresh_token);
    }
  };

  /** Pages through candidate rows (oldest first) until BATCH belong to Gmail owners. */
  const pick = async <T extends { owner_id: string }>(
    page: (from: number, to: number) => Promise<{ data: T[] | null; error: { message: string } | null }>,
  ): Promise<T[]> => {
    const out: T[] = [];
    for (let i = 0; i < MAX_PAGES && out.length < BATCH; i++) {
      const { data, error } = await page(i * PAGE, (i + 1) * PAGE - 1);
      if (error) throw new Error(error.message);
      const rows = data ?? [];
      await loadTokens(rows.map((r) => r.owner_id));
      for (const r of rows) if (tokens.get(r.owner_id) && out.length < BATCH) out.push(r);
      if (rows.length < PAGE) break;
    }
    return out;
  };

  const floor = ago(MAX_LATENESS_MINUTES);

  // Too late to send without surprising the recipient: say so instead of leaving it "Due now".
  const late = await pick<{ id: string; owner_id: string }>((a, z) =>
    db.from("scheduled_outreach")
      .select("id, owner_id")
      .eq("status", "scheduled")
      .eq("channel", "email")
      .lt("scheduled_at", floor)
      .order("scheduled_at", { ascending: true })
      .range(a, z));
  if (late.length) {
    const { data: missed, error } = await db
      .from("scheduled_outreach")
      .update({ status: "missed", failure_reason: "Not sent: it was more than 2 hours late" })
      .in("id", late.map((r) => r.id))
      .eq("status", "scheduled")
      .select("id");
    if (error) throw new Error(error.message);
    results.missed = missed?.length ?? 0;
  }

  const due = await pick<Due>((a, z) =>
    db.from("scheduled_outreach")
      .select("id, owner_id, contact_id, subject, message")
      .eq("status", "scheduled")
      .eq("channel", "email")
      .lte("scheduled_at", now.toISOString())
      .gte("scheduled_at", floor)
      .order("scheduled_at", { ascending: true })
      .range(a, z));

  for (const row of due) {
    // Claim it first. Two cron ticks can overlap if one runs long, and sending
    // the same outreach twice is worse than sending it late.
    const { data: claimed, error: claimErr } = await db
      .from("scheduled_outreach")
      .update({ status: "sending" })
      .eq("id", row.id)
      .eq("status", "scheduled")
      // An Edit that moved it to the future between our read and now must not go out.
      .lte("scheduled_at", now.toISOString())
      .select("id, contact_id, subject, message");
    if (claimErr) throw new Error(claimErr.message);
    if (!claimed?.length) { results.skipped++; continue; }
    // Send what the claim saw, not our earlier read: an Edit may have changed the text.
    const live = claimed[0] as Pick<Due, "contact_id" | "subject" | "message">;

    // Guarded on 'sending': a row the user retried or the sweep moved is not overwritten.
    const finish = async (patch: Record<string, unknown>) => {
      const { error } = await db.from("scheduled_outreach")
        .update(patch).eq("id", row.id).eq("status", "sending");
      if (error) throw new Error(error.message);
    };
    const fail = async (reason: string) => {
      await finish({ status: "failed", failure_reason: reason.slice(0, 200) });
      results.failed++;
    };

    let to: string | null = null;
    try {
      if (live.contact_id) {
        // Scoped to the row's owner: the service role would otherwise read anyone's contact.
        const { data: c, error: cErr } = await db
          .from("contacts").select("email")
          .eq("id", live.contact_id).eq("owner_id", row.owner_id).maybeSingle();
        if (cErr) throw new Error(cErr.message);
        if (!c) { await fail("Not sent: contact not found"); continue; }
        to = c.email?.trim() || null;
      }
    } catch (e) {
      console.error("Contact lookup failed for", row.id, (e as Error).message);
      await fail("Not sent: something went wrong, try again");
      continue;
    }
    if (!to) { await fail("Not sent: this contact has no email address"); continue; }
    if (!SIMPLE_ADDRESS.test(to)) { await fail("Not sent: this contact's email address isn't valid"); continue; }

    let sent: Awaited<ReturnType<Deliver>>;
    try {
      sent = await deliver(tokens.get(row.owner_id)!, to, live.subject ?? "(no subject)", live.message);
    } catch (e) {
      // The request may have reached Gmail before the connection died, so don't invite a blind Retry.
      console.error("Send threw for", row.id, e instanceof Error ? e.message : "non-error");
      await fail("Not sent: we lost contact with Gmail. Check your Sent folder before retrying");
      continue;
    }
    if (!sent.ok) { await fail(sent.reason); continue; }

    await finish({ status: "sent", sent_at: now.toISOString() });
    results.sent++;
  }
  return results;
}
