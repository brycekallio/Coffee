/**
 * Cleaning for contact fields that come from somewhere we don't control: a LinkedIn
 * connections file, or a model reading pasted profile text.
 *
 * Pure TypeScript with no imports, so the Edge Function (Deno) and the browser app can
 * both use the same file. Everything here is about making an untrusted string safe to
 * store and show:
 *   - control, zero-width and bidi-override characters are dropped (they hide text or
 *     reorder it on screen);
 *   - HTML tags and angle brackets are dropped (React escapes on display, but this data
 *     is also copied into emails and other tools);
 *   - a leading = + - @ is dropped, so a name can never become a spreadsheet formula if it
 *     is exported to CSV or pasted into Sheets later;
 *   - every field has a length cap.
 */

export const FIELD_LIMITS = {
  name: 80,
  company: 120,
  title: 160,
  email: 254,
  phone: 30,
  linkedin: 200,
} as const;

// C0/C1 controls, zero-width chars, bidi embeddings/overrides/isolates, BOM, line/paragraph separators.

const INVISIBLE = new RegExp(
  "[" +
    [[0, 0x1f], [0x7f, 0x9f], [0x200b, 0x200f], [0x2028, 0x202e], [0x2060, 0x2069], [0xfeff, 0xfeff]]
      .map(([a, b]) => String.fromCharCode(a) + "-" + String.fromCharCode(b))
      .join("") +
    "]",
  "g",
);
const HTML_TAG = /<[^>]*>/g;
/** Characters a spreadsheet reads as the start of a formula (plus tab/CR, which hide one). */
const FORMULA_LEAD = /^[\s=+\-@]+/;

/** A single-line plain-text field, capped at `max` characters. */
export function cleanText(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  let s = value.replace(INVISIBLE, " ").replace(HTML_TAG, " ").replace(/[<>]/g, "");
  s = s.replace(/\s+/g, " ").replace(FORMULA_LEAD, "").trim();
  if (s.length > max) s = s.slice(0, max).trim();
  return s;
}

export function cleanEmail(value: unknown): string {
  if (typeof value !== "string") return "";
  const s = value.replace(INVISIBLE, "").trim();
  if (s.length === 0 || s.length > FIELD_LIMITS.email) return "";
  // One address, no quotes/brackets/commas, and not something a spreadsheet would run.
  if (!/^[A-Za-z0-9][^\s@<>"',;:()[\]\\]*@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(s)) return "";
  return s;
}

export function cleanPhone(value: unknown): string {
  if (typeof value !== "string") return "";
  const s = value.replace(INVISIBLE, "").replace(/\s+/g, " ").trim();
  if (s.length === 0 || s.length > FIELD_LIMITS.phone) return "";
  // Digits and the usual separators only; a leading + is a country code, not a formula.
  if (!/^\+?[\d ().-]+$/.test(s) || s.replace(/\D/g, "").length < 7) return "";
  return s;
}

/**
 * A LinkedIn profile URL, or "". Strict on purpose: https only, linkedin.com or one of its
 * subdomains, a /in/<slug> path. The result is rebuilt from the slug, so any query string,
 * fragment, credentials or odd port in the input are gone. "javascript:…linkedin.com/in/x"
 * and "linkedin.com.evil.com/in/x" are both refused.
 */
export function cleanLinkedInUrl(value: unknown): string {
  if (typeof value !== "string") return "";
  let s = value.replace(INVISIBLE, "").trim();
  if (s.length === 0 || s.length > FIELD_LIMITS.linkedin) return "";
  if (/^(www\.)?linkedin\.com\//i.test(s)) s = `https://${s}`;
  else if (/^in\//i.test(s)) s = `https://www.linkedin.com/${s}`;
  let url: URL;
  try {
    url = new URL(s);
  } catch {
    return "";
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return "";
  if (url.username || url.password || (url.port && url.port !== "443" && url.port !== "80")) return "";
  const host = url.hostname.toLowerCase();
  if (host !== "linkedin.com" && !host.endsWith(".linkedin.com")) return "";
  const m = url.pathname.match(/^\/in\/([^/]+)\/?/i);
  if (!m) return "";
  let slug: string;
  try {
    slug = decodeURIComponent(m[1]);
  } catch {
    return "";
  }
  if (!/^[\p{L}\p{N}_.%-]{1,100}$/u.test(slug)) return "";
  return `https://www.linkedin.com/in/${encodeURIComponent(slug)}`;
}

/** Lower-cased slug of a cleaned LinkedIn URL, for duplicate matching. "" if it is not one. */
export function linkedInKey(value: unknown): string {
  const url = cleanLinkedInUrl(value);
  if (!url) return "";
  return decodeURIComponent(url.slice("https://www.linkedin.com/in/".length)).toLowerCase();
}

export interface ContactFields {
  first_name: string;
  last_name: string;
  company: string;
  title: string;
  email: string;
  phone: string;
  linkedin_url: string;
}

export const EMPTY_FIELDS: ContactFields = {
  first_name: "",
  last_name: "",
  company: "",
  title: "",
  email: "",
  phone: "",
  linkedin_url: "",
};

/** Cleans a whole record; anything missing, mistyped or unsafe comes back as "". */
export function cleanContactFields(raw: unknown): ContactFields {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return {
    first_name: cleanText(o.first_name, FIELD_LIMITS.name),
    last_name: cleanText(o.last_name, FIELD_LIMITS.name),
    company: cleanText(o.company, FIELD_LIMITS.company),
    title: cleanText(o.title, FIELD_LIMITS.title),
    email: cleanEmail(o.email),
    phone: cleanPhone(o.phone),
    linkedin_url: cleanLinkedInUrl(o.linkedin_url),
  };
}

/**
 * Fields a model returned for some pasted text, kept only if they are safe AND actually
 * present in that text. A model can invent an email or a profile link that looks right;
 * email, phone and URL are facts the page either printed or didn't, so they must appear
 * (digits-only for phones, slug for LinkedIn) in what the user pasted.
 */
export function groundContactFields(raw: unknown, sourceText: string): ContactFields {
  const f = cleanContactFields(raw);
  const lower = sourceText.toLowerCase();
  if (f.email && !lower.includes(f.email.toLowerCase())) f.email = "";
  if (f.phone) {
    const digits = f.phone.replace(/\D/g, "");
    if (!sourceText.replace(/\D/g, "").includes(digits)) f.phone = "";
  }
  if (f.linkedin_url) {
    const slug = linkedInKey(f.linkedin_url);
    if (!slug || !lower.includes(`linkedin.com/in/${slug}`) && !lower.includes(`linkedin.com/in/${encodeURIComponent(slug).toLowerCase()}`)) {
      f.linkedin_url = "";
    }
  }
  return f;
}

/** True when nothing useful came back. */
export function isEmptyFields(f: ContactFields): boolean {
  return !(f.first_name || f.last_name || f.company || f.title || f.email || f.phone || f.linkedin_url);
}

/**
 * What can be read straight off pasted text with no AI: a LinkedIn profile link and an
 * email address. Used when the AI is unavailable (daily limit reached, provider down), so
 * the paste box still saves some typing.
 */
export function extractObvious(text: string): Partial<ContactFields> {
  const out: Partial<ContactFields> = {};
  const link = text.match(/(?:https?:\/\/)?(?:[a-z]{2,3}\.)?linkedin\.com\/in\/[^\s)"'<>,]+/i)?.[0];
  const li = link ? cleanLinkedInUrl(link) : "";
  if (li) out.linkedin_url = li;
  const mail = text.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/)?.[0];
  const em = mail ? cleanEmail(mail) : "";
  if (em) out.email = em;
  return out;
}
