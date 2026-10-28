import { supabase } from "@/lib/supabase";
import type { TablesInsert, TablesUpdate } from "@/lib/database.types";
import type { Contact } from "@/types";

// Throw on error; see features/applications/api.ts.

/** Columns must match the Contact type in src/types.ts. */
const CONTACT_COLUMNS =
  "id, owner_id, first_name, last_name, company, title, email, phone, linkedin_url, status, created_at";

export async function listContacts(): Promise<Contact[]> {
  const { data, error } = await supabase
    .from("contacts")
    .select(CONTACT_COLUMNS)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data;
}

/** Inserts in chunks — PostgREST payloads stay small even for a large CSV. */
export async function createContacts(values: TablesInsert<"contacts">[], chunkSize = 200): Promise<void> {
  for (let i = 0; i < values.length; i += chunkSize) {
    const { error } = await supabase.from("contacts").insert(values.slice(i, i + chunkSize));
    if (error) throw error;
  }
}

export async function updateContact(id: string, values: TablesUpdate<"contacts">): Promise<void> {
  const { error } = await supabase.from("contacts").update(values).eq("id", id);
  if (error) throw error;
}

export async function deleteContact(id: string): Promise<void> {
  const { error } = await supabase.from("contacts").delete().eq("id", id);
  if (error) throw error;
}
