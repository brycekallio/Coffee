import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The real client, unmocked, through the lazy proxy in supabase.ts.
 *
 * The /demo work turned `supabase` into a Proxy so the real client is only built outside
 * the demo. These tests prove signed-in users still get the genuine supabase-js client:
 * `supabase-js` itself is NOT mocked, only `fetch` underneath it, so every call below goes
 * through the real PostgREST / storage / functions code and lands on the wire exactly as it
 * would in production (with the Clerk token as the bearer).
 */

const URL_ = "https://example-project.supabase.co";
const ANON = "anon-key-for-tests";
const TOKEN = "clerk-session-jwt";

type Call = { url: URL; method: string; headers: Headers; body: string | null };
let calls: Call[];

const fetchStub = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = new URL(input instanceof Request ? input.url : String(input));
  calls.push({
    url,
    method: (init?.method ?? "GET").toUpperCase(),
    headers: new Headers(init?.headers),
    body: typeof init?.body === "string" ? init.body : null,
  });
  // Shape the reply per service so supabase-js can parse it without error.
  const json = url.pathname.startsWith("/storage/v1/object/sign")
    ? { signedURL: "/object/sign/resumes/u/resume.pdf?token=t" }
    : url.pathname.startsWith("/rest/v1/rpc/")
      ? "00000000-0000-4000-8000-000000000001"
      : url.pathname.startsWith("/rest/v1/")
        ? [{ id: "c1" }]
        : { ok: true };
  return new Response(JSON.stringify(json), { status: 200, headers: { "Content-Type": "application/json" } });
});

/** Loads supabase.ts as a normal (non-demo) page load would. */
async function loadRealApp() {
  vi.stubEnv("VITE_SUPABASE_URL", URL_);
  vi.stubEnv("VITE_SUPABASE_ANON_KEY", ANON);
  vi.stubGlobal("fetch", fetchStub);
  vi.stubGlobal("window", {
    location: { pathname: "/", protocol: "https:", origin: "https://coffee.test" },
    Clerk: { session: { getToken: async () => TOKEN } },
  });
  vi.resetModules();
  return import("@/lib/supabase");
}

beforeEach(() => {
  calls = [];
  fetchStub.mockClear();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("real supabase client through the proxy (signed-in app)", () => {
  it("from().select() reaches PostgREST on the configured project with the Clerk token", async () => {
    const { supabase } = await loadRealApp();
    const { data, error } = await supabase.from("contacts").select("id");

    expect(error).toBeNull();
    expect(data).toEqual([{ id: "c1" }]);
    expect(calls).toHaveLength(1);
    expect(calls[0].url.origin).toBe(URL_);
    expect(calls[0].url.pathname).toBe("/rest/v1/contacts");
    expect(calls[0].headers.get("Authorization")).toBe(`Bearer ${TOKEN}`);
    expect(calls[0].headers.get("apikey")).toBe(ANON);
  });

  it("writes go over the wire as real requests (insert is a POST, update a PATCH)", async () => {
    const { supabase } = await loadRealApp();
    await supabase.from("watchlist_targets").insert({ name: "x", company: "y" } as never);
    await supabase.from("contacts").update({ company: "z" }).eq("id", "c1");

    expect(calls.map((c) => c.method)).toEqual(["POST", "PATCH"]);
    expect(calls[0].body).toContain('"name":"x"');
    expect(calls[1].url.searchParams.get("id")).toBe("eq.c1");
  });

  it("rpc() calls the function endpoint", async () => {
    const { supabase } = await loadRealApp();
    const { data } = await supabase.rpc("link_clerk_identity" as never);

    expect(data).toBe("00000000-0000-4000-8000-000000000001");
    expect(calls[0].url.pathname).toBe("/rest/v1/rpc/link_clerk_identity");
    expect(calls[0].method).toBe("POST");
  });

  it("storage.from().createSignedUrl() hits the storage API for the resumes bucket", async () => {
    const { supabase } = await loadRealApp();
    const { data, error } = await supabase.storage.from("resumes").createSignedUrl("u/resume.pdf", 60);

    expect(error).toBeNull();
    expect(data?.signedUrl).toContain("/object/sign/resumes/u/resume.pdf");
    expect(calls[0].url.pathname).toBe("/storage/v1/object/sign/resumes/u/resume.pdf");
    expect(calls[0].headers.get("Authorization")).toBe(`Bearer ${TOKEN}`);
  });

  it("functions.invoke() posts the body to the Edge Function with the token", async () => {
    const { supabase } = await loadRealApp();
    await supabase.functions.invoke("score-jd", { body: { jd: "analyst" } });

    expect(calls[0].url.origin).toBe(URL_);
    expect(calls[0].url.pathname).toBe("/functions/v1/score-jd");
    expect(calls[0].method).toBe("POST");
    expect(calls[0].body).toContain('"jd":"analyst"');
    expect(calls[0].headers.get("Authorization")).toBe(`Bearer ${TOKEN}`);
  });

  it("is lazy: importing builds and sends nothing, then calls work repeatedly", async () => {
    const { supabase } = await loadRealApp();
    expect(calls).toHaveLength(0); // importing alone makes no request
    await supabase.from("contacts").select("id");
    await supabase.from("contacts").select("id");
    expect(calls).toHaveLength(2);
  });

  it("keeps supabase.auth.* throwing by design (Clerk is the only session source)", async () => {
    const { supabase } = await loadRealApp();
    expect(() => supabase.auth.getSession()).toThrow();
  });

  it("is not the demo client: installDemoClient() refuses to run outside the demo", async () => {
    const { installDemoClient } = await loadRealApp();
    expect(() => installDemoClient({} as never)).toThrow(/only allowed in demo mode/);
  });

  it("sends no Authorization token before Clerk has loaded (RLS then rejects it)", async () => {
    const { supabase } = await loadRealApp();
    vi.stubGlobal("window", { location: { pathname: "/", protocol: "https:", origin: "https://coffee.test" } });
    await supabase.from("contacts").select("id");

    const auth = calls[0].headers.get("Authorization");
    expect(auth === null || !auth.includes(TOKEN)).toBe(true);
  });
});
