import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Outreach writes from the page must lose the race against the cron, never win it.
 * WIRE: every status change carries `status=eq.<expected>` (real supabase-js, fetch stubbed),
 * so a row the cron already claimed or sent matches nothing and nothing is overwritten.
 */
const URL_ = "https://example-project.supabase.co";
type Call = { url: URL; method: string; body: unknown };
let calls: Call[];
let respondWith: unknown[];

const fetchStub = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = new URL(input instanceof Request ? input.url : String(input));
  calls.push({ url, method: (init?.method ?? "GET").toUpperCase(), body: init?.body ? JSON.parse(String(init.body)) : null });
  return new Response(JSON.stringify(respondWith), { status: 200, headers: { "Content-Type": "application/json" } });
});

async function api() {
  vi.stubEnv("VITE_SUPABASE_URL", URL_);
  vi.stubEnv("VITE_SUPABASE_ANON_KEY", "anon");
  vi.stubGlobal("fetch", fetchStub);
  vi.stubGlobal("window", {
    location: { pathname: "/", protocol: "https:", origin: "https://coffee.test" },
    Clerk: { session: { getToken: async () => "jwt" } },
  });
  vi.resetModules();
  return import("./outreachApi");
}

beforeEach(() => { calls = []; respondWith = [{ id: "o1" }]; fetchStub.mockClear(); });
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("updateIfStatus", () => {
  it("edit and Send updates carry status=eq.scheduled", async () => {
    const { updateIfStatus } = await api();
    expect(await updateIfStatus("o1", { subject: "x" }, "scheduled")).toBe(true);
    expect(await updateIfStatus("o1", { status: "sent" }, "scheduled")).toBe(true);
    expect(calls.map((c) => c.method)).toEqual(["PATCH", "PATCH"]);
    for (const c of calls) {
      expect(c.url.searchParams.get("id")).toBe("eq.o1");
      expect(c.url.searchParams.get("status")).toBe("eq.scheduled");
    }
  });

  it("returns false when no row matched, so the page can say it was already sent", async () => {
    const { updateIfStatus } = await api();
    respondWith = [];
    expect(await updateIfStatus("o1", { status: "sent" }, "scheduled")).toBe(false);
  });

  it("retry accepts failed or missed rows only", async () => {
    const { updateIfStatus } = await api();
    await updateIfStatus("o1", { status: "scheduled" }, ["failed", "missed"]);
    expect(calls[0].url.searchParams.get("status")).toBe("in.(failed,missed)");
  });
});

describe("buildMailto", () => {
  it("carries the message exactly, with no tracking markup appended (H1)", async () => {
    const { buildMailto } = await api();
    const message = "Hi Priya,\n\nThanks for the chat.\n\nMaya";
    const href = buildMailto("priya@example.com", "Follow up", message);
    const q = new URL(href);
    expect(q.protocol).toBe("mailto:");
    expect(decodeURIComponent(href.split("body=")[1])).toBe(message);
    expect(href).not.toMatch(/img|tracker|<|%3C/i);
  });
});

describe("failureLabel", () => {
  it("shows the stored reason, and rewrites the old Gmail one", async () => {
    const { failureLabel } = await api();
    expect(failureLabel({ failure_reason: "Not sent: contact not found" })).toBe("Not sent: contact not found");
    expect(failureLabel({ failure_reason: "Gmail is not connected" })).toBe("Not sent: connect Gmail in Settings");
    expect(failureLabel({ failure_reason: null })).toBe("Not sent");
  });
});
