import { supabase } from "@/lib/supabase";

/**
 * "Just remind me": the follow-up date goes on the contact's `next_touch_at` (the same column the
 * Watchlist <-> Network move carries as the next action date). Names the signed-in user as well as
 * the id, so a forged id matches nothing even if RLS were wrong; throws when nothing matched.
 */
export async function saveFollowUpReminder(contactId: string, userId: string, atIso: string): Promise<void> {
  const { data, error } = await supabase
    .from("contacts")
    .update({ next_touch_at: atIso })
    .eq("id", contactId)
    .eq("owner_id", userId)
    .select("id");
  if (error) throw error;
  if (!data || data.length === 0) throw new Error("No contact of yours matched. Refresh and try again.");
}

/** The saved follow-up dates of the given contacts, for the "Reminder" line on each card. */
export async function listFollowUpDates(contactIds: string[]): Promise<Record<string, string>> {
  if (contactIds.length === 0) return {};
  const { data, error } = await supabase.from("contacts").select("id, next_touch_at").in("id", contactIds);
  if (error) throw error;
  const out: Record<string, string> = {};
  for (const r of data ?? []) if (r.next_touch_at) out[r.id] = r.next_touch_at;
  return out;
}

/** Most recent meeting date per contact (YYYY-MM-DD), for the 30-day rule. */
export async function listLastMeetingDates(contactIds: string[]): Promise<Record<string, string>> {
  if (contactIds.length === 0) return {};
  const { data, error } = await supabase
    .from("contact_meetings")
    .select("contact_id, meeting_date")
    .in("contact_id", contactIds)
    .order("meeting_date", { ascending: false });
  if (error) throw error;
  const out: Record<string, string> = {};
  for (const m of data ?? []) if (m.contact_id && m.meeting_date && !out[m.contact_id]) out[m.contact_id] = m.meeting_date;
  return out;
}
