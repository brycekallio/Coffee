import { describe, expect, it, vi } from "vitest";
import { disconnectGoogle } from "./disconnect";

function fakeService(row: Record<string, unknown> | null, log: string[]) {
  return {
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: row, error: null }) }) }),
      update: (v: Record<string, unknown>) => ({
        eq: async (_c: string, id: string) => {
          log.push(`update ${id} ${JSON.stringify(v)}`);
          return { error: null };
        },
      }),
    }),
  };
}

describe("google-disconnect", () => {
  it("revokes at Google first, then nulls the tokens and the flag", async () => {
    const log: string[] = [];
    const f = vi.fn(async (_u: string, init?: RequestInit) => {
      log.push("revoke " + (init!.body as URLSearchParams).get("token"));
      return new Response("{}", { status: 200 });
    });
    const out = await disconnectGoogle("u1", { fetch: f as never, service: fakeService({ google_calendar_refresh_token: "R", google_calendar_token: "A" }, log) });
    expect(out).toEqual({ status: 200, body: { success: true, revoked: true } });
    expect(f.mock.calls[0][0]).toBe("https://oauth2.googleapis.com/revoke");
    expect(log[0]).toBe("revoke R");
    expect(log[1]).toContain('"google_calendar_refresh_token":null');
    expect(log[1]).toContain('"google_connected":false');
    expect(log[1]).toContain('"google_calendar_token":null');
  });

  it("keeps the tokens when Google is down (no silent half-disconnect)", async () => {
    const log: string[] = [];
    const f = vi.fn(async () => new Response("", { status: 503 }));
    const out = await disconnectGoogle("u1", { fetch: f as never, service: fakeService({ google_calendar_refresh_token: "R" }, log) });
    expect(out.status).toBe(502);
    expect(log).toEqual([]);
  });

  it("keeps the tokens when the network call throws", async () => {
    const log: string[] = [];
    const f = vi.fn(async () => { throw new Error("offline"); });
    const out = await disconnectGoogle("u1", { fetch: f as never, service: fakeService({ google_calendar_refresh_token: "R" }, log) });
    expect(out.status).toBe(502);
    expect(log).toEqual([]);
  });

  it("clears anyway when Google says the token is already invalid (400)", async () => {
    const log: string[] = [];
    const f = vi.fn(async () => new Response('{"error":"invalid_token"}', { status: 400 }));
    const out = await disconnectGoogle("u1", { fetch: f as never, service: fakeService({ google_calendar_refresh_token: "R" }, log) });
    expect(out).toEqual({ status: 200, body: { success: true, revoked: false } });
    expect(log).toHaveLength(1);
  });

  it("with no token saved, skips Google and still sets the flag false", async () => {
    const log: string[] = [];
    const f = vi.fn();
    const out = await disconnectGoogle("u1", { fetch: f as never, service: fakeService(null, log) });
    expect(f).not.toHaveBeenCalled();
    expect(out.status).toBe(200);
    expect(log[0]).toContain('"google_connected":false');
  });
});
