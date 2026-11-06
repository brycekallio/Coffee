import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEMO_READ_ONLY_MESSAGE, isDemoPath, stripDemoBase, withDemoBase } from "./mode";
import { DemoNetworkBlockedError, installNetworkGuard } from "./networkGuard";

/**
 * The demo's safety promises, as tests:
 *   1. In demo mode the real Supabase client is never constructed.
 *   2. Nothing in demo mode (database, storage, any AI tool) touches the network.
 *   3. Writes are refused, not silently dropped.
 * `mode.ts` decides once at module load, so each test sets the URL and re-imports fresh.
 */

const createClient = vi.fn(() => ({ __real: true }));
vi.mock("@supabase/supabase-js", () => ({ createClient }));

const fetchSpy = vi.fn(() => Promise.reject(new Error("network used")));

function visit(pathname: string) {
  vi.stubGlobal("window", { location: { pathname, protocol: "https:", origin: "https://coffee.test" } });
  vi.stubGlobal("fetch", fetchSpy);
}

/** Loads supabase.ts the way a page load at `pathname` would. */
async function loadAt(pathname: string) {
  visit(pathname);
  vi.resetModules();
  const supa = await import("@/lib/supabase");
  const { createDemoClient } = await import("./demoClient");
  return { ...supa, createDemoClient };
}

/** Resolves a demo-client promise whose fake latency runs on fake timers. */
async function settle<T>(p: PromiseLike<T>): Promise<T> {
  const out = Promise.resolve(p);
  await vi.advanceTimersByTimeAsync(5_000);
  return out;
}

beforeEach(() => {
  vi.useFakeTimers();
  createClient.mockClear();
  fetchSpy.mockClear();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("demo paths", () => {
  it("recognises /demo and its sub-paths, not look-alikes", () => {
    expect(isDemoPath("/demo")).toBe(true);
    expect(isDemoPath("/demo/applications")).toBe(true);
    expect(isDemoPath("/demonstration")).toBe(false);
    expect(isDemoPath("/")).toBe(false);
  });

  it("maps between URL paths and app paths", () => {
    expect(stripDemoBase("/demo")).toBe("/");
    expect(stripDemoBase("/demo/contacts/abc")).toBe("/contacts/abc");
    expect(stripDemoBase("/applications")).toBe("/applications");
    expect(withDemoBase("/")).toBe("/demo");
    expect(withDemoBase("/outreach")).toBe("/demo/outreach");
  });
});

describe("demo mode never constructs the real Supabase client", () => {
  it("serves every query from the in-memory client and never calls createClient", async () => {
    const { supabase, installDemoClient, createDemoClient } = await loadAt("/demo");
    installDemoClient(createDemoClient({ readOnly: true }));

    for (const table of ["contacts", "contact_meetings", "applications", "scheduled_outreach", "watchlist_targets", "profiles"]) {
      const { data, error } = await settle(supabase.from(table as "contacts").select());
      expect(error).toBeNull();
      expect((data as unknown[]).length).toBeGreaterThan(0);
    }
    await settle(supabase.rpc("link_clerk_identity"));
    await settle(supabase.functions.invoke("ai-settings", { body: { action: "status" } }));
    await settle(supabase.storage.from("resumes").createSignedUrl("x", 60));

    expect(createClient).not.toHaveBeenCalled();
  });

  it("refuses to run before the demo client is installed, instead of falling back to the real one", async () => {
    const { supabase } = await loadAt("/demo");
    expect(() => supabase.from("contacts")).toThrow(/demo client/i);
    expect(createClient).not.toHaveBeenCalled();
  });

  it("only accepts a demo client in demo mode", async () => {
    const { installDemoClient, createDemoClient } = await loadAt("/");
    expect(() => installDemoClient(createDemoClient({ readOnly: true }))).toThrow(/demo mode/);
  });

  it("outside the demo, the real client is built (once, lazily) from the real config", async () => {
    const { supabase } = await loadAt("/");
    expect(createClient).not.toHaveBeenCalled(); // lazy: nothing yet
    void (supabase as unknown as { __real: boolean }).__real;
    void (supabase as unknown as { __real: boolean }).__real;
    expect(createClient).toHaveBeenCalledTimes(1);
  });
});

describe("demo mode makes no network requests", () => {
  const AI_TOOLS: [string, Record<string, unknown>][] = [
    ["ai-settings", { action: "status" }],
    ["summarize-contact", {}],
    ["score-jd", {}],
    ["adjust-resume", { mode: "suggestions" }],
    ["adjust-resume", { mode: "rewrite" }],
    ["personalize-outreach", {}],
    ["review-resume", { mode: "questions" }],
    ["review-resume", { mode: "review" }],
  ];

  it.each(AI_TOOLS)("%s returns a canned result without fetch", async (name, body) => {
    const { createDemoClient } = await loadAt("/demo");
    const client = createDemoClient({ readOnly: true });
    const { data, error } = await settle(client.functions.invoke(name, { body }));
    expect(error).toBeNull();
    expect(data).toBeTruthy();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("an unknown function is an error, not a real call", async () => {
    const { createDemoClient } = await loadAt("/demo");
    const client = createDemoClient({ readOnly: true });
    const { data, error } = await settle(client.functions.invoke("some-new-function", { body: {} }));
    expect(data).toBeNull();
    expect(error).toBeTruthy();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("the guard blocks cross-origin fetch, beacons and XHR, and lets same-origin through", async () => {
    const real = vi.fn(async () => new Response("ok"));
    const realBeacon = vi.fn(() => true);
    const realOpen = vi.fn();
    class FakeXhr {}
    (FakeXhr.prototype as unknown as { open: unknown }).open = realOpen;
    const sockets: string[] = [];
    class FakeSocket { constructor(url: string) { sockets.push(url); } }
    class FakeSource { constructor(url: string) { sockets.push(url); } }
    const target = {
      location: { origin: "https://coffee.test" },
      fetch: real,
      navigator: { sendBeacon: realBeacon },
      XMLHttpRequest: FakeXhr,
      WebSocket: FakeSocket,
      EventSource: FakeSource,
    } as unknown as Window & typeof globalThis;
    vi.spyOn(console, "warn").mockImplementation(() => {});
    installNetworkGuard(target);

    await expect(target.fetch("https://xyz.supabase.co/functions/v1/score-jd")).rejects.toBeInstanceOf(DemoNetworkBlockedError);
    await expect(target.fetch("https://openrouter.ai/api/v1/chat")).rejects.toBeInstanceOf(DemoNetworkBlockedError);
    expect(target.navigator.sendBeacon("https://example.com/track")).toBe(false);
    const xhr = new target.XMLHttpRequest();
    expect(() => xhr.open("POST", "https://xyz.supabase.co/rest/v1/contacts")).toThrow(DemoNetworkBlockedError);
    expect(real).not.toHaveBeenCalled();
    expect(realBeacon).not.toHaveBeenCalled();
    expect(realOpen).not.toHaveBeenCalled();
    expect(() => new target.WebSocket("wss://xyz.supabase.co/realtime/v1/websocket")).toThrow(DemoNetworkBlockedError);
    expect(() => new target.EventSource("https://evil.test/stream")).toThrow(DemoNetworkBlockedError);
    expect(sockets).toEqual([]);

    await target.fetch("/assets/index.js");
    expect(real).toHaveBeenCalledTimes(1);
    expect(target.navigator.sendBeacon("/ping")).toBe(true);
    xhr.open("GET", "/assets/data.json");
    expect(realOpen).toHaveBeenCalledTimes(1);
    new target.WebSocket("wss://coffee.test/hmr"); // Vite's dev socket, same host
    expect(sockets).toEqual(["wss://coffee.test/hmr"]);
  });
});

describe("demo writes are refused", () => {
  it("rejects insert, update and delete with the sign-up message and changes nothing", async () => {
    const { createDemoClient } = await loadAt("/demo");
    const client = createDemoClient({ readOnly: true });
    const before = (await settle(client.from("contacts").select())).data as unknown[];

    const ins = await settle(client.from("contacts").insert({ owner_id: "u", first_name: "X" }));
    const upd = await settle(client.from("contacts").update({ first_name: "X" }).eq("first_name", "Priya"));
    const del = await settle(client.from("contacts").delete().eq("first_name", "Priya"));
    for (const r of [ins, upd, del]) expect(r.error?.message).toBe(DEMO_READ_ONLY_MESSAGE);

    const after = (await settle(client.from("contacts").select())).data as unknown[];
    expect(after).toEqual(before);
  });

  it("rejects uploads and tools that only exist to save something", async () => {
    const { createDemoClient } = await loadAt("/demo");
    const client = createDemoClient({ readOnly: true });
    const up = await settle(client.storage.from("resumes").upload("a.pdf", new Blob()));
    expect(up.error?.message).toBe(DEMO_READ_ONLY_MESSAGE);
    for (const [name, body] of [
      ["ai-settings", { action: "save", api_key: "sk-secret" }],
      ["ai-settings", { action: "remove" }],
      ["exchange-google-token", { code: "abc" }],
      ["google-disconnect", {}],
      ["create-calendar-event", {}],
      ["process-meeting-notes", {}],
    ] as const) {
      const r = await settle(client.functions.invoke(name, { body }));
      expect(r.error?.message, name).toBe(DEMO_READ_ONLY_MESSAGE);
    }
  });

  it("the writable variant (local preview harness) still accepts writes", async () => {
    const { createDemoClient } = await loadAt("/demo");
    const client = createDemoClient({ readOnly: false });
    const r = await settle(client.from("contacts").insert({ owner_id: "u", first_name: "Zed" }).select());
    expect(r.error).toBeNull();
  });
});
