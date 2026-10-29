import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { useSession } from "@/app/session";
import { invokeAi, PowerTierRequiredError } from "@/features/ai/client";
import { errorMessage, todayISODate } from "@/lib/utils";
import type { Contact, ContactMeeting } from "@/types";
import * as api from "./api";

type MeetingDraft = { meeting_date: string; title: string; notes: string };
export type MeetingField = keyof MeetingDraft;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Meeting notes for one contact: the saved list, an editable draft per meeting with a
 * dirty flag, the "new meeting" draft, and the AI transcript import. Reloads whenever
 * contactId changes.
 */
export function useMeetings(contactId: string) {
  const user = useSession();

  const [meetings, setMeetings] = useState<ContactMeeting[]>([]);
  const [loadingMeetings, setLoadingMeetings] = useState(true);
  const [meetingEdits, setMeetingEdits] = useState<Record<string, MeetingDraft>>({});
  const [meetingDirty, setMeetingDirty] = useState<Record<string, boolean>>({});
  const [meetingSavingId, setMeetingSavingId] = useState("");
  const [meetingDeletingId, setMeetingDeletingId] = useState("");
  const [meetingDraftDate, setMeetingDraftDate] = useState(todayISODate());
  const [meetingDraftTitle, setMeetingDraftTitle] = useState("");

  // setState only after the await, so the effect below can call this directly.
  const fetchMeetings = useCallback(async () => {
    if (!contactId) return;
    try {
      const rows = await api.listMeetings(contactId);
      setMeetings(rows);
      setMeetingEdits(
        Object.fromEntries(
          rows.map((m) => [m.id, { meeting_date: (m.meeting_date ?? "").slice(0, 10), title: m.title ?? "", notes: m.notes ?? "" }]),
        ),
      );
      setMeetingDirty(Object.fromEntries(rows.map((m) => [m.id, false])));
    } catch (e) {
      toast.error(errorMessage(e, "Failed to load meetings."));
      setMeetings([]);
      setMeetingEdits({});
      setMeetingDirty({});
    } finally {
      setLoadingMeetings(false);
    }
  }, [contactId]);

  useEffect(() => {
    void fetchMeetings();
  }, [fetchMeetings]);

  const loadMeetings = useCallback(async () => {
    setLoadingMeetings(true);
    await fetchMeetings();
  }, [fetchMeetings]);

  async function addMeeting() {
    const date = meetingDraftDate.trim() || todayISODate();
    if (!ISO_DATE.test(date)) {
      toast.error("Meeting date must be in YYYY-MM-DD format.");
      return;
    }
    try {
      await api.createMeeting({
        owner_id: user.id,
        contact_id: contactId,
        meeting_date: date,
        title: meetingDraftTitle.trim() || null,
        notes: null,
      });
      setMeetingDraftTitle("");
      await fetchMeetings();
    } catch (e) {
      toast.error(errorMessage(e, "Failed to add meeting."));
    }
  }

  async function saveMeeting(meetingId: string) {
    const draft = meetingEdits[meetingId];
    if (!draft) return;
    const date = draft.meeting_date.trim();
    if (!ISO_DATE.test(date)) {
      toast.error("Meeting date must be in YYYY-MM-DD format.");
      return;
    }

    setMeetingSavingId(meetingId);
    try {
      await api.updateMeeting(meetingId, {
        meeting_date: date,
        title: draft.title.trim() || null,
        notes: draft.notes ?? null,
      });
      await fetchMeetings();
    } catch (e) {
      toast.error(errorMessage(e, "Failed to save meeting notes."));
    } finally {
      setMeetingSavingId("");
    }
  }

  async function deleteMeeting(meetingId: string) {
    if (!window.confirm("Delete this meeting note folder? This cannot be undone.")) return;
    setMeetingDeletingId(meetingId);
    try {
      await api.deleteMeeting(meetingId);
      await fetchMeetings();
    } catch (e) {
      toast.error(errorMessage(e, "Failed to delete meeting."));
    } finally {
      setMeetingDeletingId("");
    }
  }

  function setMeetingField(meetingId: string, key: MeetingField, value: string) {
    setMeetingEdits((prev) => ({
      ...prev,
      [meetingId]: { ...(prev[meetingId] ?? { meeting_date: "", title: "", notes: "" }), [key]: value },
    }));
    setMeetingDirty((prev) => ({ ...prev, [meetingId]: true }));
  }

  /** Runs a pasted transcript through process-meeting-notes and saves the result as a meeting. */
  async function importMeetingFromTranscript(contact: Contact, transcript: string, meetingDate: string, label: string) {
    // invokeAi surfaces the server's own message (a bare invoke only reports
    // "non-2xx status code") and turns the free-tier length cap into a 402.
    let fnData: { suggested_title?: string; formatted_notes?: string };
    try {
      fnData = await invokeAi("process-meeting-notes", {
        transcript,
        contact_name: [contact.first_name, contact.last_name].filter(Boolean).join(" "),
        contact_company: contact.company ?? "",
        meeting_date: meetingDate,
      });
    } catch (e) {
      toast.error(
        e instanceof PowerTierRequiredError ? e.message : `Transcript processing failed: ${errorMessage(e, "Unknown error")}`,
      );
      return;
    }

    try {
      await api.createMeeting({
        owner_id: user.id,
        contact_id: contact.id,
        meeting_date: meetingDate,
        title: label.trim() || fnData.suggested_title || "Meeting",
        notes: fnData.formatted_notes ?? "",
      });
    } catch (e) {
      toast.error(`Failed to save meeting note: ${errorMessage(e, "Unknown error")}`);
      return;
    }
    toast.success("Meeting notes extracted and saved!");
    await fetchMeetings();
  }

  return {
    meetings,
    loadingMeetings,
    loadMeetings,
    meetingEdits,
    meetingDirty,
    meetingSavingId,
    meetingDeletingId,
    meetingDraftDate,
    setMeetingDraftDate,
    meetingDraftTitle,
    setMeetingDraftTitle,
    addMeeting,
    saveMeeting,
    deleteMeeting,
    setMeetingField,
    importMeetingFromTranscript,
  };
}
