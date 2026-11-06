// Break-it pass on exchange-google-token (ticket C, 2026-11-06). Each test is an attack or a
// rule from the owner's decision: google_connected = Calendar linked; google_gmail_send = can send.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { CALENDAR_SCOPE, exchangeAndStore, GMAIL_SEND_SCOPE } from "./exchange";

const SECRET_A = "ya29.SECRET-ACCESS";
const SECRET_R = "1//SECRET-REFRESH";
const input = { code: "c", redirectUri: "https://x/", userId: "caller", clientId: "id", clientSecret: "client-secret" };
const both = `openid ${CALENDAR_SCOPE} ${GMAIL_SEND_SCOPE}`;

function svc(saved: Record<string, unknown>[], ids: string[] = [], error: { message: string } | null = null) {
  return {
    from: () => ({
      update: (v: Record<string, unknown>) => ({
        eq: async (_c: string, id: string) => { saved.push(v); ids.push(id); return { error }; },
      }),
    }),
  };
}
const google = (body: unknown, status = 200) =>
  vi.fn(async () => new Response(typeof body === "string" ? body : JSON.stringify(body), { status }));

describe("break-it: scopes -> flags", () => {
  it("Calendar-only connect counts as connected, sending off", async () => {
    const saved: Record<string, unknown>[] = [];
    const out = await exchangeAndStore(input, {
      fetch: google({ access_token: SECRET_A, refresh_token: SECRET_R, scope: CALENDAR_SCOPE }) as never,
      service: svc(saved),
    });
    expect(saved[0]).toMatchObject({ google_connected: true, google_gmail_send: false });
    expect(out.body).toEqual({ success: true, gmail_send: false, calendar: true });
  });

  it("Gmail-only connect: can send, but Calendar is not linked", async () => {
    const saved: Record<string, unknown>[] = [];
    const out = await exchangeAndStore(input, {
      fetch: google({ access_token: SECRET_A, refresh_token: SECRET_R, scope: GMAIL_SEND_SCOPE }) as never,
      service: svc(saved),
    });
    expect(saved[0]).toMatchObject({ google_connected: false, google_gmail_send: true });
    expect(out.body).toEqual({ success: true, gmail_send: true, calendar: false });
  });

  it("scope downgrade on reconnect (new refresh token) clears google_gmail_send", async () => {
    const saved: Record<string, unknown>[] = [];
    await exchangeAndStore(input, {
      fetch: google({ access_token: SECRET_A, refresh_token: SECRET_R, scope: CALENDAR_SCOPE }) as never,
      service: svc(saved),
    });
    expect(saved[0].google_gmail_send).toBe(false);
  });

  it("scope downgrade with NO new refresh token still clears google_gmail_send (fail closed)", async () => {
    const saved: Record<string, unknown>[] = [];
    await exchangeAndStore(input, {
      fetch: google({ access_token: SECRET_A, scope: CALENDAR_SCOPE }) as never,
      service: svc(saved),
    });
    expect(saved[0].google_gmail_send).toBe(false);
    expect(saved[0]).not.toHaveProperty("google_connected"); // calendar still granted: leave it
    expect(saved[0]).not.toHaveProperty("google_calendar_refresh_token");
  });

  it("no refresh token never turns a flag ON (an old refresh token may lack the scope)", async () => {
    const saved: Record<string, unknown>[] = [];
    await exchangeAndStore(input, { fetch: google({ access_token: SECRET_A, scope: both }) as never, service: svc(saved) });
    expect(saved[0]).not.toHaveProperty("google_gmail_send");
    expect(saved[0]).not.toHaveProperty("google_connected");
  });

  it("Google omits `scope` entirely -> nothing is marked granted", async () => {
    const saved: Record<string, unknown>[] = [];
    const out = await exchangeAndStore(input, {
      fetch: google({ access_token: SECRET_A, refresh_token: SECRET_R }) as never,
      service: svc(saved),
    });
    expect(saved[0]).toMatchObject({ google_connected: false, google_gmail_send: false });
    expect(out.body).toEqual({ success: true, gmail_send: false, calendar: false });
  });

  it("look-alike scopes are not accepted", async () => {
    const saved: Record<string, unknown>[] = [];
    await exchangeAndStore(input, {
      fetch: google({
        access_token: SECRET_A, refresh_token: SECRET_R,
        scope: `${CALENDAR_SCOPE}.readonly ${GMAIL_SEND_SCOPE}x https://evil/auth/gmail.send`,
      }) as never,
      service: svc(saved),
    });
    expect(saved[0]).toMatchObject({ google_connected: false, google_gmail_send: false });
  });
});

describe("break-it: tokens never leak in responses", () => {
  it("success body carries no token", async () => {
    const out = await exchangeAndStore(input, {
      fetch: google({ access_token: SECRET_A, refresh_token: SECRET_R, scope: both }) as never,
      service: svc([]),
    });
    expect(JSON.stringify(out)).not.toMatch(/SECRET/);
  });

  it("a database error that echoes the row does not reach the caller", async () => {
    const out = await exchangeAndStore(input, {
      fetch: google({ access_token: SECRET_A, refresh_token: SECRET_R, scope: both }) as never,
      service: svc([], [], { message: `Failing row contains (${SECRET_A}, ${SECRET_R})` }),
    });
    expect(out.status).toBe(500);
    expect(JSON.stringify(out)).not.toMatch(/SECRET/);
  });

  it("Google's non-JSON error page -> clean 502, nothing saved, no echo", async () => {
    const saved: Record<string, unknown>[] = [];
    const out = await exchangeAndStore(input, { fetch: google(`<html>${SECRET_A}</html>`, 502) as never, service: svc(saved) });
    expect(out.status).toBe(502);
    expect(saved).toEqual([]);
    expect(JSON.stringify(out)).not.toMatch(/SECRET/);
  });

  it("Google's error field is passed on only as a short code, never free text", async () => {
    const out = await exchangeAndStore(input, {
      fetch: google({ error: `invalid_grant ${SECRET_R}`, error_description: SECRET_A }, 400) as never,
      service: svc([]),
    });
    expect(out.status).toBe(400);
    expect(JSON.stringify(out)).not.toMatch(/SECRET/);
  });

  it("the client secret is sent to Google only, never returned", async () => {
    const f = google({ error: "invalid_client" }, 401);
    const out = await exchangeAndStore(input, { fetch: f as never, service: svc([]) });
    expect(JSON.stringify(out)).not.toContain("client-secret");
    expect(f.mock.calls[0][0]).toBe("https://oauth2.googleapis.com/token");
  });
});

/* ── index.ts with Deno.serve stubbed: who is the caller? ───────────────────── */

describe("break-it: exchange for another user (index.ts)", () => {
  const env: Record<string, string> = {
    SUPABASE_URL: "https://db.test", SUPABASE_ANON_KEY: "anon", SUPABASE_SERVICE_ROLE_KEY: "service",
    GOOGLE_CLIENT_ID: "id", GOOGLE_CLIENT_SECRET: "client-secret",
  };
  let handler: (req: Request) => Promise<Response>;
  let caller: string | null = "caller";
  const updatedIds: string[] = [];
  let updateThrows: Error | null = null;
  const createClient = vi.fn((_url: string, key: string) =>
    key === "anon"
      ? { rpc: async () => (caller ? { data: caller, error: null } : { data: null, error: { message: "no" } }) }
      : {
          from: () => ({
            update: () => ({
              eq: async (_c: string, id: string) => {
                if (updateThrows) throw updateThrows;
                updatedIds.push(id);
                return { error: null };
              },
            }),
          }),
        },
  );
  const fetchSpy = vi.fn(async () =>
    new Response(JSON.stringify({ access_token: SECRET_A, refresh_token: SECRET_R, scope: both }), { status: 200 }),
  );
  const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

  beforeAll(async () => {
    vi.doMock("jsr:@supabase/functions-js/edge-runtime.d.ts", () => ({}));
    vi.doMock("jsr:@supabase/supabase-js@2", () => ({ createClient }));
    vi.stubGlobal("fetch", fetchSpy);
    vi.stubGlobal("Deno", { serve: (h: typeof handler) => { handler = h; }, env: { get: (k: string) => env[k] } });
    await import("./index.ts");
  });
  afterAll(() => { vi.unstubAllGlobals(); vi.doUnmock("jsr:@supabase/supabase-js@2"); errSpy.mockRestore(); });
  beforeEach(() => { caller = "caller"; updatedIds.length = 0; updateThrows = null; fetchSpy.mockClear(); errSpy.mockClear(); });

  const call = (body: unknown, headers: Record<string, string> = { authorization: "Bearer clerk" }) =>
    handler(new Request("https://fn.test/exchange-google-token", { method: "POST", headers, body: JSON.stringify(body) }));

  it("a user id in the body is ignored: tokens land on the caller's row only", async () => {
    const res = await call({ code: "c", redirect_uri: "https://x/", user_id: "victim", id: "victim", userId: "victim" });
    expect(res.status).toBe(200);
    expect(updatedIds).toEqual(["caller"]);
  });

  it("no Authorization header -> 401, Google never called", async () => {
    const res = await call({ code: "c", redirect_uri: "https://x/" }, {});
    expect(res.status).toBe(401);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("a token that resolves to no user (anon key, forged JWT) -> 401, Google never called", async () => {
    caller = null;
    const res = await call({ code: "c", redirect_uri: "https://x/" });
    expect(res.status).toBe(401);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(updatedIds).toEqual([]);
  });

  it("malformed body -> 400, not a 500 with a parser message", async () => {
    const res = await handler(new Request("https://fn.test/x", { method: "POST", headers: { authorization: "Bearer clerk" }, body: "{not json" }));
    expect(res.status).toBe(400);
  });

  it("an unexpected throw carrying a token leaks it neither to the caller nor the log", async () => {
    updateThrows = new Error(`boom ${SECRET_R}`);
    const res = await call({ code: "c", redirect_uri: "https://x/" });
    expect(res.status).toBe(500);
    expect(await res.text()).not.toMatch(/SECRET/);
    expect(JSON.stringify(errSpy.mock.calls)).not.toMatch(/SECRET/);
  });
});
