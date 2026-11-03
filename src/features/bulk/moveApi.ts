// Moves between Network (contacts) and Watchlist (watchlist_targets), copy-then-delete.
//
// Safe order: copy first, delete second. A failed copy changes nothing; a failed delete
// removes the copies again, so a move never leaves a person in both lists or in neither.
// Every query names the signed-in user's id as well as relying on RLS.
import { supabase } from "@/lib/supabase";
import { chunks } from "./chunk";
import { contactToTarget, targetToContact } from "./move";

export interface MoveResult {
  moved: number;
  /** Contacts with logged meetings, applications or scheduled outreach. The Watchlist has nowhere to keep those, so they stay put. */
  blocked: number;
}

async function ownedContactIdsWithHistory(ownerId: string, ids: string[]): Promise<Set<string>> {
  const used = new Set<string>();
  for (const part of chunks(ids)) {
    for (const table of ["contact_meetings", "applications", "scheduled_outreach"] as const) {
      const { data, error } = await supabase.from(table).select("contact_id").eq("owner_id", ownerId).in("contact_id", part);
      if (error) throw error;
      for (const r of data) if (r.contact_id) used.add(r.contact_id);
    }
  }
  return used;
}

export async function moveContactsToWatchlist(ownerId: string, ids: string[]): Promise<MoveResult> {
  const rows = [];
  for (const part of chunks(ids)) {
    const { data, error } = await supabase.from("contacts").select("*").eq("owner_id", ownerId).in("id", part);
    if (error) throw error;
    rows.push(...data);
  }
  const withHistory = await ownedContactIdsWithHistory(ownerId, rows.map((r) => r.id));
  const movable = rows.filter((r) => !withHistory.has(r.id));
  if (movable.length === 0) return { moved: 0, blocked: rows.length };

  const copyIds: string[] = [];
  for (const part of chunks(movable)) {
    const { data, error } = await supabase
      .from("watchlist_targets")
      .insert(part.map((c) => ({ ...contactToTarget(c), owner_id: ownerId })))
      .select("id");
    if (error) {
      await removeCopies("watchlist_targets", ownerId, copyIds);
      throw error;
    }
    copyIds.push(...data.map((d) => d.id));
  }

  for (const part of chunks(movable.map((r) => r.id))) {
    const { error } = await supabase.from("contacts").delete().eq("owner_id", ownerId).in("id", part);
    if (error) {
      await removeCopies("watchlist_targets", ownerId, copyIds);
      throw error;
    }
  }
  return { moved: movable.length, blocked: rows.length - movable.length };
}

export async function moveTargetsToContacts(ownerId: string, ids: string[]): Promise<MoveResult> {
  const rows = [];
  for (const part of chunks(ids)) {
    const { data, error } = await supabase.from("watchlist_targets").select("*").eq("owner_id", ownerId).in("id", part);
    if (error) throw error;
    rows.push(...data);
  }
  if (rows.length === 0) return { moved: 0, blocked: 0 };

  const copyIds: string[] = [];
  for (const part of chunks(rows)) {
    const { data, error } = await supabase
      .from("contacts")
      .insert(part.map((t) => ({ ...targetToContact(t), owner_id: ownerId })))
      .select("id");
    if (error) {
      await removeCopies("contacts", ownerId, copyIds);
      throw error;
    }
    copyIds.push(...data.map((d) => d.id));
  }

  for (const part of chunks(rows.map((r) => r.id))) {
    const { error } = await supabase.from("watchlist_targets").delete().eq("owner_id", ownerId).in("id", part);
    if (error) {
      await removeCopies("contacts", ownerId, copyIds);
      throw error;
    }
  }
  return { moved: rows.length, blocked: 0 };
}

/** Best effort: undoing a half-finished move must not mask the error that stopped it. */
async function removeCopies(table: "contacts" | "watchlist_targets", ownerId: string, ids: string[]) {
  for (const part of chunks(ids)) {
    await supabase.from(table).delete().eq("owner_id", ownerId).in("id", part);
  }
}
