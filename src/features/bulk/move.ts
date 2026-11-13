// Network <-> Watchlist: the two lists are different tables with different columns, so a
// move is a field mapping. Anything the destination has no column for goes into notes as a
// labelled line rather than being dropped, and coming back reads it out again, so a round
// trip keeps every field the user can see or edit.
import type { Tables, TablesInsert } from "@/lib/database.types";

type ContactRow = Tables<"contacts">;
type TargetRow = Tables<"watchlist_targets">;

/** Contact columns the Watchlist has no column for, kept as "Label: value" lines in its notes. */
const FIELD_LINES = [
  ["Email", "email"],
  ["Phone", "phone"],
  ["Last contacted", "last_touch_at"],
] as const;

/** Labels still read out of a Watchlist notes field — LinkedIn lives in a column now, but
 *  notes written before that column existed still carry "LinkedIn: …" lines. */
const NOTE_LABELS = [...FIELD_LINES.map(([label]) => label), "LinkedIn"] as const;

/** The Watchlist status, kept as a notes line on the Network side (contacts have no such column). */
const STATUS_LABEL = "Watchlist status";
const DEFAULT_TARGET_STATUS = "not_contacted";

/** Splits labelled lines out of a notes field. Only the first line per label counts. */
function readLines<L extends string>(notes: string | null, labels: readonly L[]) {
  const found: Partial<Record<L, string>> = {};
  const rest: string[] = [];
  for (const line of (notes ?? "").split("\n")) {
    const label = labels.find((l) => line.startsWith(`${l}: `));
    if (label && found[label] === undefined) found[label] = line.slice(label.length + 2).trim();
    else rest.push(line);
  }
  return { found, rest: rest.join("\n").trim() };
}

export function contactToTarget(c: ContactRow): TablesInsert<"watchlist_targets"> {
  const { found, rest } = readLines(c.notes, [STATUS_LABEL]);
  const notes = [...FIELD_LINES.filter(([, k]) => c[k]).map(([label, k]) => `${label}: ${c[k]}`), rest || null]
    .filter(Boolean)
    .join("\n");
  return {
    owner_id: c.owner_id,
    person_name: [c.first_name, c.last_name].filter(Boolean).join(" ").trim() || "Unnamed",
    company: c.company ?? "",
    role: c.title,
    linkedin_url: c.linkedin_url,
    status: found[STATUS_LABEL] || DEFAULT_TARGET_STATUS,
    next_action_date: c.next_touch_at ? c.next_touch_at.slice(0, 10) : null,
    notes: notes || null,
    starred: c.starred,
    tags: c.tags,
    ...(c.created_at ? { created_at: c.created_at } : {}),
  };
}

const sameUrl = (a: string, b: string) => {
  const norm = (u: string) => u.trim().toLowerCase().replace(/\/+$/, "");
  return norm(a) === norm(b);
};

export function targetToContact(t: TargetRow): TablesInsert<"contacts"> {
  const { found, rest } = readLines(t.notes, NOTE_LABELS);
  const field = (k: (typeof FIELD_LINES)[number][1]) => found[FIELD_LINES.find(([, key]) => key === k)![0]] || null;
  const [first, ...others] = t.person_name.trim().split(/\s+/);
  // An old "LinkedIn: …" notes line that differs from the real column is kept as a notes line, not dropped.
  const oldLinkedin = found["LinkedIn"];
  const keepOldLinkedin = oldLinkedin && t.linkedin_url && sameUrl(oldLinkedin, t.linkedin_url) === false;
  const notes = [
    t.status && t.status !== DEFAULT_TARGET_STATUS ? `${STATUS_LABEL}: ${t.status}` : null,
    keepOldLinkedin ? `LinkedIn: ${oldLinkedin}` : null,
    rest || null,
  ]
    .filter(Boolean)
    .join("\n");
  return {
    owner_id: t.owner_id,
    first_name: first || null,
    last_name: others.join(" ") || null,
    company: t.company || null,
    title: t.role,
    email: field("email"),
    phone: field("phone"),
    linkedin_url: t.linkedin_url || found["LinkedIn"] || null,
    last_touch_at: field("last_touch_at"),
    notes: notes || null,
    status: "to_contact",
    next_touch_at: t.next_action_date ? `${t.next_action_date}T00:00:00.000Z` : null,
    starred: t.starred,
    tags: t.tags,
    created_at: t.created_at,
  };
}
