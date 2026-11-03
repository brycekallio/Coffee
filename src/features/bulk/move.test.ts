import { describe, expect, it } from "vitest";
import type { Tables } from "@/lib/database.types";
import { contactToTarget, targetToContact } from "./move";

const contact: Tables<"contacts"> = {
  id: "c1",
  owner_id: "u1",
  first_name: "Priya",
  last_name: "Raman",
  company: "FTI Consulting",
  title: "Senior Consultant",
  email: "priya@fti.example",
  phone: "303-555-0100",
  linkedin_url: "https://www.linkedin.com/in/demo-priya",
  status: "to_contact",
  notes: "Met at the Leeds night.",
  last_touch_at: null,
  next_touch_at: "2026-12-01T00:00:00.000Z",
  created_at: "2026-10-01T00:00:00.000Z",
  updated_at: null,
  starred: true,
  tags: ["Consulting", "Case prep"],
};

describe("Network -> Watchlist mapping", () => {
  it("fills the Watchlist columns and keeps what has no column in the notes", () => {
    const t = contactToTarget(contact);
    expect(t).toMatchObject({
      owner_id: "u1",
      person_name: "Priya Raman",
      company: "FTI Consulting",
      role: "Senior Consultant",
      status: "not_contacted",
      next_action_date: "2026-12-01",
      starred: true,
      tags: ["Consulting", "Case prep"],
    });
    expect(t.notes).toContain("Email: priya@fti.example");
    expect(t.notes).toContain("Phone: 303-555-0100");
    expect(t.notes).toContain("LinkedIn: https://www.linkedin.com/in/demo-priya");
    expect(t.notes).toContain("Met at the Leeds night.");
  });

  it("copes with a contact that has almost nothing (company is NOT NULL on the Watchlist)", () => {
    const t = contactToTarget({ ...contact, first_name: null, last_name: null, company: null, email: null, phone: null, linkedin_url: null, notes: null, next_touch_at: null });
    expect(t.person_name).toBe("Unnamed");
    expect(t.company).toBe("");
    expect(t.notes).toBeNull();
    expect(t.next_action_date).toBeNull();
  });

  it("round trip: a person moved over and back comes home with the same details", () => {
    const target = { ...(contactToTarget(contact) as Tables<"watchlist_targets">), id: "t1", created_at: contact.created_at! };
    const back = targetToContact(target);
    expect(back).toMatchObject({
      first_name: "Priya",
      last_name: "Raman",
      company: "FTI Consulting",
      title: "Senior Consultant",
      email: "priya@fti.example",
      phone: "303-555-0100",
      linkedin_url: "https://www.linkedin.com/in/demo-priya",
      notes: "Met at the Leeds night.",
      starred: true,
      tags: ["Consulting", "Case prep"],
      next_touch_at: "2026-12-01T00:00:00.000Z",
    });
  });

  it("splits a Watchlist name into first and last", () => {
    const t = { owner_id: "u1", id: "t", person_name: "Mary Jane Watson", company: "", role: null, status: "contacted", next_action_date: null, notes: null, created_at: "x", starred: false, tags: [] };
    expect(targetToContact(t)).toMatchObject({ first_name: "Mary", last_name: "Jane Watson", company: null });
  });

  it("round trip keeps last contacted (no column on the Watchlist)", () => {
    const c = { ...contact, last_touch_at: "2026-10-01T15:30:00+00:00" };
    const t = contactToTarget(c);
    expect(t.notes).toContain("Last contacted: 2026-10-01T15:30:00+00:00");
    const back = targetToContact({ ...(t as Tables<"watchlist_targets">), id: "t1", created_at: "x" });
    expect(back.last_touch_at).toBe("2026-10-01T15:30:00+00:00");
    expect(back.notes).toBe("Met at the Leeds night.");
  });

  it("round trip keeps the Watchlist status (no column in the Network)", () => {
    const t = { owner_id: "u1", id: "t", person_name: "Ana Diaz", company: "Bain", role: null, status: "contacted", next_action_date: null, notes: "Coffee chat soon", created_at: "x", starred: false, tags: [] };
    const c = targetToContact(t);
    expect(c.notes).toBe("Watchlist status: contacted\nCoffee chat soon");
    const again = contactToTarget({ ...contact, ...(c as Tables<"contacts">), email: null, phone: null, linkedin_url: null, last_touch_at: null });
    expect(again.status).toBe("contacted");
    expect(again.notes).toBe("Coffee chat soon");
  });

  it("a default status adds no line", () => {
    const t = { owner_id: "u1", id: "t", person_name: "Ana", company: "", role: null, status: "not_contacted", next_action_date: null, notes: null, created_at: "x", starred: false, tags: [] };
    expect(targetToContact(t).notes).toBeNull();
  });
});
