import { bulkApi } from "@/features/bulk/bulkApi";

// Bulk writes for the Watchlist: the same three as Contacts, on the watchlist table.
const targetsBulk = bulkApi("watchlist_targets");
export const deleteTargets = targetsBulk.remove;
export const setTargetsStarred = targetsBulk.setStarred;
export const setTargetsTags = targetsBulk.setTags;
