import { describe, expect, it, vi } from "vitest";
import { gmailRefusalReason, processDue, type Deliver } from "./process";

/**
 * The cron's row handling, against an in-memory database shaped like the slice of
 * supabase-js it uses (from / select / update / eq / in / lt / lte / gte / not / limit).
 */
type Row = Record<string, unknown>;
type Tables = Record<string, Row[]>;

type ErrorOn = (table: string, mode: "select" | "update", patch: Row) => string | undefined;
type InCall = { table: string; col: string; values: unknown[] };

function fakeDb(tables: Tables, errorOn: ErrorOn = () => undefined, inCalls: InCall[] = []) {
  const from = (name: string) => {
    let mode: "select" | "update" = "select";
    let patch: Row = {};
    const filters: ((r: Row) => boolean)[] = [];
    let max = Infinity;
    let offset = 0;
    let orderCol: string | null = null;
    const run = () => {
      const err = errorOn(name, mode, patch);
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
      in: (c: string, v: unknown[]) => { inCalls.push({ table: name, col: c, values: v }); filters.push((r) => v.includes(r[c])); return b; },
      lt: (c: string, v: string) => { filters.push((r) => (r[c] as string) < v); return b; },
      lte: (c: string, v: string) => { filters.push((r) => (r[c] as string) <= v); return b; },
      gte: (c: string, v: string) => { filters.push((r) => (r[c] as string) >= v); return b; },
      not: (c: string, _op: string, v: unknown) => { filters.push((r) => r[c] !== v); return b; },
      limit: (n: number) => { max = n; return b; },
      order: (c: string) => { orderCol = c; return b; },
      range: (a: number, z: number) => { offset = a; max = z - a + 1; return b; },
      single: async () => { const r = run(); return { data: r.rows[0] ?? null, error: r.error }; },
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
const ago = (min: number) => new Date(NOW.getTime() - min * 60_000).toISOString();

const row = (over: Row): Row => ({
  id: "r1", owner_id: "gmail-user", contact_id: "c1", channel: "email", subject: "Hi",
  message: "Body", scheduled_at: ago(1), status: "scheduled", failure_reason: null, ...over,
});

const world = (outreach: Row[]): Tables => ({
  scheduled_outreach: outreach,
  profiles: [
    { id: "gmail-user", google_calendar_refresh_token: "rt" },
    { id: "no-gmail-user", google_calendar_refresh_token: null },
    { id: "other-user", google_calendar_refresh_token: "rt2" },
  ],
  contacts: [
    { id: "c1", owner_id: "gmail-user", email: "priya@example.com" },
    { id: "c-theirs", owner_id: "other-user", email: "victim@example.com" },
  ],
});

const okDeliver = (): Deliver => vi.fn(async () => ({ ok: true }) as const);
const get = (t: Tables, id: string) => t.scheduled_outreach.find((r) => r.id === id)!;

describe("processDue", () => {
  it("sends a due row for a Gmail user", async () => {
    const t = world([row({})]);
    const deliver = okDeliver();
    const res = await processDue(fakeDb(t), { now: NOW, deliver });
    expect(res.sent).toBe(1);
    expect(deliver).toHaveBeenCalledWith("rt", "priya@example.com", "Hi", "Body");
    expect(get(t, "r1").status).toBe("sent");
  });

  it("leaves a no-Gmail owner's row scheduled so they can send it by hand (H2)", async () => {
    const t = world([row({ id: "manual", owner_id: "no-gmail-user" })]);
    const deliver = okDeliver();
    const res = await processDue(fakeDb(t), { now: NOW, deliver });
    expect(get(t, "manual").status).toBe("scheduled");
    expect(get(t, "manual").failure_reason).toBeNull();
    expect(deliver).not.toHaveBeenCalled();
    expect(res).toMatchObject({ sent: 0, failed: 0 });
  });

  it("does not let a no-Gmail owner's old rows crowd out others (limit is per eligible rows)", async () => {
    const old = Array.from({ length: 60 }, (_, i) =>
      row({ id: `m${i}`, owner_id: "no-gmail-user", scheduled_at: ago(30 + i) }));
    const t = world([...old, row({ id: "mine" })]);
    await processDue(fakeDb(t), { now: NOW, deliver: okDeliver() });
    expect(get(t, "mine").status).toBe("sent");
  });

  it("refuses a contact that belongs to another user (M1)", async () => {
    const t = world([row({ id: "x", contact_id: "c-theirs" })]);
    const deliver = okDeliver();
    await processDue(fakeDb(t), { now: NOW, deliver });
    expect(deliver).not.toHaveBeenCalled();
    expect(get(t, "x").status).toBe("failed");
    expect(get(t, "x").failure_reason).toBe("Not sent: contact not found");
  });

  it("fails a 'sending' row too old to be legitimately in flight (L1)", async () => {
    const t = world([row({ id: "stuck", status: "sending", scheduled_at: ago(136) })]);
    await processDue(fakeDb(t), { now: NOW, deliver: okDeliver() });
    expect(get(t, "stuck").status).toBe("failed");
    expect(get(t, "stuck").failure_reason).toMatch(/^Not sent: /);
  });

  it("leaves a 'sending' row alone while another tick may still be sending it", async () => {
    // Claimed up to 120 min after its time, so a 20-minute-old scheduled_at proves nothing.
    const t = world([row({ id: "live", status: "sending", scheduled_at: ago(20) })]);
    await processDue(fakeDb(t), { now: NOW, deliver: okDeliver() });
    expect(get(t, "live").status).toBe("sending");
  });

  it("marks a Gmail user's row more than 2 hours late as missed, without sending (L1)", async () => {
    const t = world([row({ id: "late", scheduled_at: ago(121) })]);
    const deliver = okDeliver();
    await processDue(fakeDb(t), { now: NOW, deliver });
    expect(deliver).not.toHaveBeenCalled();
    expect(get(t, "late").status).toBe("missed");
    expect(get(t, "late").failure_reason).toBe("Not sent: it was more than 2 hours late");
  });

  it("leaves a no-Gmail owner's 2-hour-late row scheduled (still theirs to send)", async () => {
    const t = world([row({ id: "old", owner_id: "no-gmail-user", scheduled_at: ago(500) })]);
    await processDue(fakeDb(t), { now: NOW, deliver: okDeliver() });
    expect(get(t, "old").status).toBe("scheduled");
  });

  it("records a short plain reason when Gmail refuses", async () => {
    const t = world([row({})]);
    const deliver: Deliver = vi.fn(async () => ({ ok: false, reason: "Not sent: Gmail refused it (403)" }) as const);
    const res = await processDue(fakeDb(t), { now: NOW, deliver });
    expect(res.failed).toBe(1);
    expect(get(t, "r1")).toMatchObject({ status: "failed", failure_reason: "Not sent: Gmail refused it (403)" });
  });

  it("fails a row whose contact has no email", async () => {
    const t = world([row({})]);
    (t.contacts[0] as Row).email = null;
    await processDue(fakeDb(t), { now: NOW, deliver: okDeliver() });
    expect(get(t, "r1").failure_reason).toBe("Not sent: this contact has no email address");
  });

  it("throws when the profiles query fails, so the cron returns 500", async () => {
    const t = world([row({})]);
    const db = fakeDb(t, (tb) => (tb === "profiles" ? "profiles down" : undefined));
    await expect(processDue(db, { now: NOW, deliver: okDeliver() })).rejects.toThrow("profiles down");
  });

  it("throws when the stuck sweep fails", async () => {
    const t = world([row({})]);
    const db = fakeDb(t, (_t, mode, p) => (mode === "update" && p.status === "failed" ? "sweep down" : undefined));
    await expect(processDue(db, { now: NOW, deliver: okDeliver() })).rejects.toThrow("sweep down");
  });

  it("throws when the missed update fails", async () => {
    const t = world([row({ id: "late", scheduled_at: ago(121) })]);
    const db = fakeDb(t, (_t, mode, p) => (mode === "update" && p.status === "missed" ? "missed down" : undefined));
    await expect(processDue(db, { now: NOW, deliver: okDeliver() })).rejects.toThrow("missed down");
  });

  it("does not overwrite a row the user retried while it was sending", async () => {
    const t = world([row({})]);
    const deliver: Deliver = vi.fn(async () => {
      get(t, "r1").status = "scheduled"; // user pressed Retry mid-send
      return { ok: true } as const;
    });
    await processDue(fakeDb(t), { now: NOW, deliver });
    expect(get(t, "r1").status).toBe("scheduled");
  });

  it("does not write a failure over a row someone else already moved on", async () => {
    const t = world([row({})]);
    const deliver: Deliver = vi.fn(async () => {
      get(t, "r1").status = "failed";
      return { ok: false, reason: "Not sent: nope" } as const;
    });
    await processDue(fakeDb(t), { now: NOW, deliver });
    expect(get(t, "r1").failure_reason).toBeNull();
  });

  it("one thrown network error fails only that row and the batch continues", async () => {
    const t = world([row({ id: "a", scheduled_at: ago(5) }), row({ id: "b", scheduled_at: ago(4) })]);
    const deliver: Deliver = vi.fn(async () => {
      if (deliver.mock.calls.length === 1) throw new Error("fetch failed");
      return { ok: true } as const;
    });
    const res = await processDue(fakeDb(t), { now: NOW, deliver });
    expect(get(t, "a")).toMatchObject({ status: "failed", failure_reason: "Not sent: could not reach Gmail, try again" });
    expect(get(t, "b").status).toBe("sent");
    expect(res).toMatchObject({ sent: 1, failed: 1 });
  });

  it("only looks up tokens for the owners of candidate rows, not every Gmail owner", async () => {
    const t = world([row({}), row({ id: "m", owner_id: "no-gmail-user" })]);
    const calls: InCall[] = [];
    await processDue(fakeDb(t, () => undefined, calls), { now: NOW, deliver: okDeliver() });
    const asked = calls.filter((c) => c.table === "profiles").flatMap((c) => c.values);
    expect(asked.sort()).toEqual(["gmail-user", "no-gmail-user"]);
    expect(asked).not.toContain("other-user");
  });
});

describe("gmailRefusalReason", () => {
  it("uses Google's message, short and human", () => {
    const body = JSON.stringify({ error: { code: 403, message: "Gmail API has not been used in project 1 before.", status: "PERMISSION_DENIED" } });
    expect(gmailRefusalReason(403, body)).toBe("Not sent: Gmail refused it (403: Gmail API has not been used in project 1 before.)");
  });
  it("falls back to error.status, then to the bare code, and never stores raw JSON", () => {
    expect(gmailRefusalReason(401, JSON.stringify({ error: { status: "UNAUTHENTICATED" } }))).toBe("Not sent: Gmail refused it (401: UNAUTHENTICATED)");
    expect(gmailRefusalReason(500, "<html>boom</html>")).toBe("Not sent: Gmail refused it (500)");
  });
  it("caps the message at 120 characters", () => {
    const r = gmailRefusalReason(400, JSON.stringify({ error: { message: "x".repeat(500) } }));
    expect(r).toBe(`Not sent: Gmail refused it (400: ${"x".repeat(120)})`);
  });
});
