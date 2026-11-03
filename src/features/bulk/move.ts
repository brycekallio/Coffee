// Network <-> Watchlist: the two lists are different tables with different columns, so a
// move is a field mapping. Anything the destination has no column for goes into notes
// rather than being dropped, and coming back reads it out again, so a round trip is lossless.
import type { Tables, TablesInsert } from "@/lib/database.types";

type ContactRow = Tables<"contacts">;
type TargetRow = Tables<"watchlist_targets">;

const FIELD_LINES = [
  ["Email", "email"],
  ["Phone", "phone"],
  ["LinkedIn", "linkedin_url"],
] as const;

export function contactToTarget(c: ContactRow): TablesInsert<"watchlist_targets"> {
  const notes = [
    ...FIELD_LINES.filter(([, k]) => c[k]).map(([label, k]) => `${label}: ${c[k]}`),
    c.notes?.trim() || null,
  ]
    .filter(Boolean)
    .join("\n");
  return {
    owner_id: c.owner_id,
    person_name: [c.first_name, c.last_name].filter(Boolean).join(" ").trim() || "Unnamed",
    company: c.company ?? "",
    role: c.title,
    status: "not_contacted",
    next_action_date: c.next_touch_at ? c.next_touch_at.slice(0, 10) : null,
    notes: notes || null,
    starred: c.starred,
    tags: c.tags,
    ...(c.created_at ? { created_at: c.created_at } : {}),
  };
}

export function targetToContact(t: TargetRow): TablesInsert<"contacts"> {
  const found: Partial<Record<(typeof FIELD_LINES)[number][1], string>> = {};
  const rest: string[] = [];
  for (const line of (t.notes ?? "").split("\n")) {
    const hit = FIELD_LINES.find(([label]) => line.startsWith(`${label}: `));
    if (hit && !found[hit[1]]) found[hit[1]] = line.slice(hit[0].length + 2).trim();
    else rest.push(line);
  }
  const [first, ...others] = t.person_name.trim().split(/\s+/);
  const notes = rest.join("\n").trim();
  return {
    owner_id: t.owner_id,
    first_name: first || null,
    last_name: others.join(" ") || null,
    company: t.company || null,
    title: t.role,
    email: found.email ?? null,
    phone: found.phone ?? null,
    linkedin_url: found.linkedin_url ?? null,
    notes: notes || null,
    status: "to_contact",
    next_touch_at: t.next_action_date ? `${t.next_action_date}T00:00:00.000Z` : null,
    starred: t.starred,
    tags: t.tags,
    created_at: t.created_at,
  };
}
