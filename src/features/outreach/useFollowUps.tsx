import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { isDemoMode } from "@/demo/mode";
import { createCalendarEvent, initiateGCalOAuth } from "@/lib/googleCalendar";
import { currentUserId } from "@/lib/appSession";
import { todayISODate } from "@/lib/utils";
import type { Contact, Profile, ScheduledOutreach } from "@/types";
import FollowUpPicker from "./FollowUpPicker";
import {
  contactName,
  followUpNote as noteFor,
  isDueFollowUp,
  savePendingFollowUp,
  scheduleFollowUp,
  slotLabel,
  takePendingFollowUp,
  type FollowUpResult,
} from "./followUp";
import { listFollowUpDates, listLastMeetingDates, saveFollowUpReminder } from "./followUpApi";

const deps = { createEvent: createCalendarEvent, saveReminder: saveFollowUpReminder };

function session(): Storage | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

/**
 * "Schedule follow-up" on the Upcoming cards of people due one (30+ days since you last met).
 * Also finishes a follow-up that was waiting on "Connect Google Calendar".
 */
export function useFollowUps(items: ScheduledOutreach[], contacts: Contact[], profile: Profile | null) {
  const [lastMet, setLastMet] = useState<Record<string, string>>({});
  const [followUpAt, setFollowUpAt] = useState<Record<string, string>>({});
  const [userId, setUserId] = useState<string | null>(null);
  const connected = Boolean(profile?.google_connected);

  const ids = [...new Set(items.map((i) => i.contact_id).filter((x): x is string => Boolean(x)))].sort().join(",");

  useEffect(() => {
    void currentUserId().then(setUserId);
  }, []);

  useEffect(() => {
    const list = ids ? ids.split(",") : [];
    let live = true;
    Promise.all([listLastMeetingDates(list), listFollowUpDates(list)])
      .then(([met, at]) => {
        if (!live) return;
        setLastMet(met);
        setFollowUpAt(at);
      })
      .catch(() => { /* the cards still work; they just show no follow-up button */ });
    return () => { live = false; };
  }, [ids]);

  const schedule = useCallback(
    async (contactId: string, mode: "calendar" | "reminder", start: Date): Promise<FollowUpResult> => {
      const out = await scheduleFollowUp(
        { contactId, start, mode, connected, ownContacts: contacts, userId, now: new Date() },
        deps,
      );
      if (out.kind === "scheduled") {
        toast.success("Added to your Google Calendar.");
        setFollowUpAt((m) => ({ ...m, [contactId]: start.toISOString() }));
      } else if (out.kind === "reminded") {
        toast.success(`Follow-up date saved: ${slotLabel(start)}.`);
        setFollowUpAt((m) => ({ ...m, [contactId]: start.toISOString() }));
      } else if (out.kind === "needs_connect") {
        toast.info("Connect Google Calendar to add it, or choose Just remind me.");
      } else {
        toast.error(out.message);
      }
      return out;
    },
    [connected, contacts, userId],
  );

  const connect = useCallback(
    (contactId: string, start: Date) => {
      if (!userId) return;
      const s = session();
      if (s && !isDemoMode) savePendingFollowUp(s, { contactId, start, userId }, new Date());
      initiateGCalOAuth(userId);
    },
    [userId],
  );

  // Back from Google with Calendar connected: finish the follow-up that was waiting.
  useEffect(() => {
    const s = session();
    if (!s || !userId || !connected || contacts.length === 0 || isDemoMode) return;
    const pending = takePendingFollowUp(s, userId, new Date());
    // After the effect, not inside it: schedule() sets state.
    if (pending) void Promise.resolve().then(() => schedule(pending.contactId, "calendar", pending.start));
  }, [userId, connected, contacts.length, schedule]);

  const today = todayISODate();
  const renderFollowUp = (item: ScheduledOutreach) => {
    const c = item.contact_id ? contacts.find((x) => x.id === item.contact_id) : undefined;
    if (!c || !isDueFollowUp(lastMet[c.id], today)) return null;
    return (
      <FollowUpPicker
        name={contactName(c) || "Unnamed"}
        connected={connected}
        onSchedule={(mode, start) => schedule(c.id, mode, start)}
        onConnect={(start) => connect(c.id, start)}
      />
    );
  };

  const followUpNote = (item: ScheduledOutreach) =>
    noteFor(item.contact_id ? followUpAt[item.contact_id] : undefined, new Date());

  return { renderFollowUp, followUpNote };
}
