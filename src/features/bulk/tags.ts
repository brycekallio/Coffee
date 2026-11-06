// Tags ("groups") and starring, as pure functions over rows.

export const MAX_TAG_LENGTH = 24;
export const MAX_TAGS_PER_ROW = 20; // mirrors the check constraint in the migration

export interface BulkRow {
  id: string;
  starred: boolean;
  tags: string[];
  created_at: string | null;
}

/** Trim, collapse spaces, drop commas, cap the length. Empty string = not a usable tag. */
export function normalizeTag(raw: string): string {
  return raw.replace(/[,\s]+/g, " ").trim().slice(0, MAX_TAG_LENGTH).trim();
}

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

export const hasTag = (tags: readonly string[], tag: string) => tags.some((t) => same(t, tag));

/** Every distinct tag across the rows (first spelling wins), alphabetical. */
export function allTags(rows: readonly { tags: string[] }[]): string[] {
  const seen = new Map<string, string>();
  for (const r of rows) for (const t of r.tags) if (!seen.has(t.toLowerCase())) seen.set(t.toLowerCase(), t);
  return [...seen.values()].sort((a, b) => a.localeCompare(b));
}

/** How many of the given rows carry the tag: drives the tag menu's none/some/all state. */
export function tagState(rows: readonly { tags: string[] }[], tag: string): "none" | "some" | "all" {
  const n = rows.filter((r) => hasTag(r.tags, tag)).length;
  return n === 0 ? "none" : n === rows.length ? "all" : "some";
}

/** One row's tags after adding or removing `tag`. Adding a tag it already has changes nothing. */
export function withTag(tags: readonly string[], tag: string, mode: "add" | "remove"): string[] {
  if (mode === "remove") return tags.filter((t) => !same(t, tag));
  if (hasTag(tags, tag) || tags.length >= MAX_TAGS_PER_ROW) return [...tags];
  return [...tags, tag];
}

export interface TagGroup {
  tags: string[];
  ids: string[];
}

/**
 * Plans a bulk tag change as the fewest updates: rows that end up with the same tag list go
 * in one group (one request each). Rows the change would not alter are left out.
 */
export function planTagChange(rows: readonly { id: string; tags: string[] }[], tag: string, mode: "add" | "remove"): TagGroup[] {
  const groups = new Map<string, TagGroup>();
  for (const r of rows) {
    const next = withTag(r.tags, tag, mode);
    if (next.length === r.tags.length && next.every((t, i) => t === r.tags[i])) continue;
    const key = JSON.stringify(next);
    const g = groups.get(key) ?? { tags: next, ids: [] };
    g.ids.push(r.id);
    groups.set(key, g);
  }
  return [...groups.values()];
}

/** Starred rows first; otherwise the order the list already had (stable). */
export function starredFirst<T extends { starred: boolean }>(rows: readonly T[]): T[] {
  return [...rows.filter((r) => r.starred), ...rows.filter((r) => !r.starred)];
}

/** Star everything unless it's all starred already, then unstar (Gmail's behaviour). */
export function nextStarValue(rows: readonly { starred: boolean }[]): boolean {
  return !(rows.length > 0 && rows.every((r) => r.starred));
}
