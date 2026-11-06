import { describe, expect, it, vi } from "vitest";
import { createCalendarEvent } from "./event";

const GOOD = {
  title: "Coffee chat",
  description: "d",
  start_datetime: "2026-06-01T14:00:00Z",
  end_datetime: "2026-06-01T14:30:00Z",
  timezone: "America/Denver",
};

function setup(profile: Record<string, unknown> | null, responses: Array<Response | (() => Response)> = []) {
  const updates: Array<{ id: string; v: Record<string, unknown> }> = [];
  const queue = [...responses];
  const f = vi.fn(async (...args: [string, RequestInit?]) => {
    void args;
    const r = queue.shift();
    if (!r) throw new Error("unexpected fetch");
    return typeof r === "function" ? r() : r;
  });
  const service = {
    from: () => ({
      select: () => ({ eq: () => ({ single: async () => ({ data: profile, error: profile ? null : { message: "x" } }) }) }),
      update: (v: Record<string, unknown>) => ({
        eq: async (_c: string, id: string) => {
          updates.push({ id, v });
          return {};
        },
      }),
    }),
  };
  const deps = { fetch: f as never, service, googleClientId: "cid", googleClientSecret: "sec", now: () => 1_000_000, log: () => {} };
  return { f, deps, updates };
}
const profile = { google_calendar_token: "A", google_calendar_refresh_token: "R", google_calendar_token_expiry: null };
const ok = () => new Response("{}", { status: 200 });
const run = (body: unknown, deps: ReturnType<typeof setup>["deps"]) => createCalendarEvent("u1", async () => body, deps);

describe("create-calendar-event", () => {
  it("bad JSON -> 400, not 500", async () => {
    const { deps, f } = setup(profile);
    const out = await createCalendarEvent("u1", async () => { throw new SyntaxError("bad"); }, deps);
    expect(out.status).toBe(400);
    expect(f).not.toHaveBeenCalled();
  });

  it("missing fields -> 400 with the existing message", async () => {
    const { deps } = setup(profile);
    for (const b of [{}, null, { title: "t", start_datetime: GOOD.start_datetime }, { ...GOOD, title: "" }]) {
      const out = await run(b, deps);
      expect(out).toEqual({ status: 400, body: { error: "title, start_datetime, and end_datetime are required" } });
    }
  });

  it("non-ISO start or end -> 400", async () => {
    const { deps, f } = setup(profile);
    for (const bad of ["tomorrow", "2026-13-45T10:00:00Z", "06/01/2026", 12345]) {
      expect((await run({ ...GOOD, start_datetime: bad }, deps)).status).toBe(400);
      expect((await run({ ...GOOD, end_datetime: bad }, deps)).status).toBe(400);
    }
    expect(f).not.toHaveBeenCalled();
  });

  it("end before start -> 400", async () => {
    const { deps } = setup(profile);
    const out = await run({ ...GOOD, end_datetime: "2026-06-01T13:00:00Z" }, deps);
    expect(out.status).toBe(400);
  });

  it("accepts offset-less and offset ISO forms the app sends", async () => {
    const { deps } = setup(profile, [ok(), ok()]);
    expect((await run({ ...GOOD, start_datetime: "2026-06-01T14:00:00", end_datetime: "2026-06-01T14:30:00" }, deps)).status).toBe(200);
    expect((await run({ ...GOOD, start_datetime: "2026-06-01T14:00:00.000+02:00", end_datetime: "2026-06-01T15:00:00.000+02:00" }, deps)).status).toBe(200);
  });

  it("Google 401 -> exactly one refresh, then one retry with the new token", async () => {
    const { deps, f, updates } = setup(profile, [
      new Response("expired", { status: 401 }),
      new Response(JSON.stringify({ access_token: "NEW", expires_in: 3600 }), { status: 200 }),
      ok(),
    ]);
    const out = await run(GOOD, deps);
    expect(out).toEqual({ status: 200, body: { success: true } });
    expect(f).toHaveBeenCalledTimes(3);
    expect(f.mock.calls[1][0]).toBe("https://oauth2.googleapis.com/token");
    expect((f.mock.calls[2][1]!.headers as Record<string, string>).Authorization).toBe("Bearer NEW");
    expect(updates).toEqual([{ id: "u1", v: { google_calendar_token: "NEW", google_calendar_token_expiry: new Date(1_000_000 + 3_600_000).toISOString() } }]);
  });

  it("a second 401 after the refresh is not retried again", async () => {
    const { deps, f } = setup(profile, [
      new Response("e", { status: 401 }),
      new Response(JSON.stringify({ access_token: "NEW" }), { status: 200 }),
      new Response("still no", { status: 401 }),
    ]);
    const out = await run(GOOD, deps);
    expect(f).toHaveBeenCalledTimes(3);
    expect(out.status).toBe(502);
  });

  it("refresh failure -> clear 4xx, no retry, nothing saved", async () => {
    const { deps, f, updates } = setup(profile, [
      new Response("expired", { status: 401 }),
      new Response('{"error":"invalid_grant"}', { status: 400 }),
    ]);
    const out = await run(GOOD, deps);
    expect(out).toEqual({ status: 401, body: { error: "Google Calendar access expired. Reconnect it in Settings." } });
    expect(f).toHaveBeenCalledTimes(2);
    expect(updates).toEqual([]);
  });

  it("happy path sends the same body to Google and returns {success:true}", async () => {
    const { deps, f } = setup(profile, [ok()]);
    const out = await run(GOOD, deps);
    expect(out).toEqual({ status: 200, body: { success: true } });
    const [url, init] = f.mock.calls[0];
    expect(url).toBe("https://www.googleapis.com/calendar/v3/calendars/primary/events");
    expect(init!.method).toBe("POST");
    expect((init!.headers as Record<string, string>).Authorization).toBe("Bearer A");
    expect(JSON.parse(init!.body as string)).toEqual({
      summary: "Coffee chat",
      description: "d",
      start: { dateTime: GOOD.start_datetime, timeZone: "America/Denver" },
      end: { dateTime: GOOD.end_datetime, timeZone: "America/Denver" },
    });
  });

  it("defaults timezone to UTC and description to empty", async () => {
    const { deps, f } = setup(profile, [ok()]);
    await run({ title: "t", start_datetime: GOOD.start_datetime, end_datetime: GOOD.end_datetime }, deps);
    const sent = JSON.parse(f.mock.calls[0][1]!.body as string);
    expect(sent.description).toBe("");
    expect(sent.start.timeZone).toBe("UTC");
  });

  it("pre-emptively refreshes a token about to expire", async () => {
    const p = { ...profile, google_calendar_token_expiry: new Date(1_000_000 + 30_000).toISOString() };
    const { deps, f } = setup(p, [new Response(JSON.stringify({ access_token: "FRESH" }), { status: 200 }), ok()]);
    expect((await run(GOOD, deps)).status).toBe(200);
    expect((f.mock.calls[1][1]!.headers as Record<string, string>).Authorization).toBe("Bearer FRESH");
  });

  it("keeps existing errors: profile missing 404, not connected 400, Google refusal 502 with detail", async () => {
    expect((await run(GOOD, setup(null).deps)).status).toBe(404);
    const nc = await run(GOOD, setup({ ...profile, google_calendar_token: null }).deps);
    expect(nc).toEqual({ status: 400, body: { error: "Google Calendar not connected. Connect it in Settings first." } });
    const out = await run(GOOD, setup(profile, [new Response("API disabled", { status: 403 })]).deps);
    expect(out).toEqual({ status: 502, body: { error: "Google Calendar API returned 403", detail: "API disabled" } });
  });
});
