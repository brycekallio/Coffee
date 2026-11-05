import { supabase } from "@/lib/supabase";
import { chunks } from "./chunk";
import type { TagGroup } from "./tags";

/**
 * The three bulk writes every list shares: delete, star, tag. Each names the signed-in
 * user (`owner_id`) as well as the ids. RLS already refuses other users' rows; this is the
 * second lock, so a stray or forged id matches nothing. Ids go in chunks (see chunk.ts).
 */
export function bulkApi(table: "contacts" | "watchlist_targets") {
  return {
    async remove(ownerId: string, ids: string[]): Promise<void> {
      for (const part of chunks(ids)) {
        const { error } = await supabase.from(table).delete().eq("owner_id", ownerId).in("id", part);
        if (error) throw error;
      }
    },
    async setStarred(ownerId: string, ids: string[], starred: boolean): Promise<void> {
      for (const part of chunks(ids)) {
        const { error } = await supabase.from(table).update({ starred }).eq("owner_id", ownerId).in("id", part);
        if (error) throw error;
      }
    },
    async setTags(ownerId: string, group: TagGroup): Promise<void> {
      for (const part of chunks(group.ids)) {
        const { error } = await supabase.from(table).update({ tags: group.tags }).eq("owner_id", ownerId).in("id", part);
        if (error) throw error;
      }
    },
  };
}
