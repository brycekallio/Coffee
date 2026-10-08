/**
 * Parses a pasted Granola note into attendees and a transcript.
 *
 * Granola has no public API, so this reads what a person copies out of the app.
 * That text has no guaranteed shape -- it varies by export route and changes
 * between versions -- so this deliberately does not try to parse a format. It
 * looks for the two things every variant contains: email addresses, and names
 * next to them.
 *
 * Tolerant on purpose: a parser that demands an exact layout breaks the first
 * time Granola ships a redesign, and the failure is silent -- a note that
 * matches nobody looks identical to a note about strangers.
 */

export interface GranolaAttendee {
  name: string | null;
  email: string;
}

export interface ParsedGranolaNote {
  title: string | null;
  date: string | null;
  attendees: GranolaAttendee[];
  transcript: string;
}

const EMAIL = /[\w.+-]+@[\w-]+\.[\w.-]+/g;

/** "Anna Steward from TIFIN <steward@tifin.com>" -> name beside the address. */
function nameFor(text: string, email: string): string | null {
  const at = text.indexOf(email);
  if (at === -1) return null;

  // Look back over the short run before the address, stopping at separators
  // that cannot be part of a name.
  const before = text.slice(Math.max(0, at - 80), at);
  const cleaned = before
    .replace(/[<(\[]\s*$/, "")
    .split(/[,;\n|]/).pop()!
    .replace(/\s+from\s+\S+\s*$/i, "")      // "Anna Steward from TIFIN"
    .replace(/\(note creator\)/i, "")
    .trim();

  // A name, not a sentence fragment: two or three capitalised words.
  const m = cleaned.match(/([A-Z][\w'’-]+(?:\s+[A-Z][\w'’-]+){0,2})\s*$/);
  return m ? m[1].trim() : null;
}

function findTitle(lines: string[]): string | null {
  for (const l of lines.slice(0, 6)) {
    const t = l.replace(/^#+\s*/, "").trim();
    if (t.length >= 3 && t.length <= 90 && !EMAIL.test(t) && /[A-Za-z]/.test(t)) return t;
  }
  return null;
}

/** Any unambiguous date in the first few lines. Ambiguous ones are left alone. */
function findDate(head: string): string | null {
  const iso = head.match(/\b(\d{4}-\d{2}-\d{2})\b/);
  if (iso) return iso[1];

  const named = head.match(
    /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+(\d{1,2}),?\s+(\d{4})\b/i,
  );
  if (named) {
    const month = "janfebmaraprmayjunjulaugsepoctnovdec".indexOf(named[1].slice(0, 3).toLowerCase()) / 3 + 1;
    return `${named[3]}-${String(month).padStart(2, "0")}-${named[2].padStart(2, "0")}`;
  }
  return null;
}

export function parseGranolaNote(raw: string): ParsedGranolaNote {
  const text = raw.replace(/\r\n/g, "\n").trim();
  const lines = text.split("\n");
  const head = lines.slice(0, 12).join("\n");

  const seen = new Map<string, GranolaAttendee>();
  for (const email of text.match(EMAIL) ?? []) {
    const key = email.toLowerCase();
    if (seen.has(key)) continue;
    seen.set(key, { email: key, name: nameFor(text, email) });
  }

  return {
    title: findTitle(lines),
    date: findDate(head),
    attendees: [...seen.values()],
    transcript: text,
  };
}

/**
 * Which attendees correspond to saved contacts.
 *
 * Email is the only reliable key: names are typed differently every time and two
 * people share one often enough that matching on a name would attach a private
 * conversation to the wrong person's record. Unmatched attendees are returned
 * rather than dropped, so the UI can offer to create them.
 */
export function matchAttendees<T extends { id: string; email: string | null; first_name?: string | null; last_name?: string | null }>(
  attendees: GranolaAttendee[],
  contacts: T[],
  selfEmails: string[] = [],
): { matched: { attendee: GranolaAttendee; contact: T }[]; unmatched: GranolaAttendee[] } {
  const byEmail = new Map<string, T>();
  for (const c of contacts) if (c.email) byEmail.set(c.email.toLowerCase(), c);

  const mine = new Set(selfEmails.map(e => e.toLowerCase()));
  const matched: { attendee: GranolaAttendee; contact: T }[] = [];
  const unmatched: GranolaAttendee[] = [];

  for (const a of attendees) {
    if (mine.has(a.email)) continue;          // the user is in their own notes
    const c = byEmail.get(a.email);
    if (c) matched.push({ attendee: a, contact: c });
    else unmatched.push(a);
  }
  return { matched, unmatched };
}
