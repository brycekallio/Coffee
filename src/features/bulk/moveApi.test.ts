import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * A move that fails partway must never leave anyone in neither list. Chunks are moved one at a
 * time (copy, then delete originals); a failure removes only that chunk's copies.
 */
const ME = "11111111-1111-4111-8111-111111111111";
const N = 250; // three chunks of 100/100/50

type Call = { method: string; table: string; ids: string[] };

function stub(failDeleteOnCall: number) {
  const calls: Call[] = [];
  let deletes = 0;
  let inserted = 0;
  const contacts = Array.from({ length: N }, (_, i) => ({
    id: `c${i}`, owner_id: ME, first_name: `P${i}`, last_name: null, company: null, title: null, email: null, phone: null,
    linkedin_url: null, status: "to_contact", notes: null, last_touch_at: null, next_touch_at: null, created_at: null,
    updated_at: null, starred: false, tags: [],
  }));
  const fetchStub = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    const method = (init?.method ?? "GET").toUpperCase();
    const table = url.pathname.split("/").pop()!;
    const idParam = url.searchParams.get("id") ?? "";
    const ids = idParam.startsWith("in.(") ? idParam.slice(4, -1).split(",") : [];
    calls.push({ method, table, ids });
    const json = (body: unknown, status = 200) =>
      new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
    if (method === "GET") return json(table === "contacts" ? contacts.filter((c) => ids.includes(c.id)) : []);
    if (method === "POST") {
      const rows = JSON.parse(String(init?.body)) as unknown[];
      return json(rows.map(() => ({ id: `t${inserted++}` })), 201);
    }
    if (method === "DELETE" && table === "contacts") {
      deletes++;
      if (deletes === failDeleteOnCall) return json({ message: "network blip", code: "XX000" }, 500);
    }
    return json([]);
  });
  return { calls, fetchStub };
}

async function load(fetchStub: ReturnType<typeof vi.fn>) {
  vi.stubEnv("VITE_SUPABASE_URL", "https://example-project.supabase.co");
  vi.stubEnv("VITE_SUPABASE_ANON_KEY", "anon");
  vi.stubGlobal("fetch", fetchStub);
  vi.stubGlobal("window", {
    location: { pathname: "/", protocol: "https:", origin: "https://coffee.test" },
    Clerk: { session: { getToken: async () => "jwt" } },
  });
  vi.resetModules();
  return import("./moveApi");
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

const allIds = Array.from({ length: N }, (_, i) => `c${i}`);

describe("move with a failure partway through", () => {
  it("a failed delete in chunk 2 keeps chunk 1 moved and removes only chunk 2's copies", async () => {
    const { calls, fetchStub } = stub(2);
    const move = await load(fetchStub);
    const err = await move.moveContactsToWatchlist(ME, allIds).catch((e) => e);
    expect(err).toBeInstanceOf(move.PartialMoveError);
    expect((err as InstanceType<typeof move.PartialMoveError>).moved).toBe(100);

    const writes = calls.filter((c) => c.method !== "GET");
    expect(writes.map((c) => `${c.method} ${c.table}`)).toEqual([
      "POST watchlist_targets", // chunk 1 copied
      "DELETE contacts", //         chunk 1 originals deleted
      "POST watchlist_targets", // chunk 2 copied
      "DELETE contacts", //         chunk 2 delete fails
      "DELETE watchlist_targets", // only chunk 2's copies removed
    ]);
    const cleanup = writes[4];
    expect(cleanup.ids).toEqual(Array.from({ length: 100 }, (_, i) => `t${100 + i}`));
    // Chunk 3 was never touched.
    expect(writes.some((c) => c.ids.includes("c200"))).toBe(false);
  });

  it("a failure in the very first chunk is the plain error (nothing moved)", async () => {
    const { calls, fetchStub } = stub(1);
    const move = await load(fetchStub);
    const err = await move.moveContactsToWatchlist(ME, allIds).catch((e) => e);
    expect(err).not.toBeInstanceOf(move.PartialMoveError);
    expect(calls.filter((c) => c.method === "DELETE" && c.table === "watchlist_targets")[0].ids).toHaveLength(100);
  });

  it("no failure moves everyone", async () => {
    const { fetchStub } = stub(-1);
    const move = await load(fetchStub);
    expect(await move.moveContactsToWatchlist(ME, allIds)).toEqual({ moved: N, blocked: 0 });
  });
});
