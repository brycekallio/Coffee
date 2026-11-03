import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Bulk writes must not be able to touch another user's rows.
 *
 * Two layers, both tested here:
 *  1. WIRE: every bulk request (delete / star / tag / move) carries `owner_id=eq.<me>` as well
 *     as the id list, using the real supabase-js client with only `fetch` stubbed. So even if
 *     RLS were misconfigured, a forged id matches nothing.
 *  2. BEHAVIOUR: against an in-memory database holding two users' rows, asking to delete /
 *     star / tag / move the OTHER user's ids changes nothing of theirs.
 * RLS itself (the third layer) is checked against real Postgres in docs/rls_bulk_check.sql.
 */

const URL_ = "https://example-project.supabase.co";
const ME = "11111111-1111-4111-8111-111111111111";
const THEM = "22222222-2222-4222-8222-222222222222";

// ── 1. wire level ───────────────────────────────────────────────────────────────
type Call = { url: URL; method: string };
let calls: Call[];

const fetchStub = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = new URL(input instanceof Request ? input.url : String(input));
  calls.push({ url, method: (init?.method ?? "GET").toUpperCase() });
  // Reads return one contact so the move path has something to copy; writes return [].
  const body = init?.method === undefined || init.method === "GET" ? (url.pathname.endsWith("/contacts") ? [{ id: "c1", owner_id: ME, first_name: "A", last_name: null, company: null, title: null, email: null, phone: null, linkedin_url: null, status: "to_contact", notes: null, last_touch_at: null, next_touch_at: null, created_at: null, updated_at: null, starred: false, tags: [] }] : []) : [{ id: "new1" }];
  return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
});

async function realApi() {
  vi.stubEnv("VITE_SUPABASE_URL", URL_);
  vi.stubEnv("VITE_SUPABASE_ANON_KEY", "anon");
  vi.stubGlobal("fetch", fetchStub);
  vi.stubGlobal("window", {
    location: { pathname: "/", protocol: "https:", origin: "https://coffee.test" },
    Clerk: { session: { getToken: async () => "jwt" } },
  });
  vi.resetModules();
  return {
    contacts: await import("@/features/contacts/api"),
    watchlist: await import("@/features/watchlist/api"),
    move: await import("./moveApi"),
  };
}

beforeEach(() => {
  calls = [];
  fetchStub.mockClear();
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

const ids = ["a", "b", "c"];

describe("every bulk request names the signed-in user", () => {
  it("contacts: delete, star, tag", async () => {
    const { contacts } = await realApi();
    await contacts.deleteContacts(ME, ids);
    await contacts.setContactsStarred(ME, ids, true);
    await contacts.setContactsTags(ME, { tags: ["x"], ids });

    expect(calls.map((c) => c.method)).toEqual(["DELETE", "PATCH", "PATCH"]);
    for (const c of calls) {
      expect(c.url.searchParams.get("owner_id")).toBe(`eq.${ME}`);
      expect(c.url.searchParams.get("id")).toBe("in.(a,b,c)");
    }
  });

  it("watchlist: delete, star, tag", async () => {
    const { watchlist } = await realApi();
    await watchlist.deleteTargets(ME, ids);
    await watchlist.setTargetsStarred(ME, ids, false);
    await watchlist.setTargetsTags(ME, { tags: [], ids });

    expect(calls.map((c) => c.method)).toEqual(["DELETE", "PATCH", "PATCH"]);
    for (const c of calls) {
      expect(c.url.pathname).toBe("/rest/v1/watchlist_targets");
      expect(c.url.searchParams.get("owner_id")).toBe(`eq.${ME}`);
      expect(c.url.searchParams.get("id")).toBe("in.(a,b,c)");
    }
  });

  it("long selections are sent in pieces, and every piece is scoped", async () => {
    const { contacts } = await realApi();
    const many = Array.from({ length: 250 }, (_, i) => `id${i}`);
    await contacts.deleteContacts(ME, many);
    expect(calls).toHaveLength(3);
    for (const c of calls) expect(c.url.searchParams.get("owner_id")).toBe(`eq.${ME}`);
    expect(calls.flatMap((c) => c.url.searchParams.get("id")!.slice(4, -1).split(","))).toEqual(many);
  });

  it("move: every read, copy and delete is scoped to the user", async () => {
    const { move } = await realApi();
    await move.moveContactsToWatchlist(ME, ["c1"]);
    const writes = calls.filter((c) => c.method !== "GET");
    expect(writes.map((c) => c.method)).toEqual(["POST", "DELETE"]);
    for (const c of calls.filter((c) => c.method !== "POST")) {
      expect(c.url.searchParams.get("owner_id")).toBe(`eq.${ME}`);
    }
    const tables = calls.map((c) => c.url.pathname.split("/").pop());
    // Every table with a foreign key to contacts is checked, or a move would cascade-delete it.
    for (const t of ["contact_meetings", "meeting_notes", "applications", "scheduled_outreach"]) expect(tables).toContain(t);
  });
});

// ── 2. behaviour against two users' data ────────────────────────────────────────
describe("a forged id list cannot reach another user's rows", () => {
  async function seeded() {
    vi.resetModules();
    vi.doMock("@/lib/supabase", async () => {
      const { createDemoClient } = await import("@/demo/demoClient");
      return { supabase: createDemoClient({ readOnly: false }) };
    });
    const { supabase } = await import("@/lib/supabase");
    // Three people for each of two users, none with meetings/applications/outreach.
    const person = (owner: string, n: number) => ({ owner_id: owner, first_name: `P${n}`, last_name: null, status: "to_contact", starred: false, tags: [] as string[] });
    const insert = async (owner: string) => {
      const { data, error } = await supabase.from("contacts").insert([1, 2, 3].map((n) => person(owner, n))).select("id, owner_id");
      expect(error).toBeNull();
      return data as unknown as { id: string; owner_id: string }[];
    };
    const mine = await insert(ME);
    const theirs = await insert(THEM);
    expect(mine).toHaveLength(3);
    expect(theirs).toHaveLength(3);
    const rows = [...mine, ...theirs];
    return { supabase, mine, theirs, rows };
  }
  afterEach(() => vi.doUnmock("@/lib/supabase"));

  const mineId = (rows: { owner_id: string }[]) => rows[0].owner_id;

  it("delete", async () => {
    const { supabase, mine, theirs } = await seeded();
    const api = await import("@/features/contacts/api");
    await api.deleteContacts(mineId(mine), [...mine.map((r) => r.id), ...theirs.map((r) => r.id)]);
    const { data } = await supabase.from("contacts").select("id");
    const left = (data as { id: string }[]).map((r) => r.id);
    for (const t of theirs) expect(left).toContain(t.id);
    for (const m of mine) expect(left).not.toContain(m.id);
  });

  it("star and tag", async () => {
    const { supabase, mine, theirs } = await seeded();
    const api = await import("@/features/contacts/api");
    const all = [...mine, ...theirs].map((r) => r.id);
    await api.setContactsStarred(mineId(mine), all, true);
    await api.setContactsTags(mineId(mine), { tags: ["sneaky"], ids: all });
    const { data } = await supabase.from("contacts").select("id, owner_id, starred, tags").in("id", theirs.map((t) => t.id));
    for (const r of data as { starred: boolean; tags: string[] }[]) {
      expect(r.starred).toBe(false);
      expect(r.tags).not.toContain("sneaky");
    }
    const { data: mine2 } = await supabase.from("contacts").select("starred, tags").in("id", mine.map((m) => m.id));
    for (const r of mine2 as { starred: boolean; tags: string[] }[]) expect(r).toMatchObject({ starred: true, tags: ["sneaky"] });
  });

  it("move leaves the other user's contacts where they are", async () => {
    const { supabase, mine, theirs } = await seeded();
    const { moveContactsToWatchlist } = await import("./moveApi");
    const free = [...mine, ...theirs];
    const result = await moveContactsToWatchlist(mineId(mine), free.map((r) => r.id));
    expect(result.moved).toBe(mine.length);
    const { data } = await supabase.from("contacts").select("id").in("id", theirs.map((t) => t.id));
    expect(data).toHaveLength(theirs.length);
    const { data: targets } = await supabase.from("watchlist_targets").select("owner_id, person_name");
    const created = (targets as { owner_id: string; person_name: string }[]).filter((t) => /^P\d$/.test(t.person_name));
    expect(created).toHaveLength(mine.length);
    for (const t of created) expect(t.owner_id).toBe(ME);
  });
});
