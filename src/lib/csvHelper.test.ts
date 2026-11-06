import { describe, expect, it } from "vitest";
import {
  inferByHeader,
  inferFieldMap,
  isEmail,
  isLinkedInUrl,
  isPhone,
  looksLikeCompany,
  looksLikeName,
  normHeader,
  parseCsv,
  splitName,
} from "./csvHelper";

describe("parseCsv", () => {
  it("reads a header row and keys each row by it", () => {
    const { headers, rows } = parseCsv("Name,Email\nAda Lovelace,ada@example.com\n");
    expect(headers).toEqual(["Name", "Email"]);
    expect(rows).toEqual([{ Name: "Ada Lovelace", Email: "ada@example.com" }]);
  });

  it("handles quoted commas, escaped quotes, and CRLF", () => {
    const { rows } = parseCsv('Name,Note\r\n"Lovelace, Ada","said ""hi"""\r\n');
    expect(rows).toEqual([{ Name: "Lovelace, Ada", Note: 'said "hi"' }]);
  });

  it("skips blank lines", () => {
    const { rows } = parseCsv("Name,Email\n\n,\nAda Lovelace,ada@example.com");
    expect(rows).toHaveLength(1);
  });

  it("treats a first row of data as data, not headers", () => {
    const { headers, rows } = parseCsv("Ada Lovelace,ada@example.com\nAlan Turing,alan@example.com");
    expect(headers).toEqual(["_1", "_2"]);
    expect(rows).toHaveLength(2);
  });

  it("returns nothing for empty input", () => {
    expect(parseCsv("")).toEqual({ headers: [], rows: [] });
  });
});

describe("field predicates", () => {
  it("recognises emails", () => {
    expect(isEmail(" Ada@Example.com ")).toBe(true);
    expect(isEmail("ada@example")).toBe(false);
  });

  it("recognises US phone formats", () => {
    expect(isPhone("(303) 555-0142")).toBe(true);
    expect(isPhone("+1 303.555.0142")).toBe(true);
    expect(isPhone("12345")).toBe(false);
  });

  it("recognises LinkedIn profile URLs, including the bare in/ form", () => {
    expect(isLinkedInUrl("https://www.linkedin.com/in/ada")).toBe(true);
    expect(isLinkedInUrl("in/ada-lovelace")).toBe(true);
    expect(isLinkedInUrl("https://linkedin.com/feed")).toBe(false);
  });

  it("tells names from companies", () => {
    expect(looksLikeName("Ada Lovelace")).toBe(true);
    expect(looksLikeName("Blackstone Capital")).toBe(false);
    expect(looksLikeName("ada@example.com")).toBe(false);
    expect(looksLikeCompany("Blackstone Capital Partners")).toBe(true);
    expect(looksLikeCompany("Ada Lovelace")).toBe(false);
  });
});

describe("normHeader", () => {
  it("lowercases and snake-cases", () => {
    expect(normHeader(" First Name ")).toBe("first_name");
    expect(normHeader("E-mail Address")).toBe("e_mail_address");
  });
});

describe("splitName", () => {
  it("splits first from the rest", () => {
    expect(splitName("Ada King Lovelace")).toEqual({ first: "Ada", last: "King Lovelace" });
    expect(splitName("Cher")).toEqual({ first: "Cher", last: "" });
    expect(splitName("")).toEqual({ first: "", last: "" });
  });
});

describe("inferFieldMap", () => {
  it("maps a LinkedIn Connections export by its headers", () => {
    const csv = parseCsv(
      [
        "First Name,Last Name,URL,Email Address,Company,Position,Connected On",
        "Ada,Lovelace,https://www.linkedin.com/in/ada,ada@example.com,Analytical Engines,Analyst,01 Jan 2026",
      ].join("\n"),
    );
    const map = inferFieldMap(csv.headers, csv.rows);
    expect(map.first_name).toBe("First Name");
    expect(map.last_name).toBe("Last Name");
    expect(map.email).toBe("Email Address");
    expect(map.company).toBe("Company");
    expect(map.title).toBe("Position");
  });

  it("falls back to content when headers are uninformative", () => {
    const rows = Array.from({ length: 5 }, (_, i) => ({
      A: `Person ${i} Example`,
      B: `p${i}@example.com`,
      C: `https://linkedin.com/in/p${i}`,
    }));
    const map = inferFieldMap(["A", "B", "C"], rows);
    expect(map.email).toBe("B");
    expect(map.linkedin_url).toBe("C");
  });
});

describe("inferByHeader", () => {
  it("still matches a header the candidate contains, like mail → email", () => {
    expect(inferByHeader(["Mail", "Who"], ["email"])).toBe("Mail");
  });
  it("does not match a one-letter header just because the candidate contains it", () => {
    expect(inferByHeader(["A", "B"], ["email"])).toBeNull();
  });
  it("does not match a header that normalises to nothing", () => {
    expect(inferByHeader(["#", "Email"], ["email"])).toBe("Email");
  });
});

describe("detectors agree with the shared cleaners", () => {
  it("isPhone / isLinkedInUrl accept exactly what the import would keep", async () => {
    const { isPhone, isLinkedInUrl } = await import("./csvHelper");
    expect(isPhone("(303) 555-0123")).toBe(true);
    expect(isPhone("call me at 303-555-0123 maybe")).toBe(false);
    expect(isLinkedInUrl("https://www.linkedin.com/in/jane-doe")).toBe(true);
    expect(isLinkedInUrl("linkedin.com.evil.com/in/x")).toBe(false);
    expect(isLinkedInUrl("https://www.linkedin.com/company/acme")).toBe(false);
  });
});

// Review 2026-11-06 (break-it): cleanPhone accepts any 7+ digit run of digits and
// separators, so as a *detector* it now claims ISO date and numeric-ID columns as phone.
// The old US-pattern regex did not. Expected to FAIL until isPhone is tightened.
describe("review: phone detector must not claim date / id columns", () => {
  it("an ISO date column is not inferred as phone", async () => {
    const { isPhone, inferFieldMap } = await import("./csvHelper");
    expect(isPhone("2024-01-15")).toBe(false);
    const rows = [
      { "Full Name": "Jane Doe", Met: "2024-01-15" },
      { "Full Name": "John Roe", Met: "2024-02-03" },
      { "Full Name": "Ann Poe", Met: "2024-03-09" },
    ];
    expect(inferFieldMap(["Full Name", "Met"], rows).phone).toBeUndefined();
  });
});
