import Card from "@/components/ui/Card";
import Modal from "@/components/ui/Modal";
import { inputCls } from "@/components/ui/styles";
import { useContacts } from "./contactsContext";
import { useMeetings } from "./meetings/useMeetings";
import { ensureUrl, formatDateLabel } from "@/lib/utils";
import { supabase } from "@/lib/supabase";
import { useState } from "react";
import { toast } from "sonner";

interface ContactDetailsPageProps {
  contactId: string;
  /** Back to the contact list; also called after the contact is deleted. */
  onBack: () => void;
}

export default function ContactDetailsPage({ contactId, onBack }: ContactDetailsPageProps) {
  const { contacts, loading: loadingContacts, editContact: openEdit, deleteContact } = useContacts();
  const selectedContact = contacts.find((c) => c.id === contactId) ?? null;
  const {
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
  } = useMeetings(contactId);
  const [summaryExpanded, setSummaryExpanded] = useState(false);

  // ── Transcript import modal ──────────────────────────────
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [importTranscript, setImportTranscript] = useState("");
  const [importDate, setImportDate] = useState(new Date().toISOString().slice(0, 10));
  const [importLabel, setImportLabel] = useState("");
  const [importing, setImporting] = useState(false);

  async function handleImportTranscript() {
    if (!selectedContact || !importTranscript.trim()) {
      toast.error("Paste a meeting transcript first.");
      return;
    }
    setImporting(true);
    try {
      await importMeetingFromTranscript(
        selectedContact,
        importTranscript,
        importDate,
        importLabel,
      );
      setImportModalOpen(false);
      setImportTranscript("");
      setImportLabel("");
      setImportDate(new Date().toISOString().slice(0, 10));
    } finally {
      setImporting(false);
    }
  }
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summary, setSummary] = useState<string>("");
  const [summaryError, setSummaryError] = useState("");

  async function loadSummary() {
    if (!selectedContact || summaryLoading) return;

    setSummaryLoading(true);
    setSummaryError("");
    try {
      const { data, error } = await supabase.functions.invoke("summarize-contact", {
        body: {
          contact: selectedContact,
          meetings: meetings.map((m) => ({
            id: m.id,
            meeting_date: m.meeting_date,
            title: m.title,
            notes: m.notes,
          })),
        },
      });

      if (error) throw error;
      setSummary(data.summary);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to generate summary";
      setSummaryError(message);
      toast.error(message);
    } finally {
      setSummaryLoading(false);
    }
  }

  function handleSummaryToggle() {
    if (!summaryExpanded && !summary) {
      loadSummary();
    }
    setSummaryExpanded(!summaryExpanded);
  }

  return (
    <div className="mx-auto max-w-7xl px-4 pb-10 md:px-6">
      {!selectedContact && loadingContacts ? (
        // Opened straight from a URL: the list is still loading, so "not found" would be a lie.
        <div className="flex justify-center py-24" role="status" aria-label="Loading">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-glow/20 border-t-glow/70" />
        </div>
      ) : !selectedContact ? (
        <Card
          title="Connection not found"
          subtitle="This can happen if the person was deleted or hasn't loaded yet."
          right={
            <button
              onClick={onBack}
              className="rounded-button bg-white/[0.04] px-3 py-2 text-sm font-medium text-white/60 transition-colors hover:bg-white/[0.08] hover:text-white cursor-pointer"
            >
              Back
            </button>
          }
        >
          <p className="text-sm text-white/40">
            Like a conversation you forgot to save. Return to Network and try again.
          </p>
        </Card>
      ) : (
        <div className="grid gap-6 lg:grid-cols-3">
          {/* Contact info — 1/3 */}
          <div className="lg:col-span-1">
            <Card
              title="Contact details"
              right={
                <button
                  onClick={onBack}
                  className="flex items-center gap-1.5 rounded-button bg-white/[0.04] px-3 py-2 text-sm font-medium text-white/60 transition-colors hover:bg-white/[0.08] hover:text-white cursor-pointer"
                >
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                  </svg>
                  Back
                </button>
              }
            >
              <div className="grid gap-3">
                <div className="grid gap-2 text-sm">
                  <div className="rounded-input bg-depth-0/30 p-3">
                    <div className="text-xs text-white/30">Email</div>
                    <div className="mt-1 font-data text-white/60">{selectedContact.email ?? "\u2014"}</div>
                  </div>
                  <div className="rounded-input bg-depth-0/30 p-3">
                    <div className="text-xs text-white/30">Phone</div>
                    <div className="mt-1 font-data text-white/60">{selectedContact.phone ?? "\u2014"}</div>
                  </div>
                  <div className="rounded-input bg-depth-0/30 p-3">
                    <div className="text-xs text-white/30">LinkedIn</div>
                    <div className="mt-1">
                      {selectedContact.linkedin_url ? (
                        <a
                          className="text-sm font-medium text-glow hover:underline"
                          href={ensureUrl(selectedContact.linkedin_url)}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Open profile
                        </a>
                      ) : (
                        <span className="text-white/60">{"\u2014"}</span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="mt-2 flex items-center gap-2">
                  <button
                    onClick={() => openEdit(selectedContact)}
                    className="w-full rounded-button bg-white/[0.04] px-4 py-2.5 text-sm font-medium text-white/60 transition-colors hover:bg-white/[0.08] hover:text-white cursor-pointer"
                  >
                    Edit Contact
                  </button>
                  <button
                    onClick={async () => {
                      if (await deleteContact(selectedContact.id)) onBack();
                    }}
                    className="w-full rounded-button bg-danger/[0.06] px-4 py-2.5 text-sm font-medium text-danger/70 transition-colors hover:bg-danger/10 hover:text-danger cursor-pointer"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </Card>

            {/* AI Summary */}
            <Card title="AI summary" subtitle="A short brief from your notes on this person.">
              <div className="grid gap-3">
                {summaryExpanded ? (
                  <>
                    {summaryLoading ? (
                      <div className="rounded-input bg-depth-1/40 p-4">
                        <div className="flex items-center gap-3">
                          <div className="h-4 w-4 animate-spin rounded-full border-2 border-glow/30 border-t-glow" />
                          <span className="text-sm text-white/60">Generating summary...</span>
                        </div>
                      </div>
                    ) : summaryError ? (
                      <div className="rounded-input bg-danger/[0.08] p-4">
                        <p className="text-sm text-danger/70">{summaryError}</p>
                      </div>
                    ) : summary ? (
                      <div className="rounded-input bg-depth-2/60 border-l-4 border-glow p-4">
                        <p className="text-sm leading-relaxed text-white">{summary}</p>
                      </div>
                    ) : null}

                    <button
                      onClick={handleSummaryToggle}
                      disabled={summaryLoading}
                      className="w-full rounded-button bg-white/[0.04] px-4 py-2.5 text-sm font-medium text-white/60 transition-colors hover:bg-white/[0.08] disabled:opacity-50 cursor-pointer"
                    >
                      {summaryLoading ? "Generating..." : "Collapse"}
                    </button>
                  </>
                ) : (
                  <button
                    onClick={handleSummaryToggle}
                    className="w-full rounded-button bg-white/[0.08] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-white/[0.12] cursor-pointer"
                  >
                    Generate Summary
                  </button>
                )}
              </div>
            </Card>
          </div>

          {/* Meeting notes — 2/3 */}
          <div className="lg:col-span-2">
            <Card
              title="Meeting notes"
              subtitle="Each meeting is a folder labeled by date."
              right={
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setImportModalOpen(true)}
                    className="flex items-center gap-1.5 rounded-button bg-white/[0.06] px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-white/[0.1] cursor-pointer"
                  >
                    {/* Sparkle icon */}
                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z" />
                    </svg>
                    Import from transcript
                  </button>
                  <button
                    onClick={loadMeetings}
                    className="rounded-button bg-white/[0.04] px-3 py-2 text-sm font-medium text-white/60 transition-colors hover:bg-white/[0.08] hover:text-white cursor-pointer"
                  >
                    Refresh
                  </button>
                </div>
              }
            >
              {/* Add meeting form */}
              <div className="rounded-input bg-depth-0/30 p-4">
                <div className="grid gap-3 md:grid-cols-3 md:items-end">
                  <div>
                    <div className="mb-1 text-xs font-medium text-white/35">Meeting date</div>
                    <input className={inputCls} type="date" value={meetingDraftDate} onChange={(e) => setMeetingDraftDate(e.target.value)} />
                  </div>
                  <div className="md:col-span-2">
                    <div className="mb-1 text-xs font-medium text-white/35">Label (optional)</div>
                    <input
                      className={inputCls}
                      placeholder='e.g. "Coffee chat" or "Follow-up call"'
                      value={meetingDraftTitle}
                      onChange={(e) => setMeetingDraftTitle(e.target.value)}
                    />
                  </div>
                </div>

                <div className="mt-3 flex justify-end">
                  <button
                    onClick={addMeeting}
                    className="rounded-button bg-glow/90 px-4 py-2.5 text-sm font-semibold text-depth-0 transition hover:bg-glow cursor-pointer"
                  >
                    Add meeting
                  </button>
                </div>
              </div>

              {/* Meeting list */}
              <div className="mt-4 rounded-section bg-depth-0/30">
                {loadingMeetings ? (
                  <div className="px-4 py-8 text-center text-sm text-white/40">Loading meetings...</div>
                ) : meetings.length === 0 ? (
                  <div className="px-6 py-10 text-center">
                    <p className="text-sm text-white/50">No meetings logged yet.</p>
                    <p className="mt-1 text-xs text-white/25">
                      Every great relationship started with one conversation.
                    </p>
                  </div>
                ) : (
                  <div className="divide-y divide-white/[0.04]">
                    {meetings.map((m) => {
                      const draft = meetingEdits[m.id] ?? {
                        meeting_date: (m.meeting_date ?? "").slice(0, 10),
                        title: m.title ?? "",
                        notes: m.notes ?? "",
                      };
                      const isDirty = !!meetingDirty[m.id];
                      const saving = meetingSavingId === m.id;
                      const deleting = meetingDeletingId === m.id;

                      return (
                        <div key={m.id} className="p-4">
                          <div className="flex flex-col gap-3 md:flex-row md:flex-wrap md:items-center md:justify-between">
                            <div className="flex flex-1 flex-col gap-2 md:min-w-0 md:flex-row md:items-center">
                              <div className="inline-flex shrink-0 items-center gap-2 rounded-badge bg-glow/[0.06] px-3 py-1.5 text-xs font-medium text-glow/80">
                                <span className="h-1.5 w-1.5 rounded-full bg-glow" />
                                <span className="font-data">{formatDateLabel(draft.meeting_date || m.meeting_date)}</span>
                              </div>

                              <input
                                className={`${inputCls} w-full md:w-auto md:flex-1`}
                                placeholder="Optional label"
                                value={draft.title}
                                onChange={(e) => setMeetingField(m.id, "title", e.target.value)}
                              />
                            </div>

                            <div className="flex shrink-0 items-center gap-2">
                              <input
                                className={`${inputCls} w-36`}
                                type="date"
                                value={draft.meeting_date}
                                onChange={(e) => setMeetingField(m.id, "meeting_date", e.target.value)}
                                title="Meeting date"
                              />

                              <button
                                onClick={() => saveMeeting(m.id)}
                                disabled={!isDirty || saving}
                                className="rounded-button bg-white/[0.04] px-3 py-2 text-sm font-medium text-white/60 transition-colors hover:bg-white/[0.08] disabled:opacity-30 cursor-pointer"
                              >
                                {saving ? "Saving..." : isDirty ? "Save" : "Saved"}
                              </button>

                              <button
                                onClick={() => deleteMeeting(m.id)}
                                disabled={deleting}
                                className="rounded-button bg-danger/[0.06] px-3 py-2 text-sm font-medium text-danger/70 transition-colors hover:bg-danger/10 disabled:opacity-30 cursor-pointer"
                              >
                                {deleting ? "..." : "Delete"}
                              </button>
                            </div>
                          </div>

                          <div className="mt-3">
                            <textarea
                              className="min-h-[160px] w-full rounded-input bg-white/[0.03] px-3 py-2.5 text-sm text-white placeholder:text-white/20 outline-none transition duration-200 border border-white/[0.04] focus:border-glow/20 focus:bg-white/[0.05] focus:ring-1 focus:ring-glow/10"
                              placeholder="What you discussed, next steps, reminders, personal details, follow-ups..."
                              value={draft.notes}
                              onChange={(e) => setMeetingField(m.id, "notes", e.target.value)}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </Card>
          </div>
        </div>
      )}

      {/* ── Transcript Import Modal ── */}
      <Modal
        title="Import from Transcript"
        open={importModalOpen}
        onClose={() => !importing && setImportModalOpen(false)}
      >
        <div className="grid gap-4">
          <p className="text-sm text-white/50 leading-relaxed">
            Paste a transcript from{" "}
            <span className="text-white/70 font-medium">Otter.ai, Granola, Zoom AI, Fathom, Fireflies</span>
            {" "}or any other tool. Claude will extract the key details and save them as a structured meeting note.
          </p>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <div className="mb-1 text-xs font-medium text-white/35">Meeting date</div>
              <input
                type="date"
                className="w-full rounded-input bg-white/[0.04] px-3 py-2.5 text-sm text-white outline-none border border-white/[0.06] focus:border-glow/30"
                value={importDate}
                onChange={(e) => setImportDate(e.target.value)}
              />
            </div>
            <div>
              <div className="mb-1 text-xs font-medium text-white/35">Label (optional)</div>
              <input
                className="w-full rounded-input bg-white/[0.04] px-3 py-2.5 text-sm text-white placeholder:text-white/25 outline-none border border-white/[0.06] focus:border-glow/30"
                placeholder='e.g. "Coffee chat"'
                value={importLabel}
                onChange={(e) => setImportLabel(e.target.value)}
              />
            </div>
          </div>

          <div>
            <div className="mb-1 text-xs font-medium text-white/35">Transcript</div>
            <textarea
              className="min-h-[200px] w-full rounded-input bg-white/[0.03] px-3 py-2.5 text-sm text-white placeholder:text-white/20 outline-none border border-white/[0.06] focus:border-glow/20 resize-y"
              placeholder="Paste your full meeting transcript here..."
              value={importTranscript}
              onChange={(e) => setImportTranscript(e.target.value)}
            />
          </div>

          {/* What Claude extracts */}
          <div className="rounded-input bg-depth-0/40 px-4 py-3 text-xs text-white/40 space-y-1">
            <div className="font-medium text-white/50 mb-1.5">Claude will extract:</div>
            <div className="flex items-center gap-2"><span aria-hidden="true" className="mt-[7px] h-1.5 w-1.5 flex-none rounded-full bg-white/50" /><span>Fun facts — memorable personal details about {selectedContact ? [selectedContact.first_name, selectedContact.last_name].filter(Boolean).join(" ") : "your contact"}</span></div>
            <div className="flex items-center gap-2"><span aria-hidden="true" className="mt-[7px] h-1.5 w-1.5 flex-none rounded-full bg-white/50" /><span>Action items — specific follow-ups you need to do</span></div>
            <div className="flex items-center gap-2"><span aria-hidden="true" className="mt-[7px] h-1.5 w-1.5 flex-none rounded-full bg-white/50" /><span>Important details — professional context worth remembering</span></div>
          </div>

          <div className="flex gap-3">
            <button
              onClick={() => setImportModalOpen(false)}
              disabled={importing}
              className="flex-1 rounded-button bg-white/[0.04] px-4 py-2.5 text-sm font-medium text-white/60 transition-colors hover:bg-white/[0.08] disabled:opacity-50 cursor-pointer"
            >
              Cancel
            </button>
            <button
              onClick={handleImportTranscript}
              disabled={importing || !importTranscript.trim()}
              className="flex-1 rounded-button bg-glow/90 px-4 py-2.5 text-sm font-semibold text-depth-0 transition hover:bg-glow disabled:opacity-50 cursor-pointer"
            >
              {importing ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-depth-0/30 border-t-depth-0" />
                  Extracting...
                </span>
              ) : (
                "Extract & Save"
              )}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
