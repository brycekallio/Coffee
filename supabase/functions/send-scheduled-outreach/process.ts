// The cron's decisions, kept apart from Deno.serve and the Google calls so they can be
// tested against a fake database. index.ts wires in the real Gmail delivery.

/** How far past its time a message may still go out. */
export const MAX_LATENESS_MINUTES = 120;
/** A row 'sending' for longer than this was abandoned (the function died after claiming it). */
export const STUCK_SENDING_MINUTES = 15;

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

export async function processDue(
  db: Db,
  opts: { now: Date; deliver: Deliver },
): Promise<{ sent: number; failed: number; skipped: number; missed: number }> {
  const { now, deliver } = opts;
  const results = { sent: 0, failed: 0, skipped: 0, missed: 0 };
  const ago = (min: number) => new Date(now.getTime() - min * 60_000).toISOString();

  // A row stuck in 'sending' is hidden from the page. There is no claimed-at column, so
  // scheduled_at stands in: a row is claimed within minutes of its time, and a send takes
  // seconds. The final 'sent' update still overwrites this if the send did complete.
  await db.from("scheduled_outreach")
    .update({
      status: "failed",
      failure_reason: "Not sent: it got stuck. Check your Sent folder before retrying",
    })
    .eq("status", "sending")
    .lt("scheduled_at", ago(STUCK_SENDING_MINUTES));

  // Only people with Gmail connected get automatic sending. Everyone else's email rows
  // stay 'scheduled': for them Outreach is a reminder list and they send by hand.
  const { data: owners } = await db
    .from("profiles")
    .select("id, google_calendar_refresh_token")
    .not("google_calendar_refresh_token", "is", null);
  const tokens = new Map<string, string>(
    ((owners ?? []) as { id: string; google_calendar_refresh_token: string }[])
      .map((p) => [p.id, p.google_calendar_refresh_token]),
  );
  if (tokens.size === 0) return results;
  const ownerIds = [...tokens.keys()];

  const floor = ago(MAX_LATENESS_MINUTES);

  // Too late to send without surprising the recipient: say so instead of leaving it "Due now".
  const { data: missed } = await db
    .from("scheduled_outreach")
    .update({ status: "missed", failure_reason: "Not sent: it was more than 2 hours late" })
    .eq("status", "scheduled")
    .eq("channel", "email")
    .in("owner_id", ownerIds)
    .lt("scheduled_at", floor)
    .select("id");
  results.missed = missed?.length ?? 0;

  const { data: due, error } = await db
    .from("scheduled_outreach")
    .select("id, owner_id, contact_id, subject, message")
    .eq("status", "scheduled")
    .eq("channel", "email")
    .in("owner_id", ownerIds)
    .lte("scheduled_at", now.toISOString())
    .gte("scheduled_at", floor)
    .limit(50);
  if (error) throw new Error(error.message);

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

    let to: string | null = null;
    if (row.contact_id) {
      // Scoped to the row's owner: the service role would otherwise read anyone's contact.
      const { data: c } = await db
        .from("contacts").select("email")
        .eq("id", row.contact_id).eq("owner_id", row.owner_id).single();
      if (!c) { await fail("Not sent: contact not found"); continue; }
      to = c.email?.trim() || null;
    }
    if (!to) { await fail("Not sent: this contact has no email address"); continue; }

    const sent = await deliver(tokens.get(row.owner_id)!, to, row.subject ?? "(no subject)", row.message);
    if (!sent.ok) { await fail(sent.reason); continue; }

    await db.from("scheduled_outreach")
      .update({ status: "sent", sent_at: now.toISOString() })
      .eq("id", row.id);
    results.sent++;
  }
  return results;
}
