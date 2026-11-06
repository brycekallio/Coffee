import { supabase } from "@/lib/supabase";
import type { TablesUpdate } from "@/lib/database.types";
import type { ScheduledOutreach } from "@/types";

export async function listScheduledOutreach(): Promise<ScheduledOutreach[]> {
  const { data, error } = await supabase
    .from("scheduled_outreach")
    .select("*")
    .order("scheduled_at", { ascending: false });
  if (error) throw error;
  return data;
}

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

/** The row's current status, or null if it is gone. Used to explain why a guarded write matched nothing. */
export async function getOutreachStatus(id: string): Promise<string | null> {
  const { data, error } = await supabase
    .from("scheduled_outreach").select("status").eq("id", id).maybeSingle();
  if (error) throw error;
  return data?.status ?? null;
}
