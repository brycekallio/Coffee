import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { gmailRefusalReason, processDue, type Deliver } from "./process";

/**
 * Break-it pass on the scheduled-outreach cron (2026-11-05).
 *
 * Each test is one attack. Passing tests are regression guards (the attack failed).
 * Tests marked `it.fails` are attacks that SUCCEEDED against the current code: the
 * assertion states the safe behaviour, and it currently does not hold. Do not delete
 * them; when the product code is fixed, vitest will flag them and they flip to `it`.
 *
 * Same in-memory fake db as process.test.ts, plus a hook (`onRun`) that runs before
 * every query so a test can land a user write between the cron's read and its claim.
 */
type Row = Record<string, unknown>;
type Tables = Record<string, Row[]>;
type Mode = "select" | "update";
type OnRun = (table: string, mode: Mode, patch: Row) => string | undefined;

function fakeDb(tables: Tables, onRun: OnRun = () => undefined) {
  const from = (name: string) => {
    let mode: Mode = "select";
    let patch: Row = {};
    const filters: ((r: Row) => boolean)[] = [];
    let max = Infinity;
    let offset = 0;
    let orderCol: string | null = null;
    const run = () => {
      const err = onRun(name, mode, patch);
      if (err) return { rows: [] as Row[], error: { message: err } };
      let hit = tables[name].filter((r) => filters.every((f) => f(r)));
      if (orderCol) hit = [...hit].sort((a, b) => String(a[orderCol!]).localeCompare(String(b[orderCol!])));
      hit = hit.slice(offset, offset + max);
      if (mode === "update") for (const r of hit) Object.assign(r, patch);
      return { rows: hit.map((r) => ({ ...r })), error: null };
    };
    const b: Record<string, unknown> = {
      select: () => b,
      update: (p: Row) => { mode = "update"; patch = p; return b; },
      eq: (c: string, v: unknown) => { filters.push((r) => r[c] === v); return b; },
      in: (c: string, v: unknown[]) => { filters.push((r) => v.includes(r[c])); return b; },
      lt: (c: string, v: string) => { filters.push((r) => (r[c] as string) < v); return b; },
      lte: (c: string, v: string) => { filters.push((r) => (r[c] as string) <= v); return b; },
      gte: (c: string, v: string) => { filters.push((r) => (r[c] as string) >= v); return b; },
      not: (c: string, _op: string, v: unknown) => { filters.push((r) => r[c] !== v); return b; },
      limit: (n: number) => { max = n; return b; },
      order: (c: string) => { orderCol = c; return b; },
      range: (a: number, z: number) => { offset = a; max = z - a + 1; return b; },
      single: async () => { const r = run(); return { data: r.rows[0] ?? null, error: r.error }; },
      maybeSingle: async () => { const r = run(); return { data: r.rows[0] ?? null, error: r.error }; },
      then: (ok: (v: unknown) => unknown) => {
        const r = run();
        return Promise.resolve({ data: r.error ? null : r.rows, error: r.error }).then(ok);
      },
    };
    return b;
  };
  return { from } as never;
}

const NOW = new Date("2026-11-05T12:00:00Z");
const ago = (min: number, from = NOW) => new Date(from.getTime() - min * 60_000).toISOString();
const later = (min: number) => new Date(NOW.getTime() + min * 60_000);

const row = (over: Row): Row => ({
  id: "r1", owner_id: "alice", contact_id: "c-alice", channel: "email", subject: "Hi",
  message: "Body", scheduled_at: ago(1), status: "scheduled", failure_reason: null, ...over,
});

const world = (outreach: Row[]): Tables => ({
  scheduled_outreach: outreach,
  profiles: [
    { id: "alice", google_calendar_refresh_token: "rt-alice", google_gmail_send: true },
    { id: "bob", google_calendar_refresh_token: "rt-bob", google_gmail_send: true },
    { id: "nogmail", google_calendar_refresh_token: null, google_gmail_send: false },
    // Calendar-only connect: a refresh token, but no permission to send. The client opens
    // mailto for these rows, so the cron must leave them alone or the email goes twice.
    { id: "calonly", google_calendar_refresh_token: "rt-cal", google_gmail_send: false },
  ],
  contacts: [
    { id: "c-alice", owner_id: "alice", email: "priya@example.com" },
    { id: "c-bob", owner_id: "bob", email: "bobs-friend@example.com" },
    { id: "c-nogmail", owner_id: "nogmail", email: "x@example.com" },
    { id: "c-calonly", owner_id: "calonly", email: "y@example.com" },
  ],
});

const okDeliver = () => vi.fn<Deliver>(async () => ({ ok: true }) as const);
const get = (t: Tables, id: string) => t.scheduled_outreach.find((r) => r.id === id)!;
const isClaim = (mode: Mode, p: Row) => mode === "update" && p.status === "sending";

/* ── (a) cross-tenant: someone else's contact or Gmail ───────────────────── */

describe("break-it (a): other users' contacts and tokens", () => {
  it("A1 a row pointing at another user's contact is refused, never delivered", async () => {
    const t = world([row({ id: "x", contact_id: "c-bob" })]);
    const deliver = okDeliver();
    await processDue(fakeDb(t), { now: NOW, deliver });
    expect(deliver).not.toHaveBeenCalled();
    expect(get(t, "x").status).toBe("failed");
  });

  it("A2 each row in a mixed batch goes out with its own owner's token only", async () => {
    const t = world([
      row({ id: "a", owner_id: "alice", contact_id: "c-alice", scheduled_at: ago(3) }),
      row({ id: "b", owner_id: "bob", contact_id: "c-bob", scheduled_at: ago(2) }),
      row({ id: "a2", owner_id: "alice", contact_id: "c-bob", scheduled_at: ago(1) }), // alice -> bob's contact
    ]);
    const deliver = okDeliver();
    await processDue(fakeDb(t), { now: NOW, deliver });
    expect(deliver.mock.calls.map((c) => [c[0], c[1]])).toEqual([
      ["rt-alice", "priya@example.com"],
      ["rt-bob", "bobs-friend@example.com"],
    ]);
    expect(get(t, "a2").failure_reason).toBe("Not sent: contact not found");
  });

  it("A3 a no-Gmail owner's row is never sent with another owner's cached token", async () => {
    const t = world([
      row({ id: "a", owner_id: "alice", scheduled_at: ago(2) }),
      row({ id: "n", owner_id: "nogmail", contact_id: "c-nogmail", scheduled_at: ago(1) }),
    ]);
    const deliver = okDeliver();
    await processDue(fakeDb(t), { now: NOW, deliver });
    expect(deliver).toHaveBeenCalledTimes(1);
    expect(get(t, "n").status).toBe("scheduled");
  });

  it("A3b a Calendar-only owner (refresh token, no gmail.send) is never auto-sent: the client sends it by hand", async () => {
    const t = world([row({ id: "c", owner_id: "calonly", contact_id: "c-calonly" })]);
    const deliver = okDeliver();
    await processDue(fakeDb(t), { now: NOW, deliver });
    expect(deliver).not.toHaveBeenCalled();
    expect(get(t, "c").status).toBe("scheduled");
  });

  // SUCCEEDED (Low). The contact's email goes into the To: header unchecked (index.ts
  // encodeMessage joins it raw). An email like "a@x.com\r\nBcc: list@evil.com" or
  // "a@x.com, b@y.com" makes the owner's own Gmail send to extra people. Only the owner
  // can write their contacts (RLS), so this is self-inflicted unless contact emails are
  // ever filled from scraped/enriched data. Fix: validate a single plain address.
  it("A4 a contact email with CRLF or a second address is not handed to Gmail", async () => {
    const t = world([row({})]);
    (t.contacts[0] as Row).email = "priya@example.com\r\nBcc: everyone@evil.example";
    const deliver = okDeliver();
    await processDue(fakeDb(t), { now: NOW, deliver });
    for (const [, to] of deliver.mock.calls) expect(to).not.toMatch(/[\r\n,;]/);
  });
});

/* ── (b) the same row sent twice ─────────────────────────────────────────── */

describe("break-it (b): double sends", () => {
  it("B1 a second tick starting mid-send skips the claimed row", async () => {
    const t = world([row({})]);
    const inner = okDeliver();
    const outer = vi.fn<Deliver>(async () => {
      await processDue(fakeDb(t), { now: NOW, deliver: inner });
      return { ok: true } as const;
    });
    await processDue(fakeDb(t), { now: NOW, deliver: outer });
    expect(outer).toHaveBeenCalledTimes(1);
    expect(inner).not.toHaveBeenCalled();
    expect(get(t, "r1").status).toBe("sent");
  });

  it("B2 two ticks fired together deliver each row once", async () => {
    const t = world([row({ id: "a", scheduled_at: ago(3) }), row({ id: "b", scheduled_at: ago(2) })]);
    const deliver = okDeliver();
    await Promise.all([
      processDue(fakeDb(t), { now: NOW, deliver }),
      processDue(fakeDb(t), { now: NOW, deliver }),
    ]);
    expect(deliver).toHaveBeenCalledTimes(2);
  });

  it("B3 the user's Send (scheduled -> sent) landing between read and claim wins; cron skips", async () => {
    const t = world([row({})]);
    const db = fakeDb(t, (_tb, mode, p) => {
      if (isClaim(mode, p) && get(t, "r1").status === "scheduled") get(t, "r1").status = "sent";
      return undefined;
    });
    const deliver = okDeliver();
    const res = await processDue(db, { now: NOW, deliver });
    expect(deliver).not.toHaveBeenCalled();
    expect(res.skipped).toBe(1);
  });

  it("B4 a delete landing between read and claim is not sent", async () => {
    const t = world([row({})]);
    const db = fakeDb(t, (_tb, mode, p) => {
      if (isClaim(mode, p)) t.scheduled_outreach = t.scheduled_outreach.filter((r) => r.id !== "r1");
      return undefined;
    });
    const deliver = okDeliver();
    await processDue(db, { now: NOW, deliver });
    expect(deliver).not.toHaveBeenCalled();
  });

  // SUCCEEDED (Low-Medium). The cron reads subject/message/scheduled_at, then claims with
  // only `status = 'scheduled'`. If the user's Edit (also guarded on 'scheduled') lands in
  // between -- moving it to tomorrow and rewriting the text -- the claim still matches and
  // the OLD text goes out NOW. Window: the time spent delivering earlier rows in the same
  // batch (up to 49 Gmail round trips). Fix: claim with `.lte('scheduled_at', now)` and
  // return the row's subject/message from the claim (`.select('id, subject, message, contact_id')`).
  it("B5 an Edit that reschedules to tomorrow between read and claim is not sent now", async () => {
    const t = world([row({})]);
    let edited = false;
    const db = fakeDb(t, (_tb, mode, p) => {
      if (isClaim(mode, p) && !edited) {
        edited = true;
        Object.assign(get(t, "r1"), { message: "New text", scheduled_at: later(24 * 60).toISOString() });
      }
      return undefined;
    });
    const deliver = okDeliver();
    await processDue(db, { now: NOW, deliver });
    expect(deliver).not.toHaveBeenCalled();
  });

  it("B6 the stuck sweep on the next tick does not touch a row still being sent", async () => {
    // Claimed at the very edge (119 min late). The next tick (5 min later) must not fail it.
    const t = world([row({ scheduled_at: ago(119) })]);
    let swept: unknown;
    const deliver = vi.fn<Deliver>(async () => {
      await processDue(fakeDb(t), { now: later(5), deliver: okDeliver() });
      swept = get(t, "r1").status;
      return { ok: true } as const;
    });
    await processDue(fakeDb(t), { now: NOW, deliver });
    expect(swept).toBe("sending");
    expect(get(t, "r1").status).toBe("sent");
  });

  it("B7 if marking 'sent' fails after Gmail accepted, later ticks never resend it", async () => {
    const t = world([row({})]);
    let breakSentWrite = true;
    const db = () => fakeDb(t, (_tb, mode, p) =>
      (breakSentWrite && mode === "update" && p.status === "sent" ? "db blip" : undefined));
    const deliver = okDeliver();
    await expect(processDue(db(), { now: NOW, deliver })).rejects.toThrow("db blip");
    breakSentWrite = false;
    for (const m of [5, 10, 60, 180]) await processDue(db(), { now: later(m), deliver });
    expect(deliver).toHaveBeenCalledTimes(1);
    expect(get(t, "r1").status).toBe("failed"); // swept, with "check your Sent folder"
    expect(get(t, "r1").failure_reason).toMatch(/Sent folder/);
  });

  // SUCCEEDED (Low). A throw from deliver is recorded as "could not reach Gmail, try again",
  // but fetch can throw AFTER Gmail accepted the message (connection reset while reading the
  // response). The reason invites Retry, and Retry sends it again. The stuck path already
  // says "Check your Sent folder before retrying"; the thrown path should say the same.
  it("B8 a send that threw (maybe delivered) warns the user to check Sent before retrying", async () => {
    const t = world([row({})]);
    const deliver = vi.fn<Deliver>(async () => { throw new Error("connection reset"); });
    await processDue(fakeDb(t), { now: NOW, deliver });
    expect(get(t, "r1").failure_reason).toMatch(/Sent folder/i);
  });
});

/* ── (c) silently stop sending for everyone ──────────────────────────────── */

describe("break-it (c): one bad row or owner stops everyone", () => {
  it("C1 odd rows (null subject, null contact, blank email, huge body) fail alone; good rows still send", async () => {
    const t = world([
      row({ id: "nocontact", contact_id: null, scheduled_at: ago(9) }),
      row({ id: "ghost", contact_id: "does-not-exist", scheduled_at: ago(8) }),
      row({ id: "nosubj", subject: null, scheduled_at: ago(7) }),
      row({ id: "huge", message: "x".repeat(5_000_000), scheduled_at: ago(6) }),
      row({ id: "good", scheduled_at: ago(5) }),
    ]);
    const deliver = okDeliver();
    const res = await processDue(fakeDb(t), { now: NOW, deliver });
    expect(get(t, "nocontact").status).toBe("failed");
    expect(get(t, "ghost").status).toBe("failed");
    expect(deliver).toHaveBeenCalledWith("rt-alice", "priya@example.com", "(no subject)", "Body");
    expect(get(t, "huge").status).toBe("sent");
    expect(get(t, "good").status).toBe("sent");
    expect(res).toMatchObject({ sent: 3, failed: 2 });
  });

  it("C2 a deliver that throws a non-Error value fails that row only", async () => {
    const t = world([row({ id: "a", scheduled_at: ago(3) }), row({ id: "b", scheduled_at: ago(2) })]);
    let n = 0;
    const deliver = vi.fn<Deliver>(async () => {
      if (n++ === 0) throw "string, not Error";
      return { ok: true } as const;
    });
    await processDue(fakeDb(t), { now: NOW, deliver });
    expect(get(t, "a").status).toBe("failed");
    expect(get(t, "b").status).toBe("sent");
  });

  it("C3 a revoked token for one owner does not stop another owner's send", async () => {
    const t = world([
      row({ id: "a", owner_id: "alice", scheduled_at: ago(3) }),
      row({ id: "b", owner_id: "bob", contact_id: "c-bob", scheduled_at: ago(2) }),
    ]);
    const deliver = vi.fn<Deliver>(async (rt) =>
      rt === "rt-alice" ? { ok: false, reason: "Not sent: Google access was revoked" } : { ok: true });
    await processDue(fakeDb(t), { now: NOW, deliver });
    expect(get(t, "a").status).toBe("failed");
    expect(get(t, "b").status).toBe("sent");
  });

  it("C4 900 old no-Gmail reminders do not starve a Gmail user's due row", async () => {
    const manual = Array.from({ length: 900 }, (_, i) =>
      row({ id: `m${i}`, owner_id: "nogmail", contact_id: "c-nogmail", scheduled_at: ago(30 + i / 10) }));
    const t = world([...manual, row({ id: "mine", scheduled_at: ago(1) })]);
    await processDue(fakeDb(t), { now: NOW, deliver: okDeliver() });
    expect(get(t, "mine").status).toBe("sent");
  });

  // FIXED 2026-11-06 (scan is filtered to Gmail owners). Was: No-Gmail owners' email rows are never moved off 'scheduled', so they
  // pile up forever. `pick` pages at most 10 x 100 rows oldest-first; once 1000+ stale
  // manual reminders are older than a Gmail user's late row, that row is never reached and
  // stays "Due now" on their page indefinitely (it is never sent either, so no harm to the
  // recipient). Fix: filter by Gmail owners in SQL, or exclude no-token owners' ids.
  it("C5 1000+ stale no-Gmail rows do not stop a Gmail user's late row being marked missed", async () => {
    const manual = Array.from({ length: 1001 }, (_, i) =>
      row({ id: `m${i}`, owner_id: "nogmail", contact_id: "c-nogmail", scheduled_at: ago(10_000 + i) }));
    const t = world([...manual, row({ id: "late", scheduled_at: ago(200) })]);
    await processDue(fakeDb(t), { now: NOW, deliver: okDeliver() });
    expect(get(t, "late").status).toBe("missed");
  });

  // FIXED 2026-11-06. Was: same paging cap on the due window: 1000+ no-Gmail rows scheduled in the
  // last 2 hours ahead of a Gmail user's row starve it until it falls out of the window and
  // is marked missed. Needs one person to bulk-schedule 1000 reminders, so unlikely at 12 users.
  it("C6 1000+ no-Gmail rows due in the window do not starve a Gmail user's due row", async () => {
    const manual = Array.from({ length: 1001 }, (_, i) =>
      row({ id: `m${i}`, owner_id: "nogmail", contact_id: "c-nogmail", scheduled_at: ago(100 - i / 100) }));
    const t = world([...manual, row({ id: "mine", scheduled_at: ago(1) })]);
    await processDue(fakeDb(t), { now: NOW, deliver: okDeliver() });
    expect(get(t, "mine").status).toBe("sent");
  });

  // SUCCEEDED (Low). The contact lookup ignores its error, so a transient DB error while
  // reading the contact records "Not sent: contact not found" -- a false, permanent-looking
  // reason (the row is failed; the user must notice and Retry). Fix: on error, throw / fail
  // with a "try again" reason instead of "not found".
  it("C7 a transient contacts-query error is not reported as 'contact not found'", async () => {
    const t = world([row({})]);
    const db = fakeDb(t, (tb) => (tb === "contacts" ? "connection reset" : undefined));
    await processDue(db, { now: NOW, deliver: okDeliver() }).catch(() => undefined);
    expect(get(t, "r1").failure_reason).not.toBe("Not sent: contact not found");
  });
});

/* ── (d) raw Google JSON or tokens leaking into rows ─────────────────────── */

describe("break-it (d): leaks into rows", () => {
  it("D1 a thrown error carrying a token is not written to the row", async () => {
    const t = world([row({})]);
    const deliver = vi.fn<Deliver>(async () => {
      throw new Error('{"access_token":"ya29.SECRET","refresh_token":"1//SECRET"}');
    });
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    await processDue(fakeDb(t), { now: NOW, deliver });
    spy.mockRestore();
    expect(String(get(t, "r1").failure_reason)).not.toMatch(/SECRET|ya29|\{/);
  });

  it("D2 an over-long deliver reason is capped at 200 chars", async () => {
    const t = world([row({})]);
    const deliver = vi.fn<Deliver>(async () => ({ ok: false, reason: "Not sent: " + "y".repeat(5000) }));
    await processDue(fakeDb(t), { now: NOW, deliver });
    expect(String(get(t, "r1").failure_reason).length).toBeLessThanOrEqual(200);
  });

  it("D3 gmailRefusalReason never throws and never returns raw JSON for odd bodies", () => {
    const bodies = [
      "", "null", "[]", "42", '"str"', "{", '{"error":"invalid_grant","error_description":"Bad token ya29.X"}',
      '{"error":{"message":{"nested":"obj"}}}', '{"error":{"message":123,"status":["A"]}}',
      '{"error":null}', "<html><body>502</body></html>", "x".repeat(1_000_000),
    ];
    for (const b of bodies) {
      const r = gmailRefusalReason(500, b);
      expect(r).toMatch(/^Not sent: Gmail refused it \(500(: .*)?\)$/);
      expect(r).not.toMatch(/[{}[\]]|ya29/);
      expect(r.length).toBeLessThanOrEqual(200);
    }
  });

  it("D4 newlines and control whitespace in Google's message are flattened", () => {
    const r = gmailRefusalReason(400, JSON.stringify({ error: { message: "line1\r\n\tline2" } }));
    expect(r).toBe("Not sent: Gmail refused it (400: line1 line2)");
  });
});

/* ── (e) unauthenticated callers (index.ts, Deno.serve stubbed) ──────────── */

describe("break-it (e): the cron secret", () => {
  const env: Record<string, string | undefined> = {};
  let handler: (req: Request) => Promise<Response>;
  const createClient = vi.fn(() => ({}));
  const processDueSpy = vi.fn(async () => ({ sent: 0, failed: 0, skipped: 0, missed: 0 }));

  beforeAll(async () => {
    vi.doMock("https://esm.sh/@supabase/supabase-js@2.89.0", () => ({ createClient }));
    vi.doMock("./process.ts", () => ({ processDue: processDueSpy, gmailRefusalReason: () => "" }));
    vi.stubGlobal("Deno", {
      serve: (h: typeof handler) => { handler = h; },
      env: { get: (k: string) => env[k] },
    });
    await import("./index.ts");
  });
  afterAll(() => { vi.unstubAllGlobals(); vi.doUnmock("./process.ts"); });
  beforeEach(() => { createClient.mockClear(); processDueSpy.mockClear(); });

  const call = (headers: Record<string, string> = {}) =>
    handler(new Request("https://fn.test/send-scheduled-outreach", { method: "POST", headers }));

  const cases: [string, string | undefined, Record<string, string>][] = [
    ["no header", "s3cret-long-value", {}],
    ["empty header", "s3cret-long-value", { "x-cron-secret": "" }],
    ["wrong secret, same length", "s3cret-long-value", { "x-cron-secret": "s3cret-long-valuX" }],
    ["prefix of the secret", "s3cret-long-value", { "x-cron-secret": "s3cret" }],
    ["secret in a different header", "s3cret-long-value", { authorization: "Bearer s3cret-long-value" }],
    ["CRON_SECRET unset, no header", undefined, {}],
    ["CRON_SECRET empty, empty header", "", { "x-cron-secret": "" }],
    ["CRON_SECRET unset, header 'undefined'", undefined, { "x-cron-secret": "undefined" }],
  ];
  for (const [name, secret, headers] of cases) {
    it(`E: ${name} -> 401, no db client, no processing`, async () => {
      env.CRON_SECRET = secret;
      const res = await call(headers);
      expect(res.status).toBe(401);
      expect(createClient).not.toHaveBeenCalled();
      expect(processDueSpy).not.toHaveBeenCalled();
    });
  }

  it("E: the right secret runs one tick", async () => {
    env.CRON_SECRET = "s3cret-long-value";
    const res = await call({ "x-cron-secret": "s3cret-long-value" });
    expect(res.status).toBe(200);
    expect(processDueSpy).toHaveBeenCalledTimes(1);
  });
});
