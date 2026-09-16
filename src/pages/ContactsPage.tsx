import { useEffect, useState } from "react";
import Card from "../components/ui/Card";
import type { Contact } from "../types";
import { ensureUrl, todayISODate } from "../lib/utils";
import { supabase } from "../lib/supabase";

interface ContactsPageProps {
  contacts: Contact[];
  loadingContacts: boolean;
  loadContacts: () => void;
  search: string;
  setSearch: (v: string) => void;
  firstName: string;
  setFirstName: (v: string) => void;
  lastName: string;
  setLastName: (v: string) => void;
  company: string;
  setCompany: (v: string) => void;
  jobTitle: string;
  setJobTitle: (v: string) => void;
  contactEmail: string;
  setContactEmail: (v: string) => void;
  phone: string;
  setPhone: (v: string) => void;
  linkedinUrl: string;
  setLinkedinUrl: (v: string) => void;
  addContact: () => void;
  openDetails: (contactId: string) => void;
  openEdit: (c: Contact) => void;
  deleteContact: (contactId: string) => void;
  onFollowUp?: () => void;
  inputCls: string;
}

export default function ContactsPage({
  contacts,
  loadingContacts,
  loadContacts,
  search,
  setSearch,
  firstName,
  setFirstName,
  lastName,
  setLastName,
  company,
  setCompany,
  jobTitle,
  setJobTitle,
  contactEmail,
  setContactEmail,
  phone,
  setPhone,
  linkedinUrl,
  setLinkedinUrl,
  addContact,
  openDetails,
  openEdit,
  deleteContact,
  onFollowUp,
  inputCls,
}: ContactsPageProps) {
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

  // Check if contact is stale (30+ days since last meeting)
  function isStale(contactId: string): boolean {
    const lastDate = lastMeetingDates[contactId];
    if (!lastDate) return false; // No meetings yet, not stale

    const today = new Date(todayISODate());
    const lastMeeting = new Date(lastDate);
    const daysDiff = Math.floor((today.getTime() - lastMeeting.getTime()) / (1000 * 60 * 60 * 24));
    return daysDiff >= 30;
  }
  return (
    <div className="mx-auto grid max-w-7xl gap-6 px-6 py-8 lg:grid-cols-3">
      {/* Add contact — 1/3 */}
      <div className="lg:col-span-1">
        <Card title="Add Contact" subtitle="Add someone once. Track the relationship forever.">
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
              className="mt-1 rounded-button bg-glow/90 px-4 py-2.5 text-sm font-semibold text-depth-0 shadow-[0_0_24px_rgba(0,229,255,0.2)] transition-all duration-300 hover:bg-glow hover:shadow-[0_0_30px_rgba(0,229,255,0.3)] active:scale-[0.98] cursor-pointer"
            >
              Save Contact
            </button>
          </div>
        </Card>
      </div>

      {/* Network list — 2/3 */}
      <div className="lg:col-span-2">
        <Card
          title="Your Network"
          subtitle={loadingContacts ? "Loading..." : `${contacts.length} connection${contacts.length !== 1 ? "s" : ""}`}
          right={
            <button
              onClick={loadContacts}
              className="rounded-button bg-white/[0.04] px-3 py-2 text-sm font-medium text-white/60 transition-colors hover:bg-white/[0.08] hover:text-white cursor-pointer"
            >
              Refresh
            </button>
          }
        >
          <input
            className={inputCls}
            placeholder="Search name, company, job title, email, phone..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />

          <div className="mt-4 rounded-section bg-depth-0/40">
            <div className="grid grid-cols-[2.2fr_1.4fr_1.2fr_1.0fr_1.0fr_1.0fr_0.9fr] items-center gap-3 px-4 py-3 text-xs uppercase tracking-wider text-white/30 font-medium">
              <div>Name</div>
              <div>Company</div>
              <div>Title</div>
              <div>Details</div>
              <div>Follow Up</div>
              <div>Edit</div>
              <div>Delete</div>
            </div>

            <div className="h-px w-full bg-white/[0.04]" />

            {loadingContacts ? (
              <div className="px-4 py-8 text-center text-sm text-white/40">Loading your network...</div>
            ) : contacts.length === 0 ? (
              <div className="px-6 py-10 text-center">
                <p className="text-sm text-white/50">Your network is empty.</p>
                <p className="mt-1 text-xs text-white/25">
                  The best time to plant a tree was twenty years ago. The second best time is now.
                </p>
              </div>
            ) : (
              contacts.map((c, i) => {
                const displayName = [c.first_name, c.last_name].filter(Boolean).join(" ") || "\u2014";
                const li = c.linkedin_url ?? "";
                const isRecent = i < 3;
                const stale = isStale(c.id);

                return (
                  <div key={c.id} className="px-4">
                    <div className={`grid grid-cols-[2.2fr_1.4fr_1.2fr_1.0fr_1.0fr_1.0fr_0.9fr] items-center gap-3 py-3 transition-colors hover:bg-white/[0.02] ${isRecent ? "bg-white/[0.01]" : ""}`}>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <div className="min-w-0 flex-1">
                            {li ? (
                              <a
                                href={ensureUrl(li)}
                                target="_blank"
                                rel="noreferrer"
                                className="block truncate font-medium text-glow hover:underline"
                                title="Open LinkedIn"
                              >
                                {displayName}
                              </a>
                            ) : (
                              <div className="truncate font-medium text-white" title={displayName}>
                                {displayName}
                              </div>
                            )}
                            <div className="mt-0.5 truncate font-data text-white/30">
                              {[c.email, c.phone].filter(Boolean).join(" \u2022 ")}
                            </div>
                          </div>
                          {stale && (
                            <div className="shrink-0 rounded-badge bg-glow/15 px-2 py-1 text-xs font-medium text-glow" title="Last meeting was 30+ days ago">
                              Stale
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="truncate text-sm text-white/50" title={c.company ?? ""}>
                        {c.company ?? "\u2014"}
                      </div>

                      <div className="truncate text-sm text-white/50" title={c.title ?? ""}>
                        {c.title ?? "\u2014"}
                      </div>

                      <button
                        onClick={() => openDetails(c.id)}
                        className="w-full rounded-button bg-white/[0.04] px-3 py-2 text-sm font-medium text-white/60 transition-colors hover:bg-white/[0.08] hover:text-white cursor-pointer"
                      >
                        Details
                      </button>

                      {stale && onFollowUp ? (
                        <button
                          onClick={() => onFollowUp()}
                          className="w-full rounded-button bg-glow/10 px-3 py-2 text-sm font-medium text-glow transition-colors hover:bg-glow/20 cursor-pointer"
                          title="Start a follow-up outreach"
                        >
                          Follow Up
                        </button>
                      ) : (
                        <div />
                      )}

                      <button
                        onClick={() => openEdit(c)}
                        className="w-full rounded-button bg-white/[0.04] px-3 py-2 text-sm font-medium text-white/60 transition-colors hover:bg-white/[0.08] hover:text-white cursor-pointer"
                      >
                        Edit
                      </button>

                      <button
                        onClick={() => deleteContact(c.id)}
                        className="w-full rounded-button bg-danger/[0.06] px-3 py-2 text-sm font-medium text-danger/70 transition-colors hover:bg-danger/10 hover:text-danger cursor-pointer"
                      >
                        Delete
                      </button>
                    </div>

                    <div className="h-px w-full bg-white/[0.03]" />
                  </div>
                );
              })
            )}

            {contacts.length > 0 && (
              <div className="px-4 py-3 text-xs text-white/20">
                Click a name to open LinkedIn. Use Details to log meetings and notes.
              </div>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
