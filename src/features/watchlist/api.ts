import { supabase } from "@/lib/supabase";
import { chunks } from "@/features/bulk/chunk";
import type { TagGroup } from "@/features/bulk/tags";

// Bulk writes for the Watchlist. Each names the signed-in user (`owner_id`) as well as the
// ids; RLS already refuses other users' rows, this is the second lock.

export async function deleteTargets(ownerId: string, ids: string[]): Promise<void> {
  for (const part of chunks(ids)) {
    const { error } = await supabase.from("watchlist_targets").delete().eq("owner_id", ownerId).in("id", part);
    if (error) throw error;
  }
}

export async function setTargetsStarred(ownerId: string, ids: string[], starred: boolean): Promise<void> {
  for (const part of chunks(ids)) {
    const { error } = await supabase.from("watchlist_targets").update({ starred }).eq("owner_id", ownerId).in("id", part);
    if (error) throw error;
  }
}

export async function setTargetsTags(ownerId: string, group: TagGroup): Promise<void> {
  for (const part of chunks(group.ids)) {
    const { error } = await supabase.from("watchlist_targets").update({ tags: group.tags }).eq("owner_id", ownerId).in("id", part);
    if (error) throw error;
  }
}
