import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import Card from "@/components/ui/Card";
import { inputCls, selectCls } from "@/components/ui/styles";
import { useSession } from "@/app/session";
import { ensureUrl, errorMessage, todayISODate } from "@/lib/utils";
import { supabase } from "@/lib/supabase";
import BulkBar from "@/features/bulk/BulkBar";
import Checkbox from "@/features/bulk/Checkbox";
import { StarMark, TagChips } from "@/features/bulk/marks";
import { allTags, hasTag, nextStarValue } from "@/features/bulk/tags";
import { useSelection } from "@/features/bulk/useSelection";
import type { ContactFields } from "../../../supabase/functions/_shared/contactFields.ts";
import * as api from "./api";
import { useContacts } from "./contactsContext";
import LinkedInImportModal from "./LinkedInImportModal";
import PasteProfileFill from "./PasteProfileFill";

interface ContactsPageProps {
  openDetails: (contactId: string) => void;
  onFollowUp?: () => void;
}

/** A contact you haven't met in this many days is due a follow-up. */
const STALE_DAYS = 30;

export default function ContactsPage({ openDetails, onFollowUp }: ContactsPageProps) {
  const user = useSession();
  const { contacts: allContacts, loading: loadingContacts, reload: loadContacts, editContact: openEdit, bulk } =
    useContacts();

  const [search, setSearch] = useState("");
  const [tagFilter, setTagFilter] = useState("");
  const knownTags = useMemo(() => allTags(allContacts), [allContacts]);
  // A filter on a tag nobody has any more (its last row was untagged) shows everyone again.
  const activeTag = knownTags.some((t) => t === tagFilter) ? tagFilter : "";
  const contacts = useMemo(() => {
    const q = search.trim().toLowerCase();
    return allContacts.filter(
      (c) =>
        (!activeTag || hasTag(c.tags, activeTag)) &&
        (!q ||
          [c.first_name, c.last_name, c.company, c.title, c.email, c.phone]
            .filter(Boolean)
            .join(" ")
            .toLowerCase()
            .includes(q)),
    );
  }, [allContacts, search, activeTag]);

  const order = useMemo(() => contacts.map((c) => c.id), [contacts]);
  const sel = useSelection(order);
  const selectedRows = contacts.filter((c) => sel.selected.has(c.id));
  const [moving, setMoving] = useState(false);

  async function moveSelected() {
    const ids = sel.ids;
    setMoving(true);
    try {
      const { moved, blocked } = await bulk.moveToWatchlist(ids);
      if (moved > 0) toast.success(`Moved ${moved} ${moved === 1 ? "person" : "people"} to your Watchlist.`);
      if (blocked > 0)
        toast(`${blocked} ${blocked === 1 ? "person stayed" : "people stayed"} in your Network`, {
          description: "They have meetings, applications or outreach logged, and the Watchlist can't hold those.",
        });
    } catch (e) {
      toast.error(errorMessage(e, "Couldn't move them."));
    } finally {
      setMoving(false);
    }
  }

  // Add-contact draft.
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [company, setCompany] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [linkedinUrl, setLinkedinUrl] = useState("");
  const [importOpen, setImportOpen] = useState(false);

  /**
   * Pasted-profile result → the draft. Only the fields the AI found are set, and nothing is
   * read from this render's state: the AI call takes seconds, and anything typed meanwhile
   * must survive (a blank never erases what's typed).
   */
  function applyFill(found: Partial<ContactFields>) {
    const setters: [string | undefined, (v: string) => void][] = [
      [found.first_name, setFirstName],
      [found.last_name, setLastName],
      [found.company, setCompany],
      [found.title, setJobTitle],
      [found.email, setContactEmail],
      [found.phone, setPhone],
      [found.linkedin_url, setLinkedinUrl],
    ];
    for (const [value, set] of setters) if (value) set(value);
  }

  async function addContact() {
    try {
      await api.createContacts([
        {
          owner_id: user.id,
          first_name: firstName || null,
          last_name: lastName || null,
          company: company || null,
          title: jobTitle || null,
          email: contactEmail || null,
          phone: phone || null,
          linkedin_url: linkedinUrl || null,
          status: "to_contact",
        },
      ]);
    } catch (e) {
      toast.error(errorMessage(e, "Failed to add contact."));
      return;
    }
    setFirstName("");
    setLastName("");
    setCompany("");
    setJobTitle("");
    setContactEmail("");
    setPhone("");
    setLinkedinUrl("");
    await loadContacts();
  }

  const [lastMeetingDates, setLastMeetingDates] = useState<Record<string, string>>({});

  // Fetch last meeting date for each contact
  useEffect(() => {
    async function fetchMeetingDates() {
      if (contacts.length === 0) return;

      const contactIds = contacts.map((c) => c.id);
      const { data, error } = await supabase
        .from("contact_meetings")
        .select("contact_id, meeting_date")
        .in("contact_id", contactIds)
        .order("meeting_date", { ascending: false });

      if (!error && data) {
        // Keep only the most recent meeting per contact
        const dateMap: Record<string, string> = {};
        for (const meeting of data) {
          if (!dateMap[meeting.contact_id]) {
            dateMap[meeting.contact_id] = meeting.meeting_date;
          }
        }
        setLastMeetingDates(dateMap);
      }
    }

    fetchMeetingDates();
  }, [contacts]);

  const dueCount = allContacts.filter((c) => (daysSince(lastMeetingDates[c.id]) ?? 0) >= STALE_DAYS).length;

  /** Whole days from a YYYY-MM-DD meeting date to today, or null when they've never met. */
  function daysSince(lastDate: string | undefined): number | null {
    if (!lastDate) return null;
    const ms = new Date(todayISODate()).getTime() - new Date(lastDate).getTime();
    return Math.max(0, Math.floor(ms / 86_400_000));
  }
  return (
    <div className="mx-auto grid max-w-7xl grid-cols-1 gap-6 px-4 pb-10 md:px-6 lg:grid-cols-3">
      {/* Add contact — 1/3. On a phone the list (the job) comes first and the form follows. */}
      <div className="order-last lg:order-none lg:col-span-1">
        <Card title="Add a person" subtitle="Add someone once; log every coffee after.">
          <PasteProfileFill onFill={applyFill} />
          <div className="grid gap-3">
            <div className="grid grid-cols-2 gap-3">
              <input className={inputCls} placeholder="First name" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
              <input className={inputCls} placeholder="Last name" value={lastName} onChange={(e) => setLastName(e.target.value)} />
            </div>

            <input className={inputCls} placeholder="Company" value={company} onChange={(e) => setCompany(e.target.value)} />
            <input className={inputCls} placeholder="Job Title" value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} />
            <input className={inputCls} placeholder="Email (recommended)" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} />
            <input className={inputCls} placeholder="Phone (recommended)" value={phone} onChange={(e) => setPhone(e.target.value)} />
            <input className={inputCls} placeholder="LinkedIn URL" value={linkedinUrl} onChange={(e) => setLinkedinUrl(e.target.value)} />

            <button
              onClick={addContact}
              className="mt-1 rounded-button bg-glow/90 px-4 py-2.5 text-sm font-semibold text-depth-0 transition duration-300 hover:bg-glow active:scale-[0.98] cursor-pointer"
            >
              Add person
            </button>
            <button
              type="button"
              onClick={() => setImportOpen(true)}
              className="text-left text-sm text-white/60 hover:text-white hover:underline cursor-pointer"
            >
              Have many people? Import your LinkedIn connections
            </button>
          </div>
        </Card>
        {importOpen ? <LinkedInImportModal onClose={() => setImportOpen(false)} /> : null}
      </div>

      {/* Network list — 2/3 */}
      <div className="lg:col-span-2">
        <Card
          title="People"
          subtitle={
            loadingContacts
              ? "Loading…"
              : dueCount > 0
                ? `${dueCount} ${dueCount === 1 ? "person is" : "people are"} due a follow-up (${STALE_DAYS}+ days since you met)`
                : "Nobody is overdue for a follow-up."
          }
          right={
            <button
              onClick={loadContacts}
              className="rounded-button bg-white/[0.04] px-3 py-2 text-sm font-medium text-white/60 transition-colors hover:bg-white/[0.08] hover:text-white cursor-pointer"
            >
              Refresh
            </button>
          }
        >
          <div className="flex gap-2">
            <input
              className={inputCls}
              placeholder="Search name, company, job title, email, phone..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {knownTags.length > 0 ? (
              <select
                className={`${selectCls} w-40! shrink-0`}
                aria-label="Filter by tag"
                value={activeTag}
                onChange={(e) => setTagFilter(e.target.value)}
              >
                <option value="">All tags</option>
                {knownTags.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            ) : null}
          </div>

          <div className="mt-4 rounded-section bg-depth-0/40">
            {/* Select-all, then either the column labels or (with a selection) the bulk actions.
                Columns: who · company · days since you last met · the one action. Below md each row is two lines. */}
            <div className="flex min-h-[3.25rem] items-center gap-3 px-4 py-2">
              <Checkbox state={sel.all} label="Select all people" onToggle={() => sel.onToggleAll()} />
              {sel.count > 0 ? (
                <BulkBar
                  count={sel.count}
                  allStarred={!nextStarValue(selectedRows)}
                  knownTags={knownTags}
                  selectedRows={selectedRows}
                  moveLabel="Move to Watchlist"
                  busy={moving}
                  onStar={() => void bulk.star(sel.ids)}
                  onTag={(tag, mode) => void bulk.tag(sel.ids, tag, mode)}
                  onMove={() => void moveSelected()}
                  onDelete={() => bulk.remove(sel.ids)}
                  onClear={sel.clear}
                />
              ) : (
                <>
                  <span className="text-xs text-white/60 md:hidden">Select all</span>
                  <div className="hidden min-w-0 flex-1 grid-cols-[minmax(0,2fr)_minmax(0,1.4fr)_7.5rem_6.5rem] items-center gap-4 text-xs text-white/60 md:grid">
                    <div>Name</div>
                    <div>Company</div>
                    <div className="text-right">Last met</div>
                    <div />
                  </div>
                </>
              )}
            </div>

            <div className="h-px w-full bg-white/[0.06]" />

            {loadingContacts ? (
              <div className="px-4 py-8 text-center text-sm text-white/60">Loading your network…</div>
            ) : contacts.length === 0 ? (
              <div className="px-6 py-10 text-center">
                <p className="text-sm text-white/80">{search.trim() ? "Nobody matches that search." : "Your network is empty."}</p>
                {!search.trim() ? (
                  <p className="mt-1 text-sm text-white/60">Add the first person you've had coffee with, paste a LinkedIn profile, or import your connections.</p>
                ) : null}
              </div>
            ) : (
              contacts.map((c) => {
                const displayName = [c.first_name, c.last_name].filter(Boolean).join(" ") || "\u2014";
                const li = c.linkedin_url ?? "";
                const days = daysSince(lastMeetingDates[c.id]);
                const stale = days !== null && days >= STALE_DAYS;

                const picked = sel.selected.has(c.id);

                return (
                  <div key={c.id} className={`px-4 transition-colors ${picked ? "bg-white/[0.05]" : ""}`}>
                    <div className="flex items-center gap-3">
                    <Checkbox state={picked ? "all" : "none"} label={`Select ${displayName}`} onToggle={(shift) => sel.onToggle(c.id, shift)} />
                    <div className="grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-0.5 py-3 md:grid-cols-[minmax(0,2fr)_minmax(0,1.4fr)_7.5rem_6.5rem]">
                      <div className="min-w-0">
                        <div className="flex min-w-0 items-center gap-1.5">
                          <button
                            onClick={() => openDetails(c.id)}
                            className="block min-w-0 truncate text-left font-medium text-white hover:underline cursor-pointer"
                          >
                            {displayName}
                          </button>
                          {c.starred ? <StarMark /> : null}
                        </div>
                        <div className="mt-0.5 truncate text-sm text-white/60">
                          <span className="md:hidden">{[c.title, c.company].filter(Boolean).join(" · ") || "\u2014"}</span>
                          <span className="hidden md:inline">{c.title || "\u2014"}</span>
                          {li ? (
                            <>
                              {" · "}
                              <a href={ensureUrl(li)} target="_blank" rel="noreferrer" className="text-white/60 hover:text-white hover:underline">
                                LinkedIn
                              </a>
                            </>
                          ) : null}
                        </div>
                        <TagChips tags={c.tags} />
                      </div>

                      <div className="hidden truncate text-sm text-white/80 md:block" title={c.company ?? ""}>
                        {c.company || <span className="text-white/60">\u2014</span>}
                      </div>

                      <div
                        className={`row-span-2 text-right text-sm font-data md:row-span-1 ${stale ? "text-glow" : days === null ? "text-white/60" : "text-white/80"}`}
                        title={days === null ? "No meetings logged yet" : `Last meeting ${lastMeetingDates[c.id]}`}
                      >
                        {days === null ? "Not yet" : days === 0 ? "Today" : `${days} ${days === 1 ? "day" : "days"} ago`}
                      </div>

                      <div className="col-span-2 flex justify-start gap-4 text-sm md:col-span-1 md:justify-end">
                        {stale && onFollowUp ? (
                          <button onClick={() => onFollowUp()} className="font-medium text-white hover:underline cursor-pointer">
                            Follow up
                          </button>
                        ) : null}
                        <button onClick={() => openEdit(c)} className="text-white/60 hover:text-white hover:underline cursor-pointer">
                          Edit
                        </button>
                      </div>
                    </div>
                    </div>

                    <div className="h-px w-full bg-white/[0.04]" />
                  </div>
                );
              })
            )}

          </div>
        </Card>
      </div>
    </div>
  );
}
