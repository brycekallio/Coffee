import { describe, expect, it, vi } from "vitest";
import {
  STALE_DAYS,
  daysSinceMet,
  followUpEventInput,
  followUpSlots,
  isDueFollowUp,
  savePendingFollowUp,
  scheduleFollowUp,
  slotLabel,
  takePendingFollowUp,
  type FollowUpDeps,
} from "./followUp";
import type { Contact } from "@/types";

const ME = "11111111-1111-4111-8111-111111111111";
const THEM = "22222222-2222-4222-8222-222222222222";

const hannah: Contact = {
  id: "c-hannah", owner_id: ME, first_name: "Hannah", last_name: "Weiss", company: "Goldman Sachs",
  title: "Analyst, Investment Banking", email: null, phone: null, linkedin_url: null, status: "to_contact",
  created_at: null, starred: false, tags: [],
};
const theirs: Contact = { ...hannah, id: "c-theirs", owner_id: THEM, first_name: "Other" };

// Wed 11 Nov 2026, 15:00 local.
const NOW = new Date(2026, 10, 11, 15, 0);
const THU_1030 = new Date(2026, 10, 19, 10, 30);

function deps(over: Partial<FollowUpDeps> = {}): FollowUpDeps & { createEvent: ReturnType<typeof vi.fn>; saveReminder: ReturnType<typeof vi.fn> } {
  return {
    createEvent: vi.fn(async () => {}),
    saveReminder: vi.fn(async () => {}),
    ...over,
  } as never;
}

describe("who is due a follow-up", () => {
  it("is due at 30+ days since the last meeting, not before, and never without a meeting", () => {
    expect(STALE_DAYS).toBe(30);
    expect(daysSinceMet("2026-10-12", "2026-11-11")).toBe(30);
    expect(isDueFollowUp("2026-10-12", "2026-11-11")).toBe(true);
    expect(isDueFollowUp("2026-10-13", "2026-11-11")).toBe(false);
    expect(daysSinceMet(undefined, "2026-11-11")).toBeNull();
    expect(isDueFollowUp(undefined, "2026-11-11")).toBe(false);
  });
});

describe("slot picker", () => {
  it("offers the next five weekdays from tomorrow at 9:00, 10:30 and 2:00", () => {
    const days = followUpSlots(NOW);
    expect(days.map((d) => d.label)).toEqual(["Thu 12", "Fri 13", "Mon 16", "Tue 17", "Wed 18"]);
    expect(days[0].slots.map((s) => [s.getHours(), s.getMinutes()])).toEqual([[9, 0], [10, 30], [14, 0]]);
  });

  it("skips the weekend when today is Friday", () => {
    const days = followUpSlots(new Date(2026, 10, 13, 9, 0));
    expect(days.map((d) => d.label)).toEqual(["Mon 16", "Tue 17", "Wed 18", "Thu 19", "Fri 20"]);
  });

  it("labels a slot the way the confirmation reads", () => {
    expect(slotLabel(THU_1030)).toBe("Thu, Nov 19, 10:30 AM");
  });
});

describe("slot -> calendar event payload", () => {
  it("names the person, runs 30 minutes, and uses ISO times", () => {
    const ev = followUpEventInput(hannah, THU_1030);
    expect(ev.title).toBe("Follow-up with Hannah Weiss");
    expect(ev.description).toContain("Analyst, Investment Banking · Goldman Sachs");
    expect(ev.startDatetime).toBe(THU_1030.toISOString());
    expect(new Date(ev.endDatetime!).getTime() - THU_1030.getTime()).toBe(30 * 60_000);
  });

  it("falls back when the contact has no name", () => {
    expect(followUpEventInput({ ...hannah, first_name: null, last_name: null }, THU_1030).title).toBe("Follow-up");
  });
});

describe("scheduleFollowUp", () => {
  const base = { contactId: hannah.id, start: THU_1030, ownContacts: [hannah], userId: ME, now: NOW };

  it("connected: creates the calendar event through the existing path and records the date", async () => {
    const d = deps();
    const out = await scheduleFollowUp({ ...base, mode: "calendar", connected: true }, d);
    expect(out).toEqual({ kind: "scheduled", start: THU_1030 });
    expect(d.createEvent).toHaveBeenCalledWith(followUpEventInput(hannah, THU_1030));
    expect(d.saveReminder).toHaveBeenCalledWith(hannah.id, ME, THU_1030.toISOString());
  });

  it("connected: still reports the event when recording the date fails", async () => {
    const d = deps({ saveReminder: vi.fn(async () => { throw new Error("db down"); }) });
    const out = await scheduleFollowUp({ ...base, mode: "calendar", connected: true }, d);
    expect(out.kind).toBe("scheduled");
  });

  it("not connected: asks to connect and creates nothing", async () => {
    const d = deps();
    const out = await scheduleFollowUp({ ...base, mode: "calendar", connected: false }, d);
    expect(out).toEqual({ kind: "needs_connect" });
    expect(d.createEvent).not.toHaveBeenCalled();
    expect(d.saveReminder).not.toHaveBeenCalled();
  });

  it("a calendar that says reconnect (400 not connected / 401 expired) asks to connect", async () => {
    for (const status of [400, 401]) {
      const err = Object.assign(new Error("Google Calendar access expired"), { status });
      const d = deps({ createEvent: vi.fn(async () => { throw err; }) });
      expect(await scheduleFollowUp({ ...base, mode: "calendar", connected: true }, d)).toEqual({ kind: "needs_connect" });
      expect(d.saveReminder).not.toHaveBeenCalled();
    }
  });

  it("any other calendar failure is an error, and nothing is recorded", async () => {
    const d = deps({ createEvent: vi.fn(async () => { throw Object.assign(new Error("Google Calendar API returned 403"), { status: 502 }); }) });
    const out = await scheduleFollowUp({ ...base, mode: "calendar", connected: true }, d);
    expect(out).toEqual({ kind: "error", message: "Google Calendar API returned 403" });
    expect(d.saveReminder).not.toHaveBeenCalled();
  });

  it("just remind me: saves the date in Coffee and never touches the calendar", async () => {
    const d = deps();
    const out = await scheduleFollowUp({ ...base, mode: "reminder", connected: false }, d);
    expect(out).toEqual({ kind: "reminded", start: THU_1030 });
    expect(d.saveReminder).toHaveBeenCalledWith(hannah.id, ME, THU_1030.toISOString());
    expect(d.createEvent).not.toHaveBeenCalled();
  });

  it("just remind me: a failed save is an error", async () => {
    const d = deps({ saveReminder: vi.fn(async () => { throw new Error("No contact of yours matched."); }) });
    expect(await scheduleFollowUp({ ...base, mode: "reminder", connected: false }, d)).toEqual({ kind: "error", message: "No contact of yours matched." });
  });

  it("refuses a time in the past", async () => {
    const d = deps();
    const out = await scheduleFollowUp({ ...base, start: new Date(2026, 10, 11, 14, 0), mode: "reminder", connected: true }, d);
    expect(out.kind).toBe("error");
    expect(d.saveReminder).not.toHaveBeenCalled();
  });

  describe("scoping: only the signed-in user's own contacts", () => {
    it("refuses a contact id that is not in the user's own list (no event, no write)", async () => {
      for (const mode of ["calendar", "reminder"] as const) {
        const d = deps();
        const out = await scheduleFollowUp({ ...base, contactId: "c-forged", mode, connected: true }, d);
        expect(out.kind).toBe("error");
        expect(d.createEvent).not.toHaveBeenCalled();
        expect(d.saveReminder).not.toHaveBeenCalled();
      }
    });

    it("refuses another user's contact even if it slipped into the list", async () => {
      const d = deps();
      const out = await scheduleFollowUp({ ...base, contactId: theirs.id, ownContacts: [hannah, theirs], mode: "calendar", connected: true }, d);
      expect(out.kind).toBe("error");
      expect(d.createEvent).not.toHaveBeenCalled();
    });

    it("refuses when there is no signed-in user", async () => {
      const d = deps();
      const out = await scheduleFollowUp({ ...base, userId: null, mode: "reminder", connected: true }, d);
      expect(out.kind).toBe("error");
      expect(d.saveReminder).not.toHaveBeenCalled();
    });
  });
});

describe("continue after connecting Google", () => {
  function memStore() {
    const m = new Map<string, string>();
    return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) };
  }

  it("round-trips the chosen contact and slot once, for the same user", () => {
    const s = memStore();
    savePendingFollowUp(s, { contactId: hannah.id, start: THU_1030, userId: ME }, NOW);
    expect(takePendingFollowUp(s, ME, NOW)).toEqual({ contactId: hannah.id, start: THU_1030 });
    expect(takePendingFollowUp(s, ME, NOW)).toBeNull();
  });

  it("is dropped for a different user, after 30 minutes, or when garbled", () => {
    const s = memStore();
    savePendingFollowUp(s, { contactId: hannah.id, start: THU_1030, userId: ME }, NOW);
    expect(takePendingFollowUp(s, THEM, NOW)).toBeNull();
    savePendingFollowUp(s, { contactId: hannah.id, start: THU_1030, userId: ME }, NOW);
    expect(takePendingFollowUp(s, ME, new Date(NOW.getTime() + 31 * 60_000))).toBeNull();
    s.setItem("coffee.pendingFollowUp", "{not json");
    expect(takePendingFollowUp(s, ME, NOW)).toBeNull();
  });
});

describe("Codex r1 findings", () => {
  it("a picked time that is exactly midnight UTC (5 PM in Denver) keeps its time on the card", async () => {
    const { followUpNote } = await import("./followUp");
    const at = new Date("2026-11-20T00:00:00.000Z");
    expect(followUpNote(at.toISOString(), new Date("2026-11-12T00:00:00Z"))).toBe(`Follow-up ${slotLabel(at)}`);
    expect(followUpNote(at.toISOString(), new Date("2026-11-21T00:00:00Z"))).toBeNull();
    expect(followUpNote(null, NOW)).toBeNull();
  });

  it("a cancelled or failed Google return drops the waiting follow-up", async () => {
    const { clearPendingFollowUp } = await import("./followUp");
    const m = new Map<string, string>();
    const s = { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) };
    savePendingFollowUp(s, { contactId: hannah.id, start: THU_1030, userId: ME }, NOW);
    clearPendingFollowUp(s);
    expect(takePendingFollowUp(s, ME, NOW)).toBeNull();
  });
});
