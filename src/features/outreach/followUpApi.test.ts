import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Wire-level: the real supabase-js client with only `fetch` stubbed, so we see the exact request.
const URL_ = "https://example-project.supabase.co";
const ME = "11111111-1111-4111-8111-111111111111";

type Call = { url: URL; method: string; body: string | null };
let calls: Call[];
let reply: () => Response;

const fetchStub = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = new URL(input instanceof Request ? input.url : String(input));
  calls.push({ url, method: (init?.method ?? "GET").toUpperCase(), body: typeof init?.body === "string" ? init.body : null });
  return reply();
});

async function load() {
  vi.stubEnv("VITE_SUPABASE_URL", URL_);
  vi.stubEnv("VITE_SUPABASE_ANON_KEY", "anon");
  vi.stubGlobal("fetch", fetchStub);
  vi.stubGlobal("window", {
    location: { pathname: "/", protocol: "https:", origin: "https://coffee.test" },
    Clerk: { session: { getToken: async () => "jwt" } },
  });
  vi.resetModules();
  return { api: await import("./followUpApi"), cal: await import("@/lib/googleCalendar") };
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

beforeEach(() => {
  calls = [];
  reply = () => json([{ id: "c1" }]);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("saveFollowUpReminder", () => {
  it("updates only next_touch_at, on that id AND the signed-in user's owner_id", async () => {
    const { api } = await load();
    await api.saveFollowUpReminder("c1", ME, "2026-11-19T17:30:00.000Z");
    expect(calls).toHaveLength(1);
    const c = calls[0];
    expect(c.method).toBe("PATCH");
    expect(c.url.pathname).toBe("/rest/v1/contacts");
    expect(c.url.searchParams.get("id")).toBe("eq.c1");
    expect(c.url.searchParams.get("owner_id")).toBe(`eq.${ME}`);
    expect(JSON.parse(c.body!)).toEqual({ next_touch_at: "2026-11-19T17:30:00.000Z" });
  });

  it("throws when no row matched (someone else's id, or deleted)", async () => {
    reply = () => json([]);
    const { api } = await load();
    await expect(api.saveFollowUpReminder("c-theirs", ME, "2026-11-19T17:30:00.000Z")).rejects.toThrow(/No contact of yours/);
  });
});

describe("createCalendarEvent errors carry the function's status and reason", () => {
  it("401 reconnect", async () => {
    reply = () => json({ error: "Google Calendar access expired. Reconnect it in Settings." }, 401);
    const { cal } = await load();
    const err = await cal.createCalendarEvent({ title: "t", startDatetime: "2026-11-19T17:30:00.000Z" }).catch((e) => e);
    expect(err.status).toBe(401);
    expect(err.message).toBe("Google Calendar access expired. Reconnect it in Settings.");
    expect(calls[0].url.pathname).toBe("/functions/v1/create-calendar-event");
  });

  it("success resolves", async () => {
    reply = () => json({ success: true });
    const { cal } = await load();
    await expect(cal.createCalendarEvent({ title: "t", startDatetime: "2026-11-19T17:30:00.000Z" })).resolves.toBeUndefined();
  });
});
