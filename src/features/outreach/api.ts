import { supabase } from "@/lib/supabase";
import type { ScheduledOutreach } from "@/types";

export async function listScheduledOutreach(): Promise<ScheduledOutreach[]> {
  const { data, error } = await supabase
    .from("scheduled_outreach")
    .select("*")
    .order("scheduled_at", { ascending: false });
  if (error) throw error;
  return data;
}
