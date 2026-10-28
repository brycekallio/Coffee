import { cleanLinkedIn, cleanPhone, isEmail, splitName } from "@/lib/csvHelper";
import type { TablesInsert } from "@/lib/database.types";
import type { FieldMap } from "@/types";

/**
 * Turns parsed CSV rows into contact inserts using an inferred column map.
 *
 * Pure, so it is tested directly. Rows are de-duplicated within the file by email,
 * then LinkedIn URL, then phone digits, then name + company; a row with none of those
 * is dropped. (Phone used to be missing from that chain, so every phone-only row
 * shared the key "||" and all but the first were dropped as duplicates.)
 * Invalid emails and LinkedIn URLs are blanked rather than rejecting the row.
 */
export function buildContactInserts(
  rows: Record<string, string>[],
  map: FieldMap,
  ownerId: string,
): TablesInsert<"contacts">[] {
  const seen = new Set<string>();
  const inserts: TablesInsert<"contacts">[] = [];

  for (const r of rows) {
    const emailRaw = map.email ? r[map.email] : "";
    const phoneRaw = map.phone ? r[map.phone] : "";
    const liRaw = map.linkedin_url ? r[map.linkedin_url] : "";
    const companyRaw = map.company ? r[map.company] : "";
    const titleRaw = map.title ? r[map.title] : "";
    const statusRaw = map.status ? r[map.status] : "";

    let first = "";
    let last = "";
    if (map.first_name || map.last_name) {
      first = map.first_name ? r[map.first_name] : "";
      last = map.last_name ? r[map.last_name] : "";
    } else if (map.full_name) {
      ({ first, last } = splitName(r[map.full_name]));
    }

    const email = isEmail(emailRaw) ? emailRaw.trim() : "";
    const phone = cleanPhone(phoneRaw) ?? "";
    const linkedin = cleanLinkedIn(liRaw) ?? "";

    const nameKey = [first, last, companyRaw || ""].map((p) => p.trim().toLowerCase());
    const dedupeKey =
      email.toLowerCase() ||
      linkedin.toLowerCase() ||
      phone.replace(/\D/g, "") ||
      (nameKey.some(Boolean) ? nameKey.join("|") : "");
    if (!dedupeKey) continue;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    const sr = String(statusRaw ?? "").trim().toLowerCase().replaceAll(" ", "_");

    inserts.push({
      owner_id: ownerId,
      first_name: first || null,
      last_name: last || null,
      company: companyRaw?.trim() || null,
      title: titleRaw?.trim() || null,
      email: email || null,
      phone: phone || null,
      linkedin_url: linkedin || null,
      status: sr || "to_contact",
    });
  }

  return inserts;
}
