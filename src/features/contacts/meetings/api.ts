import { supabase } from "@/lib/supabase";
import type { TablesInsert, TablesUpdate } from "@/lib/database.types";
import type { ContactMeeting } from "@/types";

// Throw on error; see features/applications/api.ts.

export async function listMeetings(contactId: string): Promise<ContactMeeting[]> {
  const { data, error } = await supabase
    .from("contact_meetings")
    .select("*")
    .eq("contact_id", contactId)
    .order("meeting_date", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data;
}

export async function createMeeting(values: TablesInsert<"contact_meetings">): Promise<void> {
  const { error } = await supabase.from("contact_meetings").insert(values);
  if (error) throw error;
}

export async function updateMeeting(id: string, values: TablesUpdate<"contact_meetings">): Promise<void> {
  const { error } = await supabase.from("contact_meetings").update(values).eq("id", id);
  if (error) throw error;
}

export async function deleteMeeting(id: string): Promise<void> {
  const { error } = await supabase.from("contact_meetings").delete().eq("id", id);
  if (error) throw error;
}
