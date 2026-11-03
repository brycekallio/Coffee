import {
  cleanLinkedInUrl,
  cleanEmail,
  cleanText,
  FIELD_LIMITS,
  linkedInKey,
} from "../../../supabase/functions/_shared/contactFields.ts";
import type { Contact } from "@/types";

/**
 * LinkedIn "Connections" export (Settings → Data privacy → Get a copy of your data).
 *
 * The file starts with a few lines of notes, e.g.
 *
 *   Notes:
 *   "When exporting your connection data, you may notice that some of the email
 *   addresses are missing. …"
 *
 *   First Name,Last Name,URL,Email Address,Company,Position,Connected On
 *   Ada,Lovelace,https://www.linkedin.com/in/ada,,Analytical Engines,Analyst,05 Mar 2024
 *
 * which is why Coffee's generic CSV reader (it assumes row 1 is the header) can't take it.
 *
 * The file is treated as hostile: size and row caps, every cell cleaned (control characters,
 * HTML, leading formula characters, length), the URL rebuilt from a validated /in/ slug.
 * Pure functions, no React, no network.
 */

export const MAX_FILE_BYTES = 5 * 1024 * 1024;
export const MAX_ROWS = 10_000;
/** Cells longer than this are cut while reading, so one giant cell can't eat memory. */
const MAX_CELL_CHARS = 1_000;
/** The notes preamble is a handful of lines; the header must show up within this many rows. */
const HEADER_SEARCH_ROWS = 25;

export class ConnectionsFileError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConnectionsFileError";
  }
}

/**
 * RFC 4180 reader. A quote only opens a quoted cell at the start of a cell (a stray quote
 * in the middle of text is just text), "" inside quotes is a literal quote, and quoted
 * cells may hold commas and line breaks. Stops after `maxRows` rows and reports it.
 */
export function readCsvRows(text: string, maxRows: number): { rows: string[][]; truncated: boolean } {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;
  let cellStart = true;

  const push = (c: string) => {
    if (cell.length < MAX_CELL_CHARS) cell += c;
  };
  const endCell = () => {
    row.push(cell);
    cell = "";
    cellStart = true;
  };
  const endRow = (): boolean => {
    endCell();
    if (row.some((c) => c.trim() !== "")) rows.push(row);
    row = [];
    return rows.length >= maxRows;
  };

  let i = text.charCodeAt(0) === 0xfeff ? 1 : 0;
  for (; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          push('"');
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        push(ch);
      }
      continue;
    }
    if (ch === '"' && cellStart) {
      inQuotes = true;
      cellStart = false;
    } else if (ch === ",") {
      endCell();
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      if (endRow()) return { rows, truncated: i + 1 < text.length && text.slice(i + 1).trim() !== "" };
    } else {
      cellStart = false;
      push(ch);
    }
  }
  if (cell !== "" || row.length > 0) endRow();
  return { rows, truncated: false };
}

export interface Connection {
  /** Position in the file: unique, and what the preview's checkboxes use as the row id. */
  id: string;
  first_name: string;
  last_name: string;
  company: string;
  title: string;
  email: string;
  linkedin_url: string;
  /** "05 Mar 2024", as LinkedIn wrote it (display only). */
  connected_on: string;
}

export interface ParsedConnections {
  people: Connection[];
  /** Rows with no usable name (LinkedIn leaves some blank, e.g. deleted accounts). */
  skippedNoName: number;
  /** The file had more rows than MAX_ROWS; the rest were ignored. */
  truncated: boolean;
}

const norm = (h: string) => h.trim().toLowerCase().replace(/[^a-z]+/g, " ").trim();

export function parseConnectionsCsv(text: string): ParsedConnections {
  if (text.length > MAX_FILE_BYTES) throw new ConnectionsFileError("That file is bigger than 5 MB, so it isn't a LinkedIn connections export.");

  // +1 for the header row; the notes preamble rows are inside the search window, not extra.
  const { rows, truncated } = readCsvRows(text, MAX_ROWS + HEADER_SEARCH_ROWS + 1);

  const headerAt = rows.slice(0, HEADER_SEARCH_ROWS).findIndex((r) => {
    const h = r.map(norm);
    return h.includes("first name") && h.includes("last name");
  });
  if (headerAt === -1) {
    throw new ConnectionsFileError(
      "This doesn't look like LinkedIn's Connections.csv. It should have First Name and Last Name columns.",
    );
  }

  const header = rows[headerAt].map(norm);
  const col = (...names: string[]) => header.findIndex((h) => names.includes(h));
  const idx = {
    first: col("first name"),
    last: col("last name"),
    url: col("url", "profile url", "linkedin url"),
    email: col("email address", "email"),
    company: col("company"),
    title: col("position", "title"),
    on: col("connected on"),
  };
  const at = (r: string[], i: number) => (i >= 0 ? (r[i] ?? "") : "");

  const dataRows = rows.slice(headerAt + 1);
  const overCap = dataRows.length > MAX_ROWS;
  const people: Connection[] = [];
  let skippedNoName = 0;

  dataRows.slice(0, MAX_ROWS).forEach((r, n) => {
    const first = cleanText(at(r, idx.first), FIELD_LIMITS.name);
    const last = cleanText(at(r, idx.last), FIELD_LIMITS.name);
    if (!first && !last) {
      skippedNoName++;
      return;
    }
    people.push({
      id: String(n),
      first_name: first,
      last_name: last,
      company: cleanText(at(r, idx.company), FIELD_LIMITS.company),
      title: cleanText(at(r, idx.title), FIELD_LIMITS.title),
      email: cleanEmail(at(r, idx.email)),
      linkedin_url: cleanLinkedInUrl(at(r, idx.url)),
      connected_on: cleanText(at(r, idx.on), 20),
    });
  });

  return { people, skippedNoName, truncated: truncated || overCap };
}

// ── Duplicates ─────────────────────────────────────────────────────────────────────

export type DuplicateReason = "linkedin" | "email" | "name" | "in-file";

export interface CheckedConnection extends Connection {
  /** Why this row can't be imported again, or null when it is new. */
  duplicate: DuplicateReason | null;
}

const lc = (s: string | null | undefined) => (s ?? "").trim().toLowerCase();
const nameKey = (first: string | null, last: string | null, company: string | null) => {
  const f = lc(first), l = lc(last), c = lc(company);
  return f && l && c ? `${f}|${l}|${c}` : "";
};

/**
 * Flags each connection that is already in the user's Network (same LinkedIn profile, same
 * email, or same first + last name + company) or repeated earlier in the file. Matching is
 * only against the user's own contacts, which is all they can see anyway.
 */
export function markDuplicates(people: readonly Connection[], existing: readonly Pick<Contact, "first_name" | "last_name" | "company" | "email" | "linkedin_url">[]): CheckedConnection[] {
  const seen = {
    linkedin: new Set<string>(),
    email: new Set<string>(),
    name: new Set<string>(),
  };
  for (const c of existing) {
    const li = linkedInKey(c.linkedin_url);
    if (li) seen.linkedin.add(li);
    if (c.email && lc(c.email)) seen.email.add(lc(c.email));
    const nk = nameKey(c.first_name, c.last_name, c.company);
    if (nk) seen.name.add(nk);
  }

  const inFile = { linkedin: new Set<string>(), email: new Set<string>(), name: new Set<string>() };

  return people.map((p) => {
    const li = linkedInKey(p.linkedin_url);
    const em = lc(p.email);
    const nk = nameKey(p.first_name, p.last_name, p.company);

    let duplicate: DuplicateReason | null = null;
    if (li && seen.linkedin.has(li)) duplicate = "linkedin";
    else if (em && seen.email.has(em)) duplicate = "email";
    else if (nk && seen.name.has(nk)) duplicate = "name";
    else if ((li && inFile.linkedin.has(li)) || (em && inFile.email.has(em)) || (nk && inFile.name.has(nk))) duplicate = "in-file";

    if (!duplicate) {
      if (li) inFile.linkedin.add(li);
      if (em) inFile.email.add(em);
      if (nk) inFile.name.add(nk);
    }
    return { ...p, duplicate };
  });
}

export const DUPLICATE_LABEL: Record<DuplicateReason, string> = {
  linkedin: "Already in your Network",
  email: "Already in your Network",
  name: "Already in your Network",
  "in-file": "Repeated in this file",
};

// ── Insert ─────────────────────────────────────────────────────────────────────────

/**
 * The rows to write: only the ids the user ticked, only ones that are not duplicates,
 * stamped with the signed-in user's id (the database also refuses any other owner_id).
 */
export function buildConnectionInserts(
  checked: readonly CheckedConnection[],
  selectedIds: ReadonlySet<string>,
  ownerId: string,
) {
  return checked
    .filter((p) => selectedIds.has(p.id) && !p.duplicate)
    .map((p) => ({
      owner_id: ownerId,
      first_name: p.first_name || null,
      last_name: p.last_name || null,
      company: p.company || null,
      title: p.title || null,
      email: p.email || null,
      linkedin_url: p.linkedin_url || null,
      status: "to_contact",
    }));
}
