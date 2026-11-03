import { describe, expect, it } from "vitest";
import {
  buildConnectionInserts,
  ConnectionsFileError,
  MAX_FILE_BYTES,
  MAX_ROWS,
  markDuplicates,
  parseConnectionsCsv,
  readCsvRows,
} from "./linkedinConnections";

// The shape LinkedIn really exports: a "Notes:" preamble with a quoted paragraph, a blank
// line, then the header row.
const PREAMBLE = `Notes:
"When exporting your connection data, you may notice that some of the email addresses are missing. You will only see email addresses for connections who have allowed their connections to see or download their email address using this setting. https://www.linkedin.com/psettings/privacy/email-visibility. Learn more"

`;
const HEADER = "First Name,Last Name,URL,Email Address,Company,Position,Connected On\n";
const file = (...lines: string[]) => PREAMBLE + HEADER + lines.join("\n") + "\n";

describe("parseConnectionsCsv: LinkedIn's real format", () => {
  it("skips the notes preamble and reads every column", () => {
    const out = parseConnectionsCsv(
      file(
        "Ada,Lovelace,https://www.linkedin.com/in/ada-lovelace,ada@example.com,Analytical Engines,Analyst,05 Mar 2024",
        'Grace,Hopper,https://www.linkedin.com/in/grace-hopper,,"Navy, US",Rear Admiral,01 Jan 2023',
      ),
    );
    expect(out.people).toHaveLength(2);
    expect(out.people[0]).toMatchObject({
      first_name: "Ada",
      last_name: "Lovelace",
      linkedin_url: "https://www.linkedin.com/in/ada-lovelace",
      email: "ada@example.com",
      company: "Analytical Engines",
      title: "Analyst",
      connected_on: "05 Mar 2024",
    });
    expect(out.people[1].company).toBe("Navy, US"); // comma inside quotes
    expect(out.people[1].email).toBe("");
  });

  it("works without the preamble, with CRLF line endings and a BOM", () => {
    const text = String.fromCharCode(0xfeff) + (HEADER + "Ada,Lovelace,,,,,\n").replace(/\n/g, "\r\n");
    expect(parseConnectionsCsv(text).people).toHaveLength(1);
  });

  it("handles quoted cells that contain quotes and line breaks", () => {
    const out = parseConnectionsCsv(file('Ada,Lovelace,,,"Acme ""Labs""\nWest",Analyst,'));
    expect(out.people[0].company).toBe('Acme "Labs" West');
  });

  it("tolerates missing optional columns", () => {
    const out = parseConnectionsCsv("First Name,Last Name,Company\nAda,Lovelace,Engines\n");
    expect(out.people[0]).toMatchObject({ first_name: "Ada", company: "Engines", email: "", linkedin_url: "" });
  });

  it("rejects a file that isn't a connections export", () => {
    expect(() => parseConnectionsCsv("Name,Phone\nAda,555\n")).toThrow(ConnectionsFileError);
    expect(() => parseConnectionsCsv("")).toThrow(ConnectionsFileError);
  });

  it("counts rows with no name instead of importing them", () => {
    const out = parseConnectionsCsv(file(",,https://www.linkedin.com/in/ghost,,Co,Role,", "Ada,Lovelace,,,,,"));
    expect(out.people).toHaveLength(1);
    expect(out.skippedNoName).toBe(1);
  });
});

describe("parseConnectionsCsv: hostile input", () => {
  it("refuses a file over the size cap", () => {
    expect(() => parseConnectionsCsv("x".repeat(MAX_FILE_BYTES + 1))).toThrow(/5 MB/);
  });

  it("stops at the row cap and says so", () => {
    const many = Array.from({ length: MAX_ROWS + 50 }, (_, i) => `P${i},Q${i},,,,,`);
    const out = parseConnectionsCsv(file(...many));
    expect(out.people).toHaveLength(MAX_ROWS);
    expect(out.truncated).toBe(true);
  });

  it("is not truncated at exactly the cap", () => {
    const many = Array.from({ length: MAX_ROWS }, (_, i) => `P${i},Q${i},,,,,`);
    const out = parseConnectionsCsv(file(...many));
    expect(out.people).toHaveLength(MAX_ROWS);
    expect(out.truncated).toBe(false);
  });

  it("strips leading formula characters so a re-export can't run them", () => {
    const out = parseConnectionsCsv(
      file(
        '"=HYPERLINK(""http://evil.example"",""click"")",+SUM(1),,,@cmd|\' /C calc\'!A0,-2+3,',
        "\t=1+1,\r=2,,,,,",
      ),
    );
    for (const p of out.people) {
      for (const v of [p.first_name, p.last_name, p.company, p.title]) expect(v).not.toMatch(/^[=+\-@\t\r]/);
    }
    expect(out.people[0].first_name).toBe('HYPERLINK("http://evil.example","click")');
    expect(out.people[0].last_name).toBe("SUM(1)");
  });

  it("removes HTML and script markup", () => {
    const out = parseConnectionsCsv(file('<img src=x onerror=alert(1)>Ada,<script>alert(1)</script>Lovelace,,,"<b>Acme</b> >< Co",Analyst,'));
    const p = out.people[0];
    expect(p.first_name).toBe("Ada");
    expect(p.last_name).toBe("alert(1) Lovelace"); // tags removed, their text kept as plain text
    expect(JSON.stringify(p)).not.toMatch(/[<>]/);
  });

  it("drops control and bidi characters and caps field length", () => {
    const [nul, rlo, zwsp] = [0, 0x202e, 0x200b].map((c) => String.fromCharCode(c));
    const out = parseConnectionsCsv(file(`Ada${nul}${rlo},Love${zwsp}lace,,,${"x".repeat(5000)},Analyst,`));
    const p = out.people[0];
    expect(p.first_name).toBe("Ada");
    expect(p.last_name).toBe("Love lace");
    expect(p.company.length).toBeLessThanOrEqual(120);
  });

  it("keeps only real LinkedIn /in/ URLs", () => {
    const urls = [
      "javascript:alert(1)//linkedin.com/in/x",
      "https://linkedin.com.evil.example/in/ada",
      "https://evil.example/?u=linkedin.com/in/ada",
      "https://www.linkedin.com/company/acme",
      "https://user:pw@www.linkedin.com/in/ada",
      "data:text/html,<script>1</script>",
    ];
    for (const u of urls) {
      const out = parseConnectionsCsv(file(`Ada,Lovelace,"${u}",,,,`));
      expect(out.people[0].linkedin_url, u).toBe("");
    }
    const ok = parseConnectionsCsv(file("Ada,Lovelace,HTTPS://www.linkedin.com/in/Ada-L/?trk=x#frag,,,,"));
    expect(ok.people[0].linkedin_url).toBe("https://www.linkedin.com/in/Ada-L");
  });

  it("drops malformed emails", () => {
    const out = parseConnectionsCsv(file('Ada,Lovelace,,"a@b.c, d@e.fg",,,', "Bob,Ray,,=cmd@x.com,,,", "Cy,Lee,,cy@example.org,,,"));
    expect(out.people.map((p) => p.email)).toEqual(["", "", "cy@example.org"]);
  });
});

describe("readCsvRows", () => {
  it("treats a quote in the middle of a cell as text", () => {
    expect(readCsvRows('a,5" tall,c\n', 10).rows).toEqual([["a", '5" tall', "c"]]);
  });
  it("survives an unterminated quote without hanging", () => {
    const { rows } = readCsvRows('a,"b,c\nd,e\n', 10);
    expect(rows).toHaveLength(1);
  });
});

describe("markDuplicates", () => {
  const people = parseConnectionsCsv(
    file(
      "Ada,Lovelace,https://www.linkedin.com/in/ada,,Engines,Analyst,",
      "Grace,Hopper,,grace@navy.mil,Navy,Admiral,",
      "Alan,Turing,,,Bletchley,Cryptanalyst,",
      "New,Person,https://www.linkedin.com/in/new-person,,Co,Role,",
      "Ada,Again,https://www.linkedin.com/in/ADA/,,Other,Role,",
      "New,Person,,,Co,Role,",
    ),
  ).people;

  const existing = [
    { first_name: "Ada", last_name: "L", company: null, email: null, linkedin_url: "linkedin.com/in/ada/" },
    { first_name: "G", last_name: "H", company: null, email: "GRACE@navy.mil", linkedin_url: null },
    { first_name: "alan", last_name: "TURING", company: "bletchley", email: null, linkedin_url: null },
  ];

  it("flags matches on LinkedIn slug, email, and name + company, case-insensitively", () => {
    const out = markDuplicates(people, existing);
    expect(out.map((p) => p.duplicate)).toEqual(["linkedin", "email", "name", null, "linkedin", "in-file"]);
  });

  it("flags a repeat inside the file", () => {
    const out = markDuplicates(people, []);
    expect(out[4].duplicate).toBe("in-file"); // same slug as row 0, different case
    expect(out[5].duplicate).toBe("in-file"); // same name + company as row 3
    expect(out[0].duplicate).toBeNull();
  });

  it("does not match on a common name alone", () => {
    const out = markDuplicates(people.slice(2, 3), [{ first_name: "Alan", last_name: "Turing", company: "Elsewhere", email: null, linkedin_url: null }]);
    expect(out[0].duplicate).toBeNull();
  });
});

describe("buildConnectionInserts", () => {
  const checked = markDuplicates(
    parseConnectionsCsv(file("Ada,Lovelace,https://www.linkedin.com/in/ada,,Engines,Analyst,", "Grace,Hopper,,,Navy,Admiral,", "Dup,Licate,https://www.linkedin.com/in/dup,,Co,Role,")).people,
    [{ first_name: null, last_name: null, company: null, email: null, linkedin_url: "https://www.linkedin.com/in/dup" }],
  );

  it("writes only ticked, non-duplicate rows, all stamped with the owner", () => {
    const out = buildConnectionInserts(checked, new Set(["0", "2"]), "owner-1");
    expect(out).toHaveLength(1); // row 2 is a duplicate even though it was ticked
    expect(out[0]).toEqual({
      owner_id: "owner-1",
      first_name: "Ada",
      last_name: "Lovelace",
      company: "Engines",
      title: "Analyst",
      email: null,
      linkedin_url: "https://www.linkedin.com/in/ada",
      status: "to_contact",
    });
  });

  it("ignores ids that aren't in the file", () => {
    expect(buildConnectionInserts(checked, new Set(["999", "__proto__"]), "owner-1")).toEqual([]);
  });

  it("contains no key a forged row could use to change the owner", () => {
    const out = buildConnectionInserts(checked, new Set(["0", "1"]), "owner-1");
    expect(new Set(out.map((r) => r.owner_id))).toEqual(new Set(["owner-1"]));
  });
});

describe("review fixes (2026-11-02)", () => {
  it("caps columns per row, so a row of commas can't grow without bound", () => {
    const { rows } = readCsvRows("a" + ",x".repeat(10_000) + "\n", 10);
    expect(rows[0].length).toBe(50);
  });
  it("matches an existing contact whose name/company has extra spaces", () => {
    const people = parseConnectionsCsv("First Name,Last Name,URL,Email Address,Company,Position,Connected On\nAda,Lovelace,,,Goldman Sachs,Analyst,05 Mar 2024\n").people;
    const out = markDuplicates(people, [{ first_name: " Ada", last_name: "Lovelace", company: "Goldman  Sachs", email: null, linkedin_url: null }]);
    expect(out[0].duplicate).toBe("name");
  });
});
