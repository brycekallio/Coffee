// Break-it pass on google-disconnect (ticket C, 2026-11-06).
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { disconnectGoogle } from "./disconnect";

const SECRET_R = "1//SECRET-REFRESH";

describe("break-it: disconnect never leaks a token", () => {
  it("a database error echoing the row is not returned", async () => {
    const service = {
      from: () => ({
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: { message: `bad row ${SECRET_R}` } }) }) }),
        update: () => ({ eq: async () => ({ error: { message: `Failing row contains (${SECRET_R})` } }) }),
      }),
    };
    const out = await disconnectGoogle("u1", { fetch: vi.fn() as never, service });
    expect(out.status).toBe(500);
    expect(JSON.stringify(out)).not.toMatch(/SECRET/);
  });

  it("an update error after revoking is not returned verbatim", async () => {
    const service = {
      from: () => ({
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { google_calendar_refresh_token: SECRET_R }, error: null }) }) }),
        update: () => ({ eq: async () => ({ error: { message: `Failing row contains (${SECRET_R})` } }) }),
      }),
    };
    const out = await disconnectGoogle("u1", { fetch: vi.fn(async () => new Response("{}")) as never, service });
    expect(out.status).toBe(500);
    expect(JSON.stringify(out)).not.toMatch(/SECRET/);
  });
});

/* ── index.ts with Deno.serve stubbed ─────────────────────────────────────── */

describe("break-it: disconnect another user (index.ts)", () => {
  const env: Record<string, string> = { SUPABASE_URL: "https://db.test", SUPABASE_ANON_KEY: "anon", SUPABASE_SERVICE_ROLE_KEY: "service" };
  let handler: (req: Request) => Promise<Response>;
  let caller: string | null = "caller";
  const touched: string[] = [];
  let selectThrows: Error | null = null;
  const createClient = vi.fn((_url: string, key: string) =>
    key === "anon"
      ? { rpc: async () => (caller ? { data: caller, error: null } : { data: null, error: { message: "no" } }) }
      : {
          from: () => ({
            select: () => ({
              eq: (_c: string, id: string) => ({
                maybeSingle: async () => {
                  if (selectThrows) throw selectThrows;
                  touched.push(`select ${id}`);
                  return { data: { google_calendar_refresh_token: SECRET_R }, error: null };
                },
              }),
            }),
            update: () => ({ eq: async (_c: string, id: string) => { touched.push(`update ${id}`); return { error: null }; } }),
          }),
        },
  );
  const fetchSpy = vi.fn(async () => new Response("{}", { status: 200 }));
  const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

  beforeAll(async () => {
    vi.doMock("jsr:@supabase/functions-js/edge-runtime.d.ts", () => ({}));
    vi.doMock("jsr:@supabase/supabase-js@2", () => ({ createClient }));
    vi.stubGlobal("fetch", fetchSpy);
    vi.stubGlobal("Deno", { serve: (h: typeof handler) => { handler = h; }, env: { get: (k: string) => env[k] } });
    await import("./index.ts");
  });
  afterAll(() => { vi.unstubAllGlobals(); vi.doUnmock("jsr:@supabase/supabase-js@2"); errSpy.mockRestore(); });
  beforeEach(() => { caller = "caller"; touched.length = 0; selectThrows = null; fetchSpy.mockClear(); errSpy.mockClear(); });

  const call = (body: unknown, headers: Record<string, string> = { authorization: "Bearer clerk" }) =>
    handler(new Request("https://fn.test/google-disconnect", { method: "POST", headers, body: JSON.stringify(body) }));

  it("a victim id in the body is ignored: only the caller's row is read and cleared", async () => {
    const res = await call({ user_id: "victim", id: "victim", userId: "victim" });
    expect(res.status).toBe(200);
    expect(touched).toEqual(["select caller", "update caller"]);
  });

  it("no Authorization header -> 401, nothing read, Google never called", async () => {
    const res = await call({}, {});
    expect(res.status).toBe(401);
    expect(touched).toEqual([]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("token resolving to no user -> 401, nothing read or revoked", async () => {
    caller = null;
    const res = await call({});
    expect(res.status).toBe(401);
    expect(touched).toEqual([]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("the success response never contains the token", async () => {
    const res = await call({});
    expect(await res.text()).not.toMatch(/SECRET/);
  });

  it("an unexpected throw carrying a token leaks it neither to the caller nor the log", async () => {
    selectThrows = new Error(`boom ${SECRET_R}`);
    const res = await call({});
    expect(res.status).toBe(500);
    expect(await res.text()).not.toMatch(/SECRET/);
    expect(JSON.stringify(errSpy.mock.calls)).not.toMatch(/SECRET/);
  });
});
