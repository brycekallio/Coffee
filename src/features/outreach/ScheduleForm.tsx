import type { Contact, Profile, WatchlistTarget } from "@/types";
import { inputCls, selectCls } from "@/components/ui/styles";
import Card from "@/components/ui/Card";
import { toast } from "sonner";

/**
 * Only email can be scheduled, and the distinction is not a product choice --
 * iMessage has no API. Messages' automation dictionary exposes exactly one verb,
 * `send`, with no scheduling of any kind, so nothing can queue an iMessage for
 * later on your behalf. Apple's own Send Later is UI-only.
 *
 * So email schedules server-side and goes out whether or not your Mac is awake;
 * iMessage hands you the text and lets Apple hold the queue if you want it held.
 */
const CHANNELS = [
  { value: "email", label: "Email", description: "Schedules and sends on its own" },
  { value: "sms", label: "iMessage", description: "Copy and send from Messages" },
] as const;

const SCHEDULABLE = new Set(["email"]);

// LinkedIn was removed: it has no messaging API, so it could never be more than
// "copy to clipboard and open a tab", and unlike email and iMessage it cannot be
// scheduled or sent unattended. A channel that silently means "do it yourself"
// does not belong beside channels that actually send.

/**
 * Connecting Google is the opt-in, rather than a separate tier flag: the only
 * thing that makes unattended sending possible is a stored refresh token, so the
 * connection itself is the honest gate. Without it, email behaves like iMessage
 * -- drafted here, sent by you.
 */
const canAutoSend = (profile: Profile | null, ch: string) =>
  SCHEDULABLE.has(ch) && Boolean(profile?.google_gmail_send);

const channelIcon = (ch: string) => {
  if (ch === "email") return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
    </svg>
  );
  if (ch === "sms") return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
    </svg>
  );
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
    </svg>
  );
};

export default function ScheduleForm({
  profile, contacts, watchlistTargets, editingId, saving,
  selectedContactId, setSelectedContactId, contactDisplayName, channelDisabledReason,
  channel, setChannel, subject, setSubject, message, setMessage, scheduledAt, setScheduledAt,
  isPowerTier, personalizing, handlePersonalize,
  infoCollapsed, toggleInfoCollapsed, handleScheduleClick, handleSendNow, resetForm,
}: {
  profile: Profile | null;
  contacts: Contact[];
  watchlistTargets: WatchlistTarget[];
  editingId: string | null;
  saving: boolean;
  selectedContactId: string;
  setSelectedContactId: (v: string) => void;
  contactDisplayName: (c: Contact) => string;
  channelDisabledReason: (ch: string) => string | null;
  channel: string;
  setChannel: (v: string) => void;
  subject: string;
  setSubject: (v: string) => void;
  message: string;
  setMessage: (v: string) => void;
  scheduledAt: string;
  setScheduledAt: (v: string) => void;
  isPowerTier: boolean;
  personalizing: boolean;
  handlePersonalize: () => void;
  infoCollapsed: boolean;
  toggleInfoCollapsed: () => void;
  handleScheduleClick: () => void;
  handleSendNow: () => void;
  resetForm: () => void;
}) {
  return (
    <Card
      title={editingId ? "Edit Outreach" : "Compose"}
      subtitle="Draft and schedule outreach messages."
    >
      <div className="grid gap-3">
        {/* Contact */}
        <div>
          <div className="mb-1 text-xs font-medium text-white/60">Contact</div>
          <select
            className={selectCls}
            value={selectedContactId}
            onChange={(e) => setSelectedContactId(e.target.value)}
          >
            <option value="">Select a contact...</option>
            {contacts.length > 0 && (
              <optgroup label="Network">
                {contacts.map((c) => (
                  <option key={c.id} value={c.id}>
                    {contactDisplayName(c)}
                  </option>
                ))}
              </optgroup>
            )}
            {watchlistTargets.length > 0 && (
              <optgroup label="Watchlist">
                {watchlistTargets.map((t) => (
                  <option key={`w:${t.id}`} value={`w:${t.id}`}>
                    {t.person_name}{t.company ? ` \u2014 ${t.company}` : ""}
                  </option>
                ))}
              </optgroup>
            )}
          </select>
        </div>

        {/* Channel - Auto-send */}
        <div>
          <div className="mb-1 text-xs font-medium text-white/60">Auto-send channels</div>
          <div className="flex gap-2">
            {CHANNELS.map((ch) => {
              const disabledReason = channelDisabledReason(ch.value);
              const isDisabled = !!disabledReason;
              return (
                <div key={ch.value} className="relative flex-1 group">
                  <button
                    onClick={() => !isDisabled && setChannel(ch.value)}
                    disabled={isDisabled}
                    title={disabledReason ?? undefined}
                    className={`w-full rounded-input border px-3 py-2 text-sm font-medium transition ${
                      isDisabled
                        ? "border-white/[0.03] bg-white/[0.01] text-white/60 cursor-not-allowed opacity-70"
                        : channel === ch.value
                          ? "border-glow/30 bg-glow/[0.08] text-glow cursor-pointer"
                          : "border-white/[0.06] bg-white/[0.03] text-white/60 hover:bg-white/[0.05] cursor-pointer"
                    }`}
                  >
                    <div className="flex items-center gap-1.5">{channelIcon(ch.value)} {ch.label}</div>
                    <div className="mt-0.5 text-[11px] font-normal text-white/60">
                      {isDisabled ? disabledReason : ch.description}
                    </div>
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        {/* Subject (email only) */}
        {channel === "email" && (
          <div>
            <div className="mb-1 text-xs font-medium text-white/60">Subject</div>
            <input
              className={inputCls}
              placeholder="Email subject line"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
            />
          </div>
        )}

        {/* Message */}
        <div>
          <div className="mb-1 flex items-center justify-between">
            <span className="text-xs font-medium text-white/60">Message</span>
            {isPowerTier ? (
              <button
                onClick={handlePersonalize}
                disabled={personalizing || !message.trim()}
                className="flex min-h-10 items-center gap-1.5 rounded-button bg-glow/[0.08] px-3 py-1 text-xs font-medium text-glow transition-colors hover:bg-glow/15 disabled:opacity-40 cursor-pointer"
              >
                <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z" />
                </svg>
                {personalizing ? "Personalizing..." : "AI Personalize"}
              </button>
            ) : (
              <button
                onClick={() =>
                  toast.info(
                    "AI Personalize needs your own API key. Add one under Settings → AI engine."
                  )
                }
                className="flex min-h-10 items-center gap-1.5 rounded-button bg-white/[0.04] px-3 py-1 text-xs font-medium text-white/60 transition-colors hover:bg-white/[0.08] cursor-pointer"
              >
                <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
                </svg>
                AI Personalize
              </button>
            )}
          </div>
          <textarea
            className={inputCls + " min-h-[140px] resize-y"}
            placeholder="Write your message here..."
            value={message}
            onChange={(e) => setMessage(e.target.value)}
          />
        </div>

        {/* Schedule date/time — only when Gmail can actually deliver it */}
        {canAutoSend(profile, channel) && (
          <div>
            <div className="mb-1 text-xs font-medium text-white/60">Schedule for</div>
            <input
              className={inputCls}
              type="datetime-local"
              value={scheduledAt}
              onChange={(e) => setScheduledAt(e.target.value)}
            />
          </div>
        )}


        {channel === "email" && !canAutoSend(profile, channel) && (
          <div className="rounded-input bg-glow/[0.04] px-3 py-2.5 text-xs leading-relaxed text-white/60">
            Connect Google in Settings to schedule email. Once connected, Coffee
            sends from your own Gmail at the time you pick — your computer does
            not need to be on, and it lands in your Sent folder. Until then,
            Coffee drafts the message and you send it.
          </div>
        )}

        {channel === "sms" && (
          <div className="rounded-input bg-glow/[0.04] px-3 py-2 text-xs leading-relaxed text-white/60">
            iMessage can't be sent for you — Apple provides no way for an app to
            queue one. Coffee copies the message and opens the chat; in Messages,
            hold the send arrow to use Send Later and Apple delivers it, even with
            your Mac closed.
          </div>
        )}

        {/* Disclosure callout */}
        {canAutoSend(profile, channel) && (
          <div className="rounded-input bg-depth-1/60 px-3 py-2.5">
            <button
              onClick={toggleInfoCollapsed}
              className="flex w-full items-center justify-between gap-2 cursor-pointer"
            >
              <span className="text-xs font-medium text-glow">How auto-send works</span>
              <svg
                className={`h-3.5 w-3.5 text-white/60 transition-transform duration-200 ${infoCollapsed ? "" : "rotate-180"}`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2.5}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {!infoCollapsed && (
              <p className="mt-2 text-xs leading-relaxed text-white/60">
                Scheduled email sends from your own Gmail account, so it lands in your Sent folder and goes out whether or not your computer is on. Coffee never sees your password — you grant access through Google and can revoke it at any time.
              </p>
            )}
          </div>
        )}

        {/* Action buttons */}
        <div className="mt-2 flex gap-2">
          {canAutoSend(profile, channel) ? (
            <>
              <button
                onClick={handleScheduleClick}
                disabled={saving}
                className="flex-1 rounded-button bg-glow/90 px-4 py-2.5 text-sm font-semibold text-depth-0 transition hover:bg-glow disabled:opacity-50 cursor-pointer"
              >
                {saving ? "Saving..." : editingId ? "Update" : "Schedule"}
              </button>
              <button
                onClick={handleSendNow}
                className="rounded-button bg-glow/[0.08] px-3 py-2 text-sm font-medium text-glow transition-colors hover:bg-glow/15 cursor-pointer"
              >
                Send Now
              </button>
            </>
          ) : (
            <button
              onClick={handleSendNow}
              className="flex-1 rounded-button bg-glow/90 px-4 py-2.5 text-sm font-semibold text-depth-0 transition hover:bg-glow cursor-pointer"
            >
              {channel === "email" ? "Open in Mail" : "Copy and open Messages"}
            </button>
          )}
          <button
            onClick={resetForm}
            className="rounded-button bg-white/[0.04] px-3 py-2 text-sm font-medium text-white/60 transition-colors hover:bg-white/[0.08] cursor-pointer"
          >
            Clear
          </button>
        </div>
      </div>
    </Card>
  );
}
