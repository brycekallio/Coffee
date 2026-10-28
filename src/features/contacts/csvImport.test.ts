import { describe, expect, it } from "vitest";
import { buildContactInserts } from "./csvImport";

const map = {
  first_name: "First",
  last_name: "Last",
  email: "Email",
  phone: "Phone",
  linkedin_url: "LinkedIn",
  company: "Company",
  title: "Title",
};
const row = (o: Partial<Record<string, string>>) => ({
  First: "", Last: "", Email: "", Phone: "", LinkedIn: "", Company: "", Title: "", ...o,
}) as Record<string, string>;

describe("buildContactInserts", () => {
  it("maps a full row and stamps the owner", () => {
    const [c] = buildContactInserts(
      [row({ First: "Ada", Last: "Lovelace", Email: "ada@example.com", Company: " Engines ", Title: "Analyst", LinkedIn: "in/ada" })],
      map,
      "owner-1",
    );
    expect(c).toEqual({
      owner_id: "owner-1",
      first_name: "Ada",
      last_name: "Lovelace",
      company: "Engines",
      title: "Analyst",
      email: "ada@example.com",
      phone: null,
      linkedin_url: "https://www.linkedin.com/in/ada",
      status: "to_contact",
    });
  });

  it("splits a full-name column when there are no first/last columns", () => {
    const [c] = buildContactInserts([{ Name: "Ada King Lovelace", Email: "a@x.io" }], { full_name: "Name", email: "Email" }, "o");
    expect(c).toMatchObject({ first_name: "Ada", last_name: "King Lovelace" });
  });

  it("de-duplicates by email, case-insensitively", () => {
    const out = buildContactInserts(
      [row({ First: "Ada", Email: "ADA@example.com" }), row({ First: "Ada L", Email: "ada@example.com" })],
      map,
      "o",
    );
    expect(out).toHaveLength(1);
  });

  it("keeps distinct phone-only rows (they used to collapse into one)", () => {
    const out = buildContactInserts([row({ Phone: "303-555-0101" }), row({ Phone: "303-555-0102" })], map, "o");
    expect(out.map((c) => c.phone)).toEqual(["303-555-0101", "303-555-0102"]);
  });

  it("drops rows with nothing to identify them", () => {
    expect(buildContactInserts([row({ Title: "Analyst" })], map, "o")).toEqual([]);
  });

  it("blanks an invalid email rather than dropping a row that has a name", () => {
    const [c] = buildContactInserts([row({ First: "Ada", Email: "not-an-email" })], map, "o");
    expect(c).toMatchObject({ first_name: "Ada", email: null });
  });

  it("normalises a status column to snake_case", () => {
    const [c] = buildContactInserts([{ N: "Ada Lovelace", S: "Follow Up" }], { full_name: "N", status: "S" }, "o");
    expect(c.status).toBe("follow_up");
  });
});
