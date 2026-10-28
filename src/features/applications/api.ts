import { supabase } from "@/lib/supabase";
import type { TablesInsert, TablesUpdate } from "@/lib/database.types";
import type { Application } from "@/types";

// Every function throws the PostgREST error instead of returning it, so callers write
// one try/catch rather than an `if (error)` after each call.

export async function listApplications(): Promise<Application[]> {
  const { data, error } = await supabase
    .from("applications")
    .select("*")
    .order("date_applied", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data;
}

export async function createApplication(values: TablesInsert<"applications">): Promise<void> {
  const { error } = await supabase.from("applications").insert(values);
  if (error) throw error;
}

export async function updateApplication(id: string, values: TablesUpdate<"applications">): Promise<void> {
  const { error } = await supabase.from("applications").update(values).eq("id", id);
  if (error) throw error;
}

export async function deleteApplication(id: string): Promise<void> {
  const { error } = await supabase.from("applications").delete().eq("id", id);
  if (error) throw error;
}
