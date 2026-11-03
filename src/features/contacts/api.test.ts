import { describe, expect, it, vi } from "vitest";
import { createDemoClient } from "@/demo/demoClient";

// The writable preview database stands in for Postgres; it pages with .range() like PostgREST.
const client = createDemoClient({ readOnly: false });
vi.mock("@/lib/supabase", () => ({ supabase: client }));
const api = await import("./api");

describe("listContactMatchKeys", () => {
  it("pages past one page, so a Network bigger than PostgREST's 1,000-row default is all checked", async () => {
    const before = (await api.listContactMatchKeys()).length;
    await api.createContacts(
      Array.from({ length: 25 }, (_, i) => ({ owner_id: "00000000-0000-4000-8000-000000000001", first_name: `P${i}`, last_name: "X" })),
    );
    const keys = await api.listContactMatchKeys(10);
    expect(keys.length).toBe(before + 25);
    expect(new Set(keys.map((k) => k.first_name)).size).toBe(keys.length);
  });
});
