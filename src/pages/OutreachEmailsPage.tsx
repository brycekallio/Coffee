import { useEffect, useState, useCallback } from "react";
import { supabase } from "../lib/supabase";
import { currentUserId } from "../lib/appSession";
import { createCalendarEvent } from "../lib/googleCalendar";
import type { TablesUpdate } from "@/lib/database.types";
import type { Contact, ScheduledOutreach, WatchlistTarget } from "../types";
import { useProfile } from "@/features/profile/profileContext";
import Card from "../components/ui/Card";
import Modal from "../components/ui/Modal";
import { toast } from "sonner";
import { DEMO_READ_ONLY_MESSAGE, isDemoMode } from "../demo/mode";
import { fetchLinkedInPreview, personalizeOutreach } from "../lib/resumeUtils";
import { fetchAiStatus, PowerTierRequiredError } from "../features/ai/client";
import { useContacts } from "@/features/contacts/contactsContext";
import { getOutreachStatus, updateIfStatus } from "@/features/outreach/api";
import { buildMailto, movedOnMessage } from "@/features/outreach/format";
import ScheduleForm from "@/features/outreach/ScheduleForm";
import NotSentCard from "@/features/outreach/NotSentCard";
import { UpcomingCard, HistoryCard } from "@/features/outreach/OutreachList";

/* ── Templates ────────────────────────────────────────── */

const TEMPLATES: {
  key: string;
  title: string;
  description: string;
  subject: string;
  message: string;
}[] = [
  {
    key: "introduction",
    title: "Introduction",
    description: "Cold outreach introducing yourself and your background.",
    subject: "Introduction \u2014 {name}, nice to connect!",
    message:
      "Hi {name},\n\nMy name is [Your Name] and I came across your profile at {company}. I'm very interested in the work your team is doing and would love to learn more about your experience there.\n\nWould you be open to a brief conversation? I'd really appreciate any insights you might share.\n\nBest regards,\n[Your Name]",
  },
  {
    key: "coffee_chat",
    title: "Coffee Chat Request",
    description: "Ask a contact to meet for coffee or a virtual chat.",
    subject: "Coffee chat? \u2014 would love to hear about {company}",
    message:
      "Hi {name},\n\nI hope this message finds you well! I've been exploring opportunities in the {company} space and would love to pick your brain over a quick coffee (virtual or in-person).\n\nWould you have 20-30 minutes sometime this week or next? I'm happy to work around your schedule.\n\nThanks so much,\n[Your Name]",
  },
  {
    key: "follow_up",
    title: "Follow Up",
    description: "Follow up after an initial meeting or conversation.",
    subject: "Great chatting \u2014 following up, {name}",
    message:
      "Hi {name},\n\nIt was great speaking with you recently. I really enjoyed learning more about your role at {company} and the insights you shared.\n\nI wanted to follow up on a few points from our conversation and see if there are any next steps I can take. Please let me know if there's anything I can do on my end.\n\nLooking forward to staying in touch!\n\nBest,\n[Your Name]",
  },
  {
    key: "thank_you",
    title: "Thank You",
    description: "Say thanks after a meeting, call, or referral.",
    subject: "Thank you, {name}!",
    message:
      "Hi {name},\n\nThank you so much for taking the time to chat with me. I really appreciate the advice and perspective you shared about {company} and the industry.\n\nYour guidance has been incredibly helpful, and I'll be sure to keep you posted on how things progress.\n\nWarmly,\n[Your Name]",
  },
];


/* ── Deep link helpers ────────────────────────────────── */

function openOutreach(
  channel: string,
  contact: Contact | null,
  subject: string,
  message: string,
) {
  // The demo never hands a draft to the visitor's mail or Messages app: the sample
  // contacts aren't real people to write to. The demo turns this into its sign-up toast.
  if (isDemoMode) {
    toast.error(DEMO_READ_ONLY_MESSAGE);
    return;
  }
  if (channel === "email") {
    window.open(buildMailto(contact?.email ?? "", subject, message), "_self");
  } else if (channel === "sms") {
    // Clipboard as well as the deep link: the sms: scheme drops long bodies and
    // newlines on some clients, and a half-pasted message is worse than none.
    void navigator.clipboard.writeText(message).catch(() => {});
    toast.success("Message copied. In Messages you can hold Send to schedule it.");
    const sms = `sms:${contact?.phone ?? ""}&body=${encodeURIComponent(message)}`;
    window.open(sms, "_self");
  }
}

/* ── Component ────────────────────────────────────────── */

export default function OutreachEmailsPage() {
  const { profile } = useProfile();
  const { contacts } = useContacts();
  /* ── compose state ──────────────────────────────────── */
  const [selectedContactId, setSelectedContactId] = useState("");
  const [channel, setChannel] = useState<string>("email");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");

  /* ── CRUD state ─────────────────────────────────────── */
  const [items, setItems] = useState<ScheduledOutreach[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  /* ── templates toggle ───────────────────────────────── */
  const [showTemplates, setShowTemplates] = useState(false);

  /* ── AI personalization ─────────────────────────────── */
  const [personalizing, setPersonalizing] = useState(false);
  // Personalization is a power-tier tool, so the button's state follows the AI tier.
  const [isPowerTier, setIsPowerTier] = useState(false);

  /* ── watchlist targets ─────────────────────────────── */
  const [watchlistTargets, setWatchlistTargets] = useState<WatchlistTarget[]>([]);

  /* ── disclosure UI ──────────────────────────────────── */
  const [infoCollapsed, setInfoCollapsed] = useState(
    () => localStorage.getItem("coffee_outreach_info_collapsed") === "true",
  );
  const [showExplainModal, setShowExplainModal] = useState(false);

  const isWatchlistSelection = selectedContactId.startsWith("w:");
  const selectedContact = isWatchlistSelection
    ? null
    : contacts.find((c) => c.id === selectedContactId) ?? null;
  const selectedWatchlistTarget = isWatchlistSelection
    ? watchlistTargets.find((t) => t.id === selectedContactId.slice(2)) ?? null
    : null;

  /* ── helpers ────────────────────────────────────────── */

  const contactDisplayName = (c: Contact) => {
    const name =
      [c.first_name, c.last_name].filter(Boolean).join(" ") || "Unnamed";
    return c.company ? `${name} \u2014 ${c.company}` : name;
  };

  const contactNameById = (id: string | null) => {
    if (!id) return "Unknown";
    const c = contacts.find((x) => x.id === id);
    if (c) return [c.first_name, c.last_name].filter(Boolean).join(" ") || "Unnamed";
    const t = watchlistTargets.find((x) => x.id === id);
    if (t) return t.person_name;
    return "Unknown";
  };

  const resolvePlaceholders = (text: string) => {
    const name = selectedWatchlistTarget
      ? selectedWatchlistTarget.person_name
      : [selectedContact?.first_name, selectedContact?.last_name]
          .filter(Boolean)
          .join(" ") || "{name}";
    const company =
      selectedWatchlistTarget?.company || selectedContact?.company || "{company}";
    const background = profile?.resume_text
      ? profile.resume_text.slice(0, 200).trim()
      : "{background}";
    return text
      .replace(/\{name\}/g, name)
      .replace(/\{company\}/g, company)
      .replace(/\{background\}/g, background);
  };

  const applyTemplate = (tpl: (typeof TEMPLATES)[number]) => {
    setSubject(resolvePlaceholders(tpl.subject));
    setMessage(resolvePlaceholders(tpl.message));
    setShowTemplates(false);
  };

  const resetForm = () => {
    setSelectedContactId("");
    setChannel("email");
    setSubject("");
    setMessage("");
    setScheduledAt("");
    setEditingId(null);
  };

  const isDue = (item: ScheduledOutreach) =>
    item.status === "scheduled" && new Date(item.scheduled_at) <= new Date();

  /* ── CRUD ───────────────────────────────────────────── */

  const loadItems = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("scheduled_outreach")
      .select("*")
      .order("scheduled_at", { ascending: true });

    if (error) {
      if (!error.message.includes("does not exist")) {
        toast.error("Failed to load outreach: " + error.message);
      }
      setItems([]);
    } else {
      setItems(data);

    }
    setLoading(false);
  }, []);

  const saveItem = async () => {
    if (!message.trim()) {
      toast.error("Message is required.");
      return;
    }
    if (!scheduledAt) {
      toast.error("Pick a date and time to schedule.");
      return;
    }

    setSaving(true);
    const userId = await currentUserId();

    if (!userId) {
      toast.error("You must be signed in.");
      setSaving(false);
      return;
    }

    const payload = {
      owner_id: userId,
      contact_id: isWatchlistSelection ? null : selectedContactId || null,
      channel,
      subject: channel === "email" ? subject.trim() || null : null,
      message: message.trim(),
      scheduled_at: new Date(scheduledAt).toISOString(),
    };

    if (editingId) {
      // Only while it is still waiting. If the cron already sent it, saving the edit
      // would put it back to 'scheduled' and the recipient would get it twice.
      let changed = false;
      try {
        changed = await updateIfStatus(editingId, payload, "scheduled");
      } catch (e) {
        toast.error("Failed to update: " + (e instanceof Error ? e.message : String(e)));
        setSaving(false);
        return;
      }
      if (changed) {
        toast.success("Outreach updated!");
        resetForm();
      } else {
        // Nothing matched: keep the form open so the user's edits are not thrown away.
        toast.error(await movedOnText(editingId));
      }
      await loadItems();
    } else {
      const { error } = await supabase
        .from("scheduled_outreach")
        .insert({ ...payload, status: "scheduled" });
      if (error) {
        toast.error("Failed to schedule: " + error.message);
      } else {
        toast.success("Outreach scheduled!");

        // Capture values before resetForm() clears state
        const gcalConnected = !!profile?.google_connected;
        const capturedContactId = selectedContactId;
        const capturedSubject = subject;
        const capturedMessage = message.trim();
        const capturedScheduledAt = scheduledAt;

        resetForm();
        await loadItems();

        // ── Google Calendar: create event if connected ──────────────────────
        if (gcalConnected) {
          const contact = contacts.find((c) => c.id === capturedContactId);
          const contactName = contact
            ? [contact.first_name, contact.last_name].filter(Boolean).join(" ")
            : null;
          const eventTitle = contactName
            ? `Outreach: ${contactName}${capturedSubject ? ` — ${capturedSubject}` : ""}`
            : `Outreach${capturedSubject ? `: ${capturedSubject}` : ""}`;

          createCalendarEvent({
            title: eventTitle,
            description: capturedMessage,
            startDatetime: new Date(capturedScheduledAt).toISOString(),
          }).catch((err: Error) => {
            // Non-blocking: calendar failures don't undo the schedule
            toast.warning(`Scheduled, but calendar event failed: ${err.message}`);
          });
        }
      }
    }
    setSaving(false);
  };

  /**
   * Moves a row on from the status the page last saw. Returns false (after telling the
   * user and reloading) if the row had already moved, e.g. the cron sent it meanwhile.
   */
  /** Why a guarded write matched nothing, from the row's current status. */
  const movedOnText = async (id: string) => {
    try {
      return movedOnMessage(await getOutreachStatus(id));
    } catch {
      return "This changed. Refreshed";
    }
  };

  const markStatus = async (
    id: string,
    status: "sent" | "skipped" | "opened" | "scheduled",
    from: string | string[],
  ): Promise<boolean> => {
    const update: TablesUpdate<"scheduled_outreach"> = { status };
    if (status === "opened") update.opened_at = new Date().toISOString();
    if (status === "scheduled") {
      update.failure_reason = null;
      update.scheduled_at = new Date().toISOString();
    }
    try {
      const changed = await updateIfStatus(id, update, from);
      if (!changed) toast.error(await movedOnText(id));
      await loadItems();
      return changed;
    } catch (e) {
      toast.error("Failed to update status: " + (e instanceof Error ? e.message : String(e)));
      return false;
    }
  };

  const deleteItem = async (id: string) => {
    if (!window.confirm("Delete this scheduled outreach?")) return;
    const { error } = await supabase
      .from("scheduled_outreach")
      .delete()
      .eq("id", id);
    if (error) {
      toast.error("Failed to delete: " + error.message);
    } else {
      toast.success("Deleted.");
      if (editingId === id) resetForm();
      await loadItems();
    }
  };

  const startEdit = (item: ScheduledOutreach) => {
    setEditingId(item.id);
    setSelectedContactId(item.contact_id ?? "");
    setChannel(item.channel);
    setSubject(item.subject ?? "");
    setMessage(item.message);
    const d = new Date(item.scheduled_at);
    const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000)
      .toISOString()
      .slice(0, 16);
    setScheduledAt(local);
  };

  const handleSendNow = () => {
    if (!message.trim()) {
      toast.error("Write a message first.");
      return;
    }
    openOutreach(channel, selectedContact, subject, message);
  };

  const handleScheduleClick = () => {
    if (!localStorage.getItem("coffee_outreach_explained")) {
      setShowExplainModal(true);
    } else {
      saveItem();
    }
  };

  const handleExplainConfirm = () => {
    localStorage.setItem("coffee_outreach_explained", "true");
    setShowExplainModal(false);
    saveItem();
  };

  const toggleInfoCollapsed = () => {
    const next = !infoCollapsed;
    setInfoCollapsed(next);
    localStorage.setItem("coffee_outreach_info_collapsed", String(next));
  };

  const handleSendItem = async (item: ScheduledOutreach) => {
    const contact = contacts.find((c) => c.id === item.contact_id) ?? null;
    const open = () => openOutreach(item.channel, contact, item.subject ?? "", item.message);
    if (isDemoMode) return open();

    // The cron only touches email rows of owners with Gmail connected. Everything else
    // (texts, LinkedIn, email without Gmail) is ours alone, so open first: the clipboard
    // write and the sms:/mailto: hand-off must happen inside the click, before any await,
    // or the browser blocks them. Then record it as sent.
    const cronOwnsIt = item.channel === "email" && Boolean(profile?.google_gmail_send);
    if (!cronOwnsIt) {
      open();
      await markStatus(item.id, "sent", "scheduled");
      return;
    }

    // Gmail-connected email: claim the row first. If the cron got there first this fails and
    // nothing opens, so the same email is never both drafted here and sent from Gmail. The
    // mailto hand-off after an await (window.open _self) is accepted for email on desktop.
    if (!(await markStatus(item.id, "sent", "scheduled"))) return;
    open();
  };

  const loadWatchlistTargets = useCallback(async () => {
    const { data } = await supabase
      .from("watchlist_targets")
      .select("*")
      .order("created_at", { ascending: false });
    if (data) setWatchlistTargets(data);
  }, []);

  /* ── load on mount ──────────────────────────────────── */

  useEffect(() => {
    loadItems();
    loadWatchlistTargets();
    fetchAiStatus()
      .then((status) => setIsPowerTier(status.tier === "power"))
      .catch(() => setIsPowerTier(false));
  }, [loadItems, loadWatchlistTargets]);

  async function handlePersonalize() {
    if (!message.trim()) {
      toast.error("Write or apply a template message first.");
      return;
    }
    setPersonalizing(true);
    try {
      // Build contact info string
      let contactInfo = "";
      if (selectedContact) {
        const name = [selectedContact.first_name, selectedContact.last_name]
          .filter(Boolean)
          .join(" ");
        contactInfo = [
          name && `Name: ${name}`,
          selectedContact.company && `Company: ${selectedContact.company}`,
          selectedContact.title && `Title: ${selectedContact.title}`,
        ]
          .filter(Boolean)
          .join("\n");
      } else if (selectedWatchlistTarget) {
        contactInfo = [
          `Name: ${selectedWatchlistTarget.person_name}`,
          `Company: ${selectedWatchlistTarget.company}`,
          selectedWatchlistTarget.role && `Role: ${selectedWatchlistTarget.role}`,
        ]
          .filter(Boolean)
          .join("\n");
      }

      // Try to fetch LinkedIn preview
      const linkedInUrl =
        selectedContact?.linkedin_url || null;
      let linkedInPreview: string | null = null;
      if (linkedInUrl) {
        linkedInPreview = await fetchLinkedInPreview(linkedInUrl);
      }

      const result = await personalizeOutreach({
        resumeText: profile?.resume_text ?? null,
        contactInfo: contactInfo || "No contact selected",
        linkedInPreview,
        currentMessage: message,
      });
      setMessage(result.message);
      if (linkedInPreview) {
        toast.success("Message personalized using your resume and their LinkedIn profile.");
      } else if (linkedInUrl) {
        toast.success("Message personalized. LinkedIn preview couldn't be fetched — used contact info instead.");
      } else {
        toast.success("Message personalized using your resume and contact info.");
      }
    } catch (e) {
      if (e instanceof PowerTierRequiredError) {
        setIsPowerTier(false);
        toast.error(e.message);
      } else {
        toast.error(e instanceof Error ? e.message : "Personalization failed.");
      }
    } finally {
      setPersonalizing(false);
    }
  }

  /* ── channel availability (cross-check contact info) ── */

  // Watchlist targets have no email/phone — only LinkedIn is valid for them
  const hasEmail = !isWatchlistSelection && !!selectedContact?.email?.trim();
  const hasPhone = !isWatchlistSelection && !!selectedContact?.phone?.trim();

  const channelDisabledReason = (ch: string): string | null => {
    if (!selectedContactId) return null; // no contact selected yet, allow selection
    if (ch === "email") {
      if (isWatchlistSelection) return "Watchlist targets have no email on file";
      if (!hasEmail) return "No email on file for this contact";
    }
    if (ch === "sms") {
      if (isWatchlistSelection) return "Watchlist targets have no phone on file";
      if (!hasPhone) return "No phone number on file for this contact";
    }
    return null;
  };

  // Auto-switch channel when the selected contact changes and the current channel becomes unavailable
  useEffect(() => {
    if (!selectedContactId) return;
    const reason = channelDisabledReason(channel);
    if (!reason) return;
    // Pick the first available channel
    if (channel === "email" && hasPhone) setChannel("sms");
    else if (channel === "sms" && hasEmail) setChannel("email");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedContactId, hasEmail, hasPhone]);

  /* ── derived ────────────────────────────────────────── */

  const scheduledItems = items.filter((i) => i.status === "scheduled");
  // Rows the cron could not send. They used to vanish from the page entirely.
  const failedItems = items.filter((i) => i.status === "failed" || i.status === "missed");
  const completedItems = items.filter(
    (i) => i.status === "sent" || i.status === "skipped" || i.status === "opened",
  );

  /* ── render ─────────────────────────────────────────── */

  return (
    <>
    <div className="mx-auto grid max-w-7xl grid-cols-1 gap-6 px-4 pb-10 md:px-6 lg:grid-cols-3">
      {/* Compose — 1/3. On a phone the due queue (the job) comes first. */}
      <div className="order-last space-y-6 lg:order-none lg:col-span-1">
        <ScheduleForm profile={profile} contacts={contacts} watchlistTargets={watchlistTargets} editingId={editingId} saving={saving} selectedContactId={selectedContactId} setSelectedContactId={setSelectedContactId} contactDisplayName={contactDisplayName} channelDisabledReason={channelDisabledReason} channel={channel} setChannel={setChannel} subject={subject} setSubject={setSubject} message={message} setMessage={setMessage} scheduledAt={scheduledAt} setScheduledAt={setScheduledAt} isPowerTier={isPowerTier} personalizing={personalizing} handlePersonalize={handlePersonalize} infoCollapsed={infoCollapsed} toggleInfoCollapsed={toggleInfoCollapsed} handleScheduleClick={handleScheduleClick} handleSendNow={handleSendNow} resetForm={resetForm} />

        {/* Templates */}
        <Card
          title="Templates"
          subtitle="Click to auto-fill compose form."
          right={
            <button
              onClick={() => setShowTemplates((v) => !v)}
              className="rounded-button bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-white/50 transition-colors hover:bg-white/[0.08] cursor-pointer"
            >
              {showTemplates ? "Hide" : "Show"}
            </button>
          }
        >
          {showTemplates && (
            <div className="grid gap-2">
              {TEMPLATES.map((tpl) => (
                <div
                  key={tpl.key}
                  onClick={() => applyTemplate(tpl)}
                  className="cursor-pointer rounded-input bg-depth-0/30 p-3 transition hover:bg-glow/[0.04]"
                >
                  <div className="text-sm font-medium text-white">{tpl.title}</div>
                  <div className="mt-0.5 text-xs text-white/30">{tpl.description}</div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* Scheduled — 2/3 */}
      <div className="lg:col-span-2 space-y-6">
        <UpcomingCard loading={loading} scheduledItems={scheduledItems} isDue={isDue} contactNameById={contactNameById} loadItems={loadItems} handleSendItem={handleSendItem} markStatus={markStatus} startEdit={startEdit} deleteItem={deleteItem} />

        {/* Not sent */}
        {failedItems.length > 0 && (
          <NotSentCard failedItems={failedItems} contactNameById={contactNameById} markStatus={markStatus} deleteItem={deleteItem} />
        )}

        {/* History */}
        {completedItems.length > 0 && (
          <HistoryCard completedItems={completedItems} contactNameById={contactNameById} markStatus={markStatus} deleteItem={deleteItem} />
        )}
      </div>
    </div>

    {/* One-time auto-send explanation modal */}
    <Modal
      title="Before you schedule"
      open={showExplainModal}
      onClose={() => setShowExplainModal(false)}
    >
      <div className="grid gap-4">
        <p className="text-sm text-white/70 leading-relaxed">
          Coffee will ask macOS for <span className="text-white font-medium">Automation permission</span> to control Mail and Messages — this is how auto-send works.
        </p>
        <ul className="grid gap-2 text-sm text-white/60">
          <li className="flex gap-2">
            <span aria-hidden="true" className="mt-[7px] h-1.5 w-1.5 flex-none rounded-full bg-white/50" />
            <span>This is <strong className="text-white/80">not</strong> Accessibility or Full Disk Access — it only lets Coffee send messages on your behalf.</span>
          </li>
          <li className="flex gap-2">
            <span aria-hidden="true" className="mt-[7px] h-1.5 w-1.5 flex-none rounded-full bg-white/50" />
            <span>Your email password and Apple ID are <strong className="text-white/80">never</strong> stored or seen by Coffee.</span>
          </li>
          <li className="flex gap-2">
            <span aria-hidden="true" className="mt-[7px] h-1.5 w-1.5 flex-none rounded-full bg-white/50" />
            <span>Messages only send while Coffee is running. You can pause or cancel anytime.</span>
          </li>
          <li className="flex gap-2">
            <span aria-hidden="true" className="mt-[7px] h-1.5 w-1.5 flex-none rounded-full bg-white/50" />
            <span>Revoke permission anytime in <strong className="text-white/80">System Settings → Privacy & Security → Automation</strong>.</span>
          </li>
        </ul>
        <button
          onClick={handleExplainConfirm}
          className="mt-2 w-full rounded-button bg-glow/90 px-4 py-3 text-sm font-semibold text-depth-0 transition hover:bg-glow cursor-pointer"
        >
          Got it, schedule my message
        </button>
      </div>
    </Modal>
    </>
  );
}
