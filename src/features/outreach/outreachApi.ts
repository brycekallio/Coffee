import { supabase } from "@/lib/supabase";
import type { TablesUpdate } from "@/lib/database.types";

/**
 * Writes from the Outreach page race the 5-minute cron, which claims a row
 * (scheduled -> sending) and then marks it sent. A plain `update ... where id = ?` would
 * overwrite whatever the cron just did, so every write names the status it expects. If the
 * row has moved on, nothing matches and we say so rather than send twice.
 *
 * Returns true when a row was changed.
 */
export async function updateIfStatus(
  id: string,
  patch: TablesUpdate<"scheduled_outreach">,
  expected: string | string[],
): Promise<boolean> {
  const q = supabase.from("scheduled_outreach").update(patch).eq("id", id);
  const { data, error } = await (Array.isArray(expected)
    ? q.in("status", expected)
    : q.eq("status", expected)
  ).select("id");
  if (error) throw error;
  return (data?.length ?? 0) > 0;
}

/** A mailto: body is plain text, so the message goes through untouched. */
export function buildMailto(to: string, subject: string, message: string): string {
  return `mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(message)}`;
}

/** The reason shown under a row the cron could not send. */
export function failureLabel(item: { failure_reason: string | null }): string {
  const r = item.failure_reason;
  if (!r) return "Not sent";
  // Written by the cron before it stopped touching rows for people without Gmail.
  if (r === "Gmail is not connected") return "Not sent: connect Gmail in Settings";
  return r;
}
