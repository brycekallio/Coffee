import { supabase } from "@/lib/supabase";
import type { TablesInsert, TablesUpdate } from "@/lib/database.types";
import type { Contact } from "@/types";
import { chunks } from "@/features/bulk/chunk";
import type { TagGroup } from "@/features/bulk/tags";

// Throw on error; see features/applications/api.ts.

/** Columns must match the Contact type in src/types.ts. */
const CONTACT_COLUMNS =
  "id, owner_id, first_name, last_name, company, title, email, phone, linkedin_url, status, created_at, starred, tags";

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

// ── Bulk writes ──────────────────────────────────────────────────────────────────
// Each one names the signed-in user (`owner_id`) as well as the ids. RLS already refuses
// other users' rows; this is the second lock, so a stray or forged id matches nothing.

export async function deleteContacts(ownerId: string, ids: string[]): Promise<void> {
  for (const part of chunks(ids)) {
    const { error } = await supabase.from("contacts").delete().eq("owner_id", ownerId).in("id", part);
    if (error) throw error;
  }
}

export async function setContactsStarred(ownerId: string, ids: string[], starred: boolean): Promise<void> {
  for (const part of chunks(ids)) {
    const { error } = await supabase.from("contacts").update({ starred }).eq("owner_id", ownerId).in("id", part);
    if (error) throw error;
  }
}

export async function setContactsTags(ownerId: string, group: TagGroup): Promise<void> {
  for (const part of chunks(group.ids)) {
    const { error } = await supabase.from("contacts").update({ tags: group.tags }).eq("owner_id", ownerId).in("id", part);
    if (error) throw error;
  }
}
