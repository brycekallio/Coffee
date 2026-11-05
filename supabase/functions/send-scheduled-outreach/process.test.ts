import { describe, expect, it, vi } from "vitest";
import { processDue, type Deliver } from "./process";

/**
 * The cron's row handling, against an in-memory database shaped like the slice of
 * supabase-js it uses (from / select / update / eq / in / lt / lte / gte / not / limit).
 */
type Row = Record<string, unknown>;
type Tables = Record<string, Row[]>;

function fakeDb(tables: Tables) {
  const from = (name: string) => {
    let mode: "select" | "update" = "select";
    let patch: Row = {};
    const filters: ((r: Row) => boolean)[] = [];
    let max = Infinity;
    const run = () => {
      const hit = tables[name].filter((r) => filters.every((f) => f(r))).slice(0, max);
      if (mode === "update") for (const r of hit) Object.assign(r, patch);
      return hit.map((r) => ({ ...r }));
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
      single: async () => ({ data: run()[0] ?? null, error: null }),
      then: (ok: (v: unknown) => unknown) => Promise.resolve({ data: run(), error: null }).then(ok),
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

  it("fails a stale 'sending' row with a reason (L1)", async () => {
    const t = world([row({ id: "stuck", status: "sending", scheduled_at: ago(20) })]);
    await processDue(fakeDb(t), { now: NOW, deliver: okDeliver() });
    expect(get(t, "stuck").status).toBe("failed");
    expect(get(t, "stuck").failure_reason).toMatch(/^Not sent: /);
  });

  it("leaves a fresh 'sending' row alone", async () => {
    const t = world([row({ id: "live", status: "sending", scheduled_at: ago(3) })]);
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
});
