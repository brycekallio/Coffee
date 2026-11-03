// Moves between Network (contacts) and Watchlist (watchlist_targets), copy-then-delete.
//
// Safe order, one chunk at a time: copy the chunk, then delete its originals. A failed copy
// changes nothing for that chunk; a failed delete (one DELETE statement, so all-or-nothing)
// removes that chunk's copies again. Earlier chunks are fully moved, later ones untouched,
// so nobody ever ends up in neither list. (If removing the copies also fails, the person is
// in both lists: the recoverable direction.)
// Every query names the signed-in user's id as well as relying on RLS.
import { supabase } from "@/lib/supabase";
import { chunks } from "./chunk";
import { contactToTarget, targetToContact } from "./move";

export interface MoveResult {
  moved: number;
  /** Contacts with logged meetings, meeting notes, applications or scheduled outreach. The Watchlist has nowhere to keep those (deleting the contact would cascade or orphan them), so they stay put. */
  blocked: number;
}

/** Every table that points at contacts.id. Keep in step with the foreign keys in the live schema. */
export const CONTACT_HISTORY_TABLES = ["contact_meetings", "meeting_notes", "applications", "scheduled_outreach"] as const;

async function ownedContactIdsWithHistory(ownerId: string, ids: string[]): Promise<Set<string>> {
  const used = new Set<string>();
  for (const part of chunks(ids)) {
    const results = await Promise.all(
      CONTACT_HISTORY_TABLES.map((table) => supabase.from(table).select("contact_id").eq("owner_id", ownerId).in("contact_id", part)),
    );
    for (const { data, error } of results) {
      if (error) throw error;
      for (const r of data) if (r.contact_id) used.add(r.contact_id);
    }
  }
  return used;
}

/** Thrown when some chunks moved before one failed; `moved` says how many did. */
export class PartialMoveError extends Error {
  constructor(
    readonly moved: number,
    readonly reason: unknown,
  ) {
    super(`Moved ${moved}, then stopped: ${reason instanceof Error ? reason.message : String((reason as { message?: string })?.message ?? reason)}`);
  }
}

type Table = "contacts" | "watchlist_targets";

async function copyThenDelete<R extends { id: string }>(
  ownerId: string,
  rows: R[],
  from: Table,
  to: Table,
  toInsert: (r: R) => Record<string, unknown>,
): Promise<number> {
  let moved = 0;
  for (const part of chunks(rows)) {
    try {
      const { data, error } = await supabase
        .from(to)
        .insert(part.map((r) => ({ ...toInsert(r), owner_id: ownerId })) as never)
        .select("id");
      if (error) throw error;
      const copyIds = (data as { id: string }[]).map((d) => d.id);
      const { error: delError } = await supabase.from(from).delete().eq("owner_id", ownerId).in("id", part.map((r) => r.id));
      if (delError) {
        await removeCopies(to, ownerId, copyIds);
        throw delError;
      }
      moved += part.length;
    } catch (e) {
      if (moved === 0) throw e;
      throw new PartialMoveError(moved, e);
    }
  }
  return moved;
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
  const moved = await copyThenDelete(ownerId, movable, "contacts", "watchlist_targets", contactToTarget);
  return { moved, blocked: rows.length - movable.length };
}

export async function moveTargetsToContacts(ownerId: string, ids: string[]): Promise<MoveResult> {
  const rows = [];
  for (const part of chunks(ids)) {
    const { data, error } = await supabase.from("watchlist_targets").select("*").eq("owner_id", ownerId).in("id", part);
    if (error) throw error;
    rows.push(...data);
  }
  if (rows.length === 0) return { moved: 0, blocked: 0 };
  const moved = await copyThenDelete(ownerId, rows, "watchlist_targets", "contacts", targetToContact);
  return { moved, blocked: 0 };
}

/** Best effort: undoing a half-finished move must not mask the error that stopped it. */
async function removeCopies(table: Table, ownerId: string, ids: string[]) {
  for (const part of chunks(ids)) {
    await supabase.from(table).delete().eq("owner_id", ownerId).in("id", part);
  }
}
