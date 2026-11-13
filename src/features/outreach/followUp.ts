// "Schedule follow-up" on an Outreach card: the rules, with the calendar and the database passed in
// so they can be tested. FollowUpPicker.tsx is the UI; followUpApi.ts the real writes.
import type { CalendarEventInput } from "@/lib/googleCalendar";
import type { Contact } from "@/types";

/** A contact you haven't met in this many days is due a follow-up. */
export const STALE_DAYS = 30;

const DAY_MS = 86_400_000;

/** Whole days from a YYYY-MM-DD meeting date to `today` (YYYY-MM-DD), or null when they've never met. */
export function daysSinceMet(lastDate: string | undefined | null, today: string): number | null {
  if (!lastDate) return null;
  const ms = new Date(today).getTime() - new Date(lastDate).getTime();
  return Math.max(0, Math.floor(ms / DAY_MS));
}

export function isDueFollowUp(lastDate: string | undefined | null, today: string): boolean {
  return (daysSinceMet(lastDate, today) ?? 0) >= STALE_DAYS;
}

/** Suggested times, local: 9:00, 10:30 and 2:00. */
const SLOT_TIMES: [number, number][] = [[9, 0], [10, 30], [14, 0]];

export interface SlotDay {
  /** "Thu 19" */
  label: string;
  slots: Date[];
}

/** The next `count` weekdays from tomorrow, each with the suggested times. */
export function followUpSlots(now: Date, count = 5): SlotDay[] {
  const out: SlotDay[] = [];
  const day = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  while (out.length < count) {
    day.setDate(day.getDate() + 1);
    const dow = day.getDay();
    if (dow === 0 || dow === 6) continue;
    out.push({
      label: `${day.toLocaleDateString("en-US", { weekday: "short" })} ${day.getDate()}`,
      slots: SLOT_TIMES.map(([h, m]) => new Date(day.getFullYear(), day.getMonth(), day.getDate(), h, m)),
    });
  }
  return out;
}

/** "Thu, Nov 19, 10:30 AM" */
export function slotLabel(d: Date): string {
  return d.toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

/** The line on a card: "Follow-up Thu, Nov 19, 10:30 AM", or null when none is saved or it has passed. */
export function followUpNote(atIso: string | null | undefined, now: Date): string | null {
  if (!atIso) return null;
  const at = new Date(atIso);
  if (Number.isNaN(at.getTime()) || at.getTime() < now.getTime()) return null;
  return `Follow-up ${slotLabel(at)}`;
}

export function contactName(c: Pick<Contact, "first_name" | "last_name">): string {
  return [c.first_name, c.last_name].filter(Boolean).join(" ");
}

/** The event sent through the existing create-calendar-event path. */
export function followUpEventInput(
  contact: Pick<Contact, "first_name" | "last_name" | "company" | "title">,
  start: Date,
  minutes = 30,
): CalendarEventInput {
  const name = contactName(contact);
  const role = [contact.title, contact.company].filter(Boolean).join(" · ");
  return {
    title: name ? `Follow-up with ${name}` : "Follow-up",
    description: [role, "Scheduled from Coffee."].filter(Boolean).join("\n"),
    startDatetime: start.toISOString(),
    endDatetime: new Date(start.getTime() + minutes * 60_000).toISOString(),
  };
}

export interface FollowUpDeps {
  createEvent: (input: CalendarEventInput) => Promise<void>;
  /** Saves the follow-up date on the contact; must throw if no row of this user's matched. */
  saveReminder: (contactId: string, userId: string, atIso: string) => Promise<void>;
}

export type FollowUpResult =
  | { kind: "scheduled"; start: Date }
  | { kind: "reminded"; start: Date }
  | { kind: "needs_connect" }
  | { kind: "error"; message: string };

/**
 * mode "calendar": a Google Calendar event (asks to connect when Calendar isn't connected or has
 * expired). mode "reminder": "Just remind me", the date saved in Coffee only.
 */
export async function scheduleFollowUp(
  args: {
    contactId: string;
    start: Date;
    mode: "calendar" | "reminder";
    connected: boolean;
    ownContacts: Contact[];
    userId: string | null;
    now: Date;
  },
  deps: FollowUpDeps,
): Promise<FollowUpResult> {
  const { contactId, start, mode, connected, ownContacts, userId, now } = args;
  if (!userId) return { kind: "error", message: "You're signed out. Sign in and try again." };
  // Only people from the signed-in user's own list. RLS and the owner_id filter in the write are
  // the other two locks.
  const contact = ownContacts.find((c) => c.id === contactId && c.owner_id === userId);
  if (!contact) return { kind: "error", message: "That person isn't in your Network." };
  if (Number.isNaN(start.getTime()) || start.getTime() <= now.getTime()) {
    return { kind: "error", message: "Pick a time in the future." };
  }
  const atIso = start.toISOString();

  if (mode === "reminder") {
    try {
      await deps.saveReminder(contact.id, userId, atIso);
      return { kind: "reminded", start };
    } catch (e) {
      return { kind: "error", message: e instanceof Error ? e.message : String(e) };
    }
  }

  if (!connected) return { kind: "needs_connect" };
  try {
    await deps.createEvent(followUpEventInput(contact, start));
  } catch (e) {
    const status = (e as { status?: number }).status;
    // create-calendar-event answers 400 "not connected" and 401 "reconnect" (see event.ts).
    if (status === 400 || status === 401) return { kind: "needs_connect" };
    return { kind: "error", message: e instanceof Error ? e.message : String(e) };
  }
  // The event exists; recording the date in Coffee too is a bonus, so its failure isn't the user's problem.
  try {
    await deps.saveReminder(contact.id, userId, atIso);
  } catch {
    /* calendar already has it */
  }
  return { kind: "scheduled", start };
}

// ── Continue after connecting Google ─────────────────────────────────────────────
// Connecting Google leaves the page; the chosen person and slot wait here and are finished on
// return. Session storage, one use, tied to the user, 30 minutes.

type Store = Pick<Storage, "getItem" | "setItem" | "removeItem">;
const PENDING_KEY = "coffee.pendingFollowUp";
const PENDING_TTL_MS = 30 * 60_000;

export function savePendingFollowUp(store: Store, p: { contactId: string; start: Date; userId: string }, now: Date): void {
  store.setItem(PENDING_KEY, JSON.stringify({ c: p.contactId, s: p.start.toISOString(), u: p.userId, t: now.getTime() }));
}

/** Google sent the user back without connecting (Cancel, failed exchange): the waiting pick is void. */
export function clearPendingFollowUp(store: Store): void {
  store.removeItem(PENDING_KEY);
}

export function hasPendingFollowUp(store: Store): boolean {
  return store.getItem(PENDING_KEY) !== null;
}

export function takePendingFollowUp(store: Store, userId: string, now: Date): { contactId: string; start: Date } | null {
  const raw = store.getItem(PENDING_KEY);
  store.removeItem(PENDING_KEY);
  if (!raw) return null;
  try {
    const p = JSON.parse(raw) as { c?: unknown; s?: unknown; u?: unknown; t?: unknown };
    if (p.u !== userId || typeof p.c !== "string" || typeof p.s !== "string" || typeof p.t !== "number") return null;
    if (now.getTime() - p.t > PENDING_TTL_MS) return null;
    const start = new Date(p.s);
    return Number.isNaN(start.getTime()) ? null : { contactId: p.c, start };
  } catch {
    return null;
  }
}
