import { describe, expect, it } from "vitest";
import { cleanEmail, cleanLinkedInUrl, cleanPhone } from "../../../supabase/functions/_shared/contactFields.ts";
import { inferFieldMap, parseCsv } from "@/lib/csvHelper";
import { buildContactInserts } from "./csvImport";

// The Settings CSV import and the LinkedIn/AI import must clean fields identically.
describe("CSV import uses the shared contact-field cleaners", () => {
  const messy = {
    Name: "Ada Lovelace",
    Email: "  Ada.Lovelace@Example.COM ",
    Phone: "(303) 555-0142",
    LinkedIn: "https://www.linkedin.com/in/ada-lovelace/?utm_source=share&trk=abc",
  };

  it("cleans a messy row exactly as contactFields does", () => {
    const csv = [
      "Name,Email,Phone,LinkedIn",
      `${messy.Name},${messy.Email},"${messy.Phone}","${messy.LinkedIn}"`,
    ].join("\n");
    const parsed = parseCsv(csv);
    const map = inferFieldMap(parsed.headers, parsed.rows);
    const [row] = buildContactInserts(parsed.rows, map, "owner-1");

    expect(row.email).toBe(cleanEmail(messy.Email));
    expect(row.phone).toBe(cleanPhone(messy.Phone));
    expect(row.linkedin_url).toBe(cleanLinkedInUrl(messy.LinkedIn));
    // and the cleaners really did something
    expect(row.email).toBe("Ada.Lovelace@Example.COM"); // trimmed; case is kept
    expect(row.linkedin_url).not.toMatch(/utm_|trk=|\/$/);
  });
});
