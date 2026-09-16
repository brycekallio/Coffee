import type { ParsedCsv, FieldMap } from "../types";

export type { ParsedCsv, FieldMap };

export function parseCsv(text: string): ParsedCsv {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];

    if (ch === '"' && inQuotes && next === '"') {
      cell += '"';
      i++;
      continue;
    }
    if (ch === '"') {
      inQuotes = !inQuotes;
      continue;
    }

    if (!inQuotes && (ch === "," || ch === "\n" || ch === "\r")) {
      if (ch === "\r" && next === "\n") continue;
      row.push(cell.trim());
      cell = "";

      if (ch === "\n" || ch === "\r") {
        const nonEmpty = row.some((c) => String(c ?? "").trim() !== "");
        if (nonEmpty) rows.push(row);
        row = [];
      }
      continue;
    }
    cell += ch;
  }

  row.push(cell.trim());
  if (row.some((c) => String(c ?? "").trim() !== "")) rows.push(row);

  if (rows.length === 0) return { headers: [], rows: [] };

  const first = rows[0];
  const firstJoined = first.join(" | ").toLowerCase();

  const looksLikeHeader =
    !firstJoined.includes("@") &&
    !/linkedin\.com\/(in|company|pub)\//.test(firstJoined) &&
    !/(\+?1[\s\-.]?)?\(?\d{3}\)?[\s\-.]?\d{3}[\s\-.]?\d{4}/.test(firstJoined) &&
    first.filter(Boolean).length >= Math.max(2, Math.floor(first.length * 0.5));

  const headers = looksLikeHeader
    ? first.map((h, idx) => (String(h ?? "").trim() ? String(h).trim() : `_${idx + 1}`))
    : first.map((_h, idx) => `_${idx + 1}`);

  const dataRows = looksLikeHeader ? rows.slice(1) : rows;

  const objRows: Record<string, string>[] = dataRows.map((r) => {
    const o: Record<string, string> = {};
    headers.forEach((h, idx) => {
      o[h] = String(r[idx] ?? "").trim();
    });
    return o;
  });

  return { headers, rows: objRows };
}

export function normHeader(h: string) {
  return String(h ?? "")
    .trim()
    .toLowerCase()
    .replaceAll(/[\s\-_]+/g, "_")
    .replaceAll(/[^\w]/g, "");
}

export function isEmail(v: any) {
  const s = String(v ?? "").trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

export function isPhone(v: any) {
  const s = String(v ?? "").trim();
  return /(\+?1[\s\-.]?)?\(?\d{3}\)?[\s\-.]?\d{3}[\s\-.]?\d{4}/.test(s);
}

export function isLinkedInUrl(v: any) {
  const s = String(v ?? "").trim().toLowerCase();
  return /linkedin\.com\/(in|company|pub)\//.test(s) || /^in\/[a-z0-9\-_%.]+/i.test(s);
}

export function cleanLinkedIn(v: any): string | null {
  let s = String(v ?? "").trim();
  if (!s) return null;
  if (/^in\//i.test(s)) s = `https://www.linkedin.com/${s}`;
  if (!/^https?:\/\//i.test(s) && s.toLowerCase().includes("linkedin.com/")) s = `https://${s}`;
  return isLinkedInUrl(s) ? s : null;
}

export function cleanPhone(v: any): string | null {
  const s = String(v ?? "").trim();
  if (!s) return null;
  return s.replaceAll(/\s+/g, " ");
}

export function looksLikeName(v: any) {
  const s = String(v ?? "").trim();
  if (!s) return false;
  if (isEmail(s) || isPhone(s) || isLinkedInUrl(s)) return false;
  const parts = s.split(/\s+/).filter(Boolean);
  if (parts.length < 2 || parts.length > 4) return false;
  if (s.length > 50) return false;
  const l = s.toLowerCase();
  if (/(llc|inc|corp|capital|partners|group|bank|university)/.test(l)) return false;
  return true;
}

export const TITLE_HINTS = [
  "analyst",
  "associate",
  "intern",
  "partner",
  "principal",
  "vp",
  "vice president",
  "director",
  "manager",
  "founder",
  "cofounder",
  "ceo",
  "cfo",
  "cio",
  "cto",
  "engineer",
  "consultant",
  "recruiter",
  "advisor",
  "student",
  "wealth",
  "private banker",
  "investment",
  "portfolio",
];

export function looksLikeTitle(v: any) {
  const s = String(v ?? "").trim();
  const l = s.toLowerCase();
  if (!s) return false;
  if (isEmail(s) || isPhone(s) || isLinkedInUrl(s)) return false;
  if (s.length > 80) return false;
  const words = s.split(/\s+/).filter(Boolean);
  const keyword = TITLE_HINTS.some((k) => l.includes(k));
  const plausibleWords = words.length >= 1 && words.length <= 6;
  return keyword || plausibleWords;
}

export const COMPANY_HINTS = [
  "capital",
  "partners",
  "group",
  "holdings",
  "management",
  "advisors",
  "bank",
  "llc",
  "inc",
  "corp",
  "ltd",
  "co",
  "company",
  "university",
];

export function looksLikeCompany(v: any) {
  const s = String(v ?? "").trim();
  const l = s.toLowerCase();
  if (!s) return false;
  if (isEmail(s) || isPhone(s) || isLinkedInUrl(s)) return false;
  if (looksLikeName(s)) return false;
  if (s.length > 90) return false;
  const words = s.split(/\s+/).filter(Boolean);
  const keyword = COMPANY_HINTS.some((k) => l.includes(k));
  return keyword || words.length >= 2;
}

export function inferByHeader(headers: string[], candidates: string[]) {
  const normalized = headers.map((h) => ({ raw: h, n: normHeader(h) }));
  for (const cand of candidates) {
    const c = normHeader(cand);
    const found = normalized.find((h) => h.n === c || h.n.includes(c) || c.includes(h.n));
    if (found) return found.raw;
  }
  return null;
}

export function inferByContent(headers: string[], rows: Record<string, string>[], predicate: (v: any) => boolean) {
  const scores: Record<string, number> = {};
  for (const h of headers) scores[h] = 0;

  const sample = rows.slice(0, Math.min(120, rows.length));
  for (const r of sample) {
    for (const h of headers) {
      if (predicate(r[h])) scores[h] += 1;
    }
  }

  let best: string | null = null;
  let bestScore = 0;
  for (const h of headers) {
    if (scores[h] > bestScore) {
      bestScore = scores[h];
      best = h;
    }
  }

  return bestScore >= Math.max(2, Math.floor(sample.length * 0.12)) ? best : null;
}

export function inferFieldMap(headers: string[], rows: Record<string, string>[]): FieldMap {
  const map: FieldMap = {};

  map.email = inferByHeader(headers, ["email", "email_address", "e_mail", "mail"]) ?? undefined;
  map.phone = inferByHeader(headers, ["phone", "phone_number", "mobile", "cell"]) ?? undefined;
  map.linkedin_url =
    inferByHeader(headers, ["linkedin", "linkedin_url", "linkedinprofile", "profile_url"]) ?? undefined;

  map.company = inferByHeader(headers, ["company", "employer", "organization", "org", "firm"]) ?? undefined;
  map.title = inferByHeader(headers, ["title", "job_title", "role", "position"]) ?? undefined;
  map.status = inferByHeader(headers, ["status", "stage"]) ?? undefined;

  map.first_name = inferByHeader(headers, ["first", "first_name", "fname"]) ?? undefined;
  map.last_name = inferByHeader(headers, ["last", "last_name", "lname"]) ?? undefined;
  map.full_name = inferByHeader(headers, ["name", "full_name", "contact"]) ?? undefined;

  if (!map.email) map.email = inferByContent(headers, rows, isEmail) ?? undefined;
  if (!map.phone) map.phone = inferByContent(headers, rows, isPhone) ?? undefined;
  if (!map.linkedin_url) map.linkedin_url = inferByContent(headers, rows, isLinkedInUrl) ?? undefined;

  if (!map.company) map.company = inferByContent(headers, rows, looksLikeCompany) ?? undefined;
  if (!map.title) map.title = inferByContent(headers, rows, looksLikeTitle) ?? undefined;

  if (!map.full_name && !map.first_name && !map.last_name) {
    map.full_name = inferByContent(headers, rows, looksLikeName) ?? undefined;
  }

  return map;
}

export function splitName(full: string) {
  const s = String(full ?? "").trim();
  if (!s) return { first: "", last: "" };
  const parts = s.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return { first: parts[0], last: "" };
  return { first: parts[0], last: parts.slice(1).join(" ") };
}
