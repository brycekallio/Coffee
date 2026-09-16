import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { supabase, supabaseMisconfigured } from "./lib/supabase";
import { GCAL_OAUTH_STATE, initiateGCalOAuth } from "./lib/googleCalendar";
import type { Contact, ContactMeeting, Profile, Application, Page, FieldMap, ScheduledOutreach } from "./types";
import Modal from "./components/ui/Modal";
import Logo from "./components/ui/Logo";
import { initialsFromName, todayISODate, formatDateLabel, resumeStoragePath } from "./lib/utils";
import { parseCsv, inferFieldMap, splitName, isEmail, cleanLinkedIn, cleanPhone } from "./lib/csvHelper";
import { parsePdfToText, parsePdfFromUrl } from "./lib/resumeUtils";
import AuthPage from "./pages/AuthPage";
import PasswordRecoveryPage from "./pages/PasswordRecoveryPage";
import ContactsPage from "./pages/ContactsPage";
import ContactDetailsPage from "./pages/ContactDetailsPage";
import ApplicationsPage from "./pages/ApplicationsPage";
import AnalyticsPage from "./pages/AnalyticsPage";
import SettingsPage from "./pages/SettingsPage";
import OnboardingPage from "./pages/OnboardingPage";
import WatchlistPage from "./pages/WatchlistPage";
import OutreachEmailsPage from "./pages/OutreachEmailsPage";
import JdScorerPage from "./pages/JdScorerPage";


/* =============================== App =============================== */

export default function App() {
  const [session, setSession] = useState<any>(null);

  const [authEmail, setAuthEmail] = useState("");
  const [password, setPassword] = useState("");

  // Sign-up extra fields
  const [signupName, setSignupName] = useState("");
  const [signupPhone, setSignupPhone] = useState("");
  const [signupLinkedIn, setSignupLinkedIn] = useState("");
  const [signupCareerInterests, setSignupCareerInterests] = useState("");
  const [signupResumeFile, setSignupResumeFile] = useState<File | null>(null);

  const [page, setPage] = useState<Page>("contacts");
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [networkDropdownOpen, setNetworkDropdownOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [dueOutreachCount, setDueOutreachCount] = useState(0);

  const [profile, setProfile] = useState<Profile | null>(null);
  const [savingProfile, setSavingProfile] = useState(false);

  const [displayName, setDisplayName] = useState("");
  const [myLinkedInUrl, setMyLinkedInUrl] = useState("");
  const [userPhone, setUserPhone] = useState("");
  const [userCareerInterests, setUserCareerInterests] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");

  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loadingContacts, setLoadingContacts] = useState(false);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [company, setCompany] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [linkedinUrl, setLinkedinUrl] = useState("");

  const [search, setSearch] = useState("");

  const [editOpen, setEditOpen] = useState(false);
  const [editContact, setEditContact] = useState<Contact | null>(null);
  const [editFirst, setEditFirst] = useState("");
  const [editLast, setEditLast] = useState("");
  const [editCompany, setEditCompany] = useState("");
  const [editTitle, setEditTitle] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editLinkedIn, setEditLinkedIn] = useState("");

  const [importFileName, setImportFileName] = useState<string>("");
  const [importRows, setImportRows] = useState<Record<string, string>[]>([]);
  const [importMap, setImportMap] = useState<FieldMap>({});
  const [importing, setImporting] = useState(false);

  const [selectedContactId, setSelectedContactId] = useState<string>("");
  const [meetings, setMeetings] = useState<ContactMeeting[]>([]);
  const [loadingMeetings, setLoadingMeetings] = useState(false);
  const [meetingDraftDate, setMeetingDraftDate] = useState<string>(todayISODate());
  const [meetingDraftTitle, setMeetingDraftTitle] = useState<string>("");
  const [meetingSavingId, setMeetingSavingId] = useState<string>("");
  const [meetingDeletingId, setMeetingDeletingId] = useState<string>("");
  const [meetingDirty, setMeetingDirty] = useState<Record<string, boolean>>({});
  const [meetingEdits, setMeetingEdits] = useState<
    Record<
      string,
      {
        meeting_date: string;
        title: string;
        notes: string;
      }
    >
  >({});

  /* ----------------------------- Applications State ----------------------------- */
  const [applications, setApplications] = useState<Application[]>([]);
  const [loadingApps, setLoadingApps] = useState(false);

  const [appCompany, setAppCompany] = useState("");
  const [appLink, setAppLink] = useState("");
  const [appDate, setAppDate] = useState(todayISODate());
  const [appStatus, setAppStatus] = useState("Applied");
  const [appContactId, setAppContactId] = useState("");

  const [savingApp, setSavingApp] = useState(false);
  const [editingAppId, setEditingAppId] = useState<string | null>(null);

  /* ----------------------------- Scheduled Outreach State ----------------------------- */
  const [scheduledOutreach, setScheduledOutreach] = useState<ScheduledOutreach[]>([]);

  // Forgot password / recovery
  const [resettingPw, setResettingPw] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [recoveryMode, setRecoveryMode] = useState(false);
  const [recoveryNewPassword, setRecoveryNewPassword] = useState("");
  const [recoverySaving, setRecoverySaving] = useState(false);

  const inputCls =
    "w-full rounded-input bg-white/[0.04] px-3 py-2.5 text-sm text-white placeholder:text-white/25 outline-none transition-all duration-200 border border-white/[0.06] focus:border-glow/30 focus:bg-white/[0.06] focus:ring-1 focus:ring-glow/15";
  const selectCls =
    "w-full rounded-input bg-white/[0.04] px-3 py-2.5 text-sm text-white outline-none transition-all duration-200 border border-white/[0.06] focus:border-glow/30 focus:ring-1 focus:ring-glow/15";

  /* ----------------------------- Auth session ----------------------------- */

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));

    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY") {
        setRecoveryMode(true);
        setResetSent(false);
      }
      setSession(session);
      if (window.electronAPI && session?.access_token) {
        window.electronAPI.setAuthSession(session.access_token);
      }
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  /* ── Google Calendar OAuth callback ───────────────────────────────── */
  useEffect(() => {
    if (!session) return;
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    const state = params.get("state");
    if (code && state === GCAL_OAUTH_STATE) {
      // Clear the OAuth params from the URL immediately so a refresh doesn't re-trigger
      window.history.replaceState({}, "", window.location.pathname);
      const redirectUri = `${window.location.origin}/`;
      supabase.functions
        .invoke("exchange-google-token", { body: { code, redirect_uri: redirectUri } })
        .then(({ error }) => {
          if (error) {
            toast.error("Google Calendar connection failed: " + error.message);
          } else {
            toast.success("Google Calendar connected!");
            loadProfile();
          }
        });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  async function disconnectGCal() {
    if (!session?.user?.id) return;
    const { error } = await supabase
      .from("profiles")
      .update({
        google_calendar_token: null,
        google_calendar_refresh_token: null,
        google_calendar_token_expiry: null,
      })
      .eq("id", session.user.id);
    if (error) {
      toast.error("Failed to disconnect Google Calendar.");
    } else {
      toast.success("Google Calendar disconnected.");
      loadProfile();
    }
  }

  async function signUp() {
    if (!signupName.trim()) { toast.error("Full name is required."); return; }

    const { error } = await supabase.auth.signUp({ email: authEmail, password });
    if (error) { toast.error(error.message); return; }

    localStorage.setItem("coffee_pending_signup", JSON.stringify({
      full_name: signupName.trim(),
      phone: signupPhone.trim(),
      my_linkedin_url: signupLinkedIn.trim(),
      career_interests: signupCareerInterests.trim() || null,
    }));

    toast.success("Signed up. If email confirmation is enabled, confirm your email, then sign in.");
  }

  async function signIn() {
    const { error } = await supabase.auth.signInWithPassword({ email: authEmail, password });
    if (error) toast.error(error.message);
  }

  async function signOut() {
    await supabase.auth.signOut();
    setSession(null);
    setContacts([]);
    setProfile(null);
    setSelectedContactId("");
    setMeetings([]);
    setMeetingEdits({});
    setMeetingDirty({});
    setProfileMenuOpen(false);

    setResetSent(false);
    setResettingPw(false);
    setRecoveryMode(false);
    setRecoveryNewPassword("");
    setAuthEmail("");
    setPassword("");
  }

  async function requestPasswordReset() {
    const email = authEmail.trim().toLowerCase();

    if (!email) {
      toast.error("Enter your email first, then click Forgot my password.");
      return;
    }
    if (!isEmail(email)) {
      toast.error("Enter a valid email address (example: name@gmail.com).");
      return;
    }

    setResettingPw(true);
    try {
      const redirectTo = window.location.origin;
      const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
      if (error) throw error;

      setResetSent(true);
      toast.info("Password reset email sent. Check your inbox (and spam).");
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to send password reset email.");
    } finally {
      setResettingPw(false);
    }
  }

  async function completePasswordRecovery() {
    const pw = recoveryNewPassword.trim();
    if (pw.length < 6) {
      toast.error("Password must be at least 6 characters.");
      return;
    }

    setRecoverySaving(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: pw });
      if (error) throw error;

      setRecoveryMode(false);
      setRecoveryNewPassword("");
      toast.success("Password updated. You're signed in.");
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to update password.");
    } finally {
      setRecoverySaving(false);
    }
  }

  /* ----------------------------- Profile load/save ----------------------------- */

  function onboardingSeenKey(userId: string) {
    return `coffee_onboarding_seen_${userId}`;
  }

  function markOnboardingSeen() {
    if (!session?.user?.id) return;
    try {
      localStorage.setItem(onboardingSeenKey(session.user.id), "1");
    } catch {
      /* localStorage blocked — non-fatal */
    }
  }

  async function loadProfile() {
    if (!session?.user?.id) return;

    const { data, error } = await supabase
      .from("profiles")
      .select("id, full_name, my_linkedin_url, resume_url, avatar_url, resume_text, phone, career_interests, google_calendar_token, google_calendar_refresh_token, google_calendar_token_expiry")
      .eq("id", session.user.id)
      .maybeSingle();

    if (error) {
      toast.error("Failed to load profile.");
      return;
    }

    // Check for pending sign-up data (name/phone/LinkedIn/career interests captured by the
    // sign-up wizard, stashed in localStorage before the profile existed). A DB trigger
    // (handle_new_user) inserts a blank profiles row the moment the auth user is created —
    // before this ever runs — so `data` is virtually never null here even for a brand-new
    // signup. We still have to explicitly merge the pending data in, or it's silently lost.
    let pending: { full_name?: string; phone?: string; my_linkedin_url?: string; career_interests?: string | null } | null = null;
    try {
      const raw = localStorage.getItem("coffee_pending_signup");
      if (raw) pending = JSON.parse(raw);
    } catch { /* ignore */ }

    let row: Record<string, any> | null = data;

    if (!row) {
      const insertPayload: Record<string, any> = {
        id: session.user.id,
        full_name: pending?.full_name || null,
        my_linkedin_url: pending?.my_linkedin_url || null,
        phone: pending?.phone || null,
        career_interests: pending?.career_interests || null,
        resume_url: null,
        avatar_url: null,
      };
      const { data: inserted, error: insErr } = await supabase
        .from("profiles")
        .insert(insertPayload)
        .select()
        .single();
      if (insErr) toast.error("Failed to create profile.");
      row = inserted ?? insertPayload;
    } else if (pending && (pending.full_name || pending.phone || pending.my_linkedin_url || pending.career_interests)) {
      // Row already existed (created blank by the DB trigger) — merge the pending data in
      // rather than leaving it stranded in localStorage and the row permanently blank.
      const updatePayload: Record<string, any> = {};
      if (pending.full_name) updatePayload.full_name = pending.full_name;
      if (pending.my_linkedin_url) updatePayload.my_linkedin_url = pending.my_linkedin_url;
      if (pending.phone) updatePayload.phone = pending.phone;
      if (pending.career_interests) updatePayload.career_interests = pending.career_interests;

      const { data: updated, error: updErr } = await supabase
        .from("profiles")
        .update(updatePayload)
        .eq("id", session.user.id)
        .select()
        .single();
      if (updErr) toast.error("Failed to save your sign-up details.");
      else if (updated) row = updated;
    }

    if (pending) {
      if (signupResumeFile) {
        await uploadResume(signupResumeFile);
        setSignupResumeFile(null);
      }
      localStorage.removeItem("coffee_pending_signup");
    }

    setProfile(row as Profile);
    setDisplayName(row?.full_name ?? "");
    setMyLinkedInUrl(row?.my_linkedin_url ?? "");
    setUserPhone(row?.phone ?? "");
    setUserCareerInterests(row?.career_interests ?? "");
    setNewEmail(session?.user?.email ?? "");

    // Skip onboarding if the profile already has a name, or the user has already been through it.
    const alreadySeen = (() => {
      try { return localStorage.getItem(onboardingSeenKey(session.user.id)) === "1"; }
      catch { return false; }
    })();
    if (!row?.full_name?.trim() && !alreadySeen) {
      setPage("onboarding");
    } else if (row?.full_name?.trim()) {
      // User has a name — onboarding is done; make sure we don't show it again.
      markOnboardingSeen();
    }
  }

  async function checkDueOutreach() {
    const { data } = await supabase
      .from("scheduled_outreach")
      .select("id")
      .eq("status", "scheduled")
      .lte("scheduled_at", new Date().toISOString());
    setDueOutreachCount(data?.length ?? 0);
  }

  useEffect(() => {
    if (session) {
      loadProfile();
      loadContacts();
      loadApplications();
      loadScheduledOutreach();
      checkDueOutreach();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  async function saveProfile() {
    if (!session?.user?.id) return;

    setSavingProfile(true);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({
          full_name: displayName || null,
          my_linkedin_url: myLinkedInUrl || null,
          phone: userPhone || null,
          career_interests: userCareerInterests || null,
        })
        .eq("id", session.user.id);

      if (error) throw error;

      if (newEmail && newEmail !== session.user.email) {
        const { error: eErr } = await supabase.auth.updateUser({ email: newEmail });
        if (eErr) throw eErr;
        toast.info("Email update requested. Supabase may require email confirmation.");
      }

      if (newPassword.trim().length >= 6) {
        const { error: pErr } = await supabase.auth.updateUser({ password: newPassword.trim() });
        if (pErr) throw pErr;
        setNewPassword("");
        toast.success("Password updated.");
      }

      await loadProfile();
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to save profile.");
    } finally {
      setSavingProfile(false);
    }
  }

  async function uploadResume(file: File) {
    if (!session?.user?.id) return;

    const ext = file.name.split(".").pop()?.toLowerCase() || "pdf";
    const path = `${session.user.id}/resume.${ext}`;

    setSavingProfile(true);
    try {
      const { error: upErr } = await supabase.storage.from("resumes").upload(path, file, { upsert: true });
      if (upErr) throw upErr;

      // resume_url stores the bare Storage object path — the `resumes` bucket is private,
      // so callers must sign a fresh URL (see getResumeUrl) rather than fetching this directly.
      const updatePayload: { resume_url: string; resume_text?: string } = { resume_url: path };

      if (ext === "pdf") {
        try {
          const text = await parsePdfToText(file);
          updatePayload.resume_text = text;
        } catch (parseErr) {
          console.error("[uploadResume] PDF parse failed", parseErr);
          toast.info("Resume uploaded, but text extraction failed. You can re-parse later.");
        }
      } else {
        toast.info("Non-PDF resume uploaded. Text extraction is only available for PDF files.");
      }

      // Try full update first; if it fails because `resume_text` column doesn't exist yet
      // in the deployed DB, retry without it so the URL still persists and the user isn't
      // left with a silently-failed save.
      let updateRes = await supabase.from("profiles").update(updatePayload).eq("id", session.user.id);
      if (
        updateRes.error &&
        updatePayload.resume_text !== undefined &&
        /resume_text/i.test(updateRes.error.message || "")
      ) {
        console.error(
          "[uploadResume] profiles.resume_text column appears to be missing on this DB — " +
            "run docs/migration_add_profile_columns.sql in Supabase SQL Editor. Retrying without it."
        );
        const fallback: { resume_url: string } = { resume_url: updatePayload.resume_url };
        updateRes = await supabase.from("profiles").update(fallback).eq("id", session.user.id);
        if (!updateRes.error) {
          toast.error(
            "Resume uploaded, but text couldn't be saved — your DB is missing the resume_text column. Run the migration in docs/migration_add_profile_columns.sql."
          );
        }
      }
      if (updateRes.error) {
        console.error("[uploadResume] profile update failed", updateRes.error);
        throw updateRes.error;
      }

      await loadProfile();
      toast.success("Resume uploaded.");
    } catch (e: any) {
      console.error("[uploadResume] failed", e);
      const msg =
        e?.message ||
        e?.error_description ||
        "Resume upload failed. Make sure the Storage bucket 'resumes' exists and profiles RLS allows updates.";
      toast.error(msg);
    } finally {
      setSavingProfile(false);
    }
  }

  /** Signs a fresh, short-lived URL for the current resume — the bucket is private. */
  async function getResumeUrl(expiresInSeconds = 3600): Promise<string | null> {
    if (!profile?.resume_url) return null;
    const path = resumeStoragePath(profile.resume_url);
    const { data, error } = await supabase.storage.from("resumes").createSignedUrl(path, expiresInSeconds);
    if (error || !data?.signedUrl) {
      toast.error(error?.message ?? "Failed to access resume.");
      return null;
    }
    return data.signedUrl;
  }

  async function openResume() {
    const url = await getResumeUrl();
    if (url) window.open(url, "_blank", "noopener,noreferrer");
  }

  async function reparseResume() {
    if (!session?.user?.id || !profile?.resume_url) return;

    if (!profile.resume_url.toLowerCase().endsWith(".pdf")) {
      toast.error("Re-parse is only available for PDF resumes.");
      return;
    }

    setSavingProfile(true);
    try {
      const url = await getResumeUrl();
      if (!url) return;
      const text = await parsePdfFromUrl(url);
      const { error } = await supabase
        .from("profiles")
        .update({ resume_text: text })
        .eq("id", session.user.id);
      if (error) throw error;
      await loadProfile();
      toast.success("Resume text re-parsed.");
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to re-parse resume.");
    } finally {
      setSavingProfile(false);
    }
  }

  /* ----------------------------- Applications CRUD ----------------------------- */

  async function loadApplications() {
    if (!session?.user?.id) return;
    setLoadingApps(true);
    const { data, error } = await supabase
      .from("applications")
      .select("*")
      .order("date_applied", { ascending: false })
      .order("created_at", { ascending: false });

    setLoadingApps(false);
    if (error) {
      toast.error("Failed to load applications.");
      return;
    }
    setApplications((data ?? []) as Application[]);
  }

  async function loadScheduledOutreach() {
    if (!session?.user?.id) return;
    const { data, error } = await supabase
      .from("scheduled_outreach")
      .select("*")
      .order("scheduled_at", { ascending: false });

    if (error) {
      console.error("Failed to load scheduled outreach:", error);
      return;
    }
    setScheduledOutreach((data ?? []) as ScheduledOutreach[]);
  }

  async function saveApplication() {
    if (!session?.user?.id) return;
    if (!appCompany.trim()) {
      toast.error("Company name is required.");
      return;
    }

    setSavingApp(true);
    try {
      const payload = {
        owner_id: session.user.id,
        company: appCompany.trim(),
        link: appLink.trim() || null,
        date_applied: appDate || null,
        status: appStatus.trim() || "Applied",
        contact_id: appContactId || null,
      };

      if (editingAppId) {
        const { error } = await supabase
          .from("applications")
          .update(payload)
          .eq("id", editingAppId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("applications").insert(payload);
        if (error) throw error;
      }

      setAppCompany("");
      setAppLink("");
      setAppDate(todayISODate());
      setAppStatus("Applied");
      setEditingAppId(null);

      await loadApplications();
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to save application. Did you create the table?");
    } finally {
      setSavingApp(false);
    }
  }

  async function deleteApplication(id: string) {
    if (!confirm("Delete this application?")) return;
    const { error } = await supabase.from("applications").delete().eq("id", id);
    if (error) toast.error(error.message);
    else loadApplications();
  }

  function startEditApp(a: Application) {
    setEditingAppId(a.id);
    setAppCompany(a.company);
    setAppLink(a.link ?? "");
    setAppDate(a.date_applied ?? "");
    setAppStatus(a.status);
    setAppContactId(a.contact_id ?? "");
  }

  function cancelEditApp() {
    setEditingAppId(null);
    setAppCompany("");
    setAppLink("");
    setAppDate(todayISODate());
    setAppStatus("Applied");
    setAppContactId("");
  }

  /* ----------------------------- Contacts CRUD ----------------------------- */

  async function loadContacts() {
    setLoadingContacts(true);
    const { data, error } = await supabase
      .from("contacts")
      .select("id, owner_id, first_name, last_name, company, title, email, phone, linkedin_url, status, created_at")
      .order("created_at", { ascending: false });

    setLoadingContacts(false);

    if (error) {
      toast.error(error.message);
      return;
    }
    setContacts((data ?? []) as Contact[]);
  }

  async function addContact() {
    if (!session?.user?.id) return;

    const { error } = await supabase.from("contacts").insert({
      owner_id: session.user.id,
      first_name: firstName || null,
      last_name: lastName || null,
      company: company || null,
      title: jobTitle || null,
      email: contactEmail || null,
      phone: phone || null,
      linkedin_url: linkedinUrl || null,
      status: "to_contact",
    });

    if (error) {
      toast.error(error.message);
      return;
    }

    setFirstName("");
    setLastName("");
    setCompany("");
    setJobTitle("");
    setContactEmail("");
    setPhone("");
    setLinkedinUrl("");

    loadContacts();
  }

  async function deleteContact(contactId: string) {
    const ok = window.confirm("Delete this person from your Network? This cannot be undone.");
    if (!ok) return;
    const { error } = await supabase.from("contacts").delete().eq("id", contactId);
    if (error) toast.error(error.message);
    else {
      if (selectedContactId === contactId) {
        setSelectedContactId("");
        setMeetings([]);
        setMeetingEdits({});
        setMeetingDirty({});
        setPage("contacts");
      }
      loadContacts();
    }
  }

  function openEdit(c: Contact) {
    setEditContact(c);
    setEditFirst(c.first_name ?? "");
    setEditLast(c.last_name ?? "");
    setEditCompany(c.company ?? "");
    setEditTitle(c.title ?? "");
    setEditEmail(c.email ?? "");
    setEditPhone(c.phone ?? "");
    setEditLinkedIn(c.linkedin_url ?? "");
    setEditOpen(true);
  }

  async function saveEdit() {
    if (!editContact?.id) return;

    const { error } = await supabase
      .from("contacts")
      .update({
        first_name: editFirst || null,
        last_name: editLast || null,
        company: editCompany || null,
        title: editTitle || null,
        email: editEmail || null,
        phone: editPhone || null,
        linkedin_url: editLinkedIn || null,
      })
      .eq("id", editContact.id);

    if (error) {
      toast.error(error.message);
      return;
    }

    setEditOpen(false);
    setEditContact(null);
    loadContacts();
  }

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return contacts.filter((c) => {
      if (!s) return true;
      return [c.first_name, c.last_name, c.company, c.title, c.email, c.phone]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(s);
    });
  }, [contacts, search]);

  /* ----------------------------- Contact Details (meetings/notes) ----------------------------- */

  const selectedContact = useMemo(() => {
    return contacts.find((c) => c.id === selectedContactId) ?? null;
  }, [contacts, selectedContactId]);

  async function loadMeetings(contactId: string) {
    if (!session?.user?.id) return;
    if (!contactId) return;

    setLoadingMeetings(true);
    try {
      const { data, error } = await supabase
        .from("contact_meetings")
        .select("id, owner_id, contact_id, meeting_date, title, notes, created_at")
        .eq("contact_id", contactId)
        .order("meeting_date", { ascending: false })
        .order("created_at", { ascending: false });

      if (error) throw error;

      const rows = (data ?? []) as ContactMeeting[];
      setMeetings(rows);

      const edits: typeof meetingEdits = {};
      const dirty: typeof meetingDirty = {};
      for (const m of rows) {
        edits[m.id] = {
          meeting_date: (m.meeting_date ?? "").slice(0, 10),
          title: m.title ?? "",
          notes: m.notes ?? "",
        };
        dirty[m.id] = false;
      }
      setMeetingEdits(edits);
      setMeetingDirty(dirty);
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to load meetings. Did you create the contact_meetings table?");
      setMeetings([]);
      setMeetingEdits({});
      setMeetingDirty({});
    } finally {
      setLoadingMeetings(false);
    }
  }

  async function openDetails(contactId: string) {
    setSelectedContactId(contactId);
    setPage("contact_details");
  }

  function handleFollowUp() {
    setPage("outreach_emails");
  }

  useEffect(() => {
    if (page === "contact_details" && selectedContactId) {
      loadMeetings(selectedContactId);
    }
    if (page === "applications") {
      loadApplications();
      if (contacts.length === 0) loadContacts();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, selectedContactId]);

  async function addMeeting() {
    if (!session?.user?.id) return;
    if (!selectedContactId) return;

    const date = (meetingDraftDate || "").trim() || todayISODate();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      toast.error("Meeting date must be in YYYY-MM-DD format.");
      return;
    }

    try {
      const { error } = await supabase.from("contact_meetings").insert({
        owner_id: session.user.id,
        contact_id: selectedContactId,
        meeting_date: date,
        title: meetingDraftTitle.trim() || null,
        notes: null,
      });
      if (error) throw error;

      setMeetingDraftTitle("");
      await loadMeetings(selectedContactId);
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to add meeting.");
    }
  }

  async function saveMeeting(meetingId: string) {
    if (!session?.user?.id) return;
    if (!meetingId) return;

    const draft = meetingEdits[meetingId];
    if (!draft) return;

    const date = (draft.meeting_date || "").trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      toast.error("Meeting date must be in YYYY-MM-DD format.");
      return;
    }

    setMeetingSavingId(meetingId);
    try {
      const { error } = await supabase
        .from("contact_meetings")
        .update({
          meeting_date: date,
          title: draft.title.trim() || null,
          notes: draft.notes ?? null,
        })
        .eq("id", meetingId);

      if (error) throw error;

      setMeetingDirty((prev) => ({ ...prev, [meetingId]: false }));
      await loadMeetings(selectedContactId);
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to save meeting notes.");
    } finally {
      setMeetingSavingId("");
    }
  }

  async function deleteMeeting(meetingId: string) {
    if (!meetingId) return;
    const ok = window.confirm("Delete this meeting note folder? This cannot be undone.");
    if (!ok) return;

    setMeetingDeletingId(meetingId);
    try {
      const { error } = await supabase.from("contact_meetings").delete().eq("id", meetingId);
      if (error) throw error;
      await loadMeetings(selectedContactId);
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to delete meeting.");
    } finally {
      setMeetingDeletingId("");
    }
  }

  function setMeetingField(meetingId: string, key: "meeting_date" | "title" | "notes", value: string) {
    setMeetingEdits((prev) => ({
      ...prev,
      [meetingId]: {
        meeting_date: prev[meetingId]?.meeting_date ?? "",
        title: prev[meetingId]?.title ?? "",
        notes: prev[meetingId]?.notes ?? "",
        [key]: value,
      },
    }));
    setMeetingDirty((prev) => ({ ...prev, [meetingId]: true }));
  }

  async function importMeetingFromTranscript(
    contactId: string,
    transcript: string,
    meetingDate: string,
    label: string,
  ) {
    const contact = contacts.find((c) => c.id === contactId);
    const contactName = contact
      ? [contact.first_name, contact.last_name].filter(Boolean).join(" ")
      : "";
    const contactCompany = contact?.company ?? "";

    const { data: fnData, error: fnError } = await supabase.functions.invoke(
      "process-meeting-notes",
      {
        body: {
          transcript,
          contact_name: contactName,
          contact_company: contactCompany,
          meeting_date: meetingDate,
        },
      },
    );

    if (fnError) {
      toast.error("Transcript processing failed: " + fnError.message);
      return;
    }
    if (fnData?.error) {
      toast.error("Transcript processing failed: " + fnData.error);
      return;
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { toast.error("Not signed in."); return; }

    const title = label.trim() || fnData.suggested_title || "Meeting";
    const notes = fnData.formatted_notes ?? "";

    const { error: insErr } = await supabase.from("contact_meetings").insert({
      owner_id: user.id,
      contact_id: contactId,
      meeting_date: meetingDate,
      title,
      notes,
    });

    if (insErr) {
      toast.error("Failed to save meeting note: " + insErr.message);
      return;
    }

    toast.success("Meeting notes extracted and saved!");
    await loadMeetings(contactId);
  }

  /* ----------------------------- Import page handlers ----------------------------- */

  async function onPickCsv(file: File) {
    setImportFileName(file.name);
    const text = await file.text();
    const parsed = parseCsv(text);

    setImportRows(parsed.rows);

    const mapping = inferFieldMap(parsed.headers, parsed.rows);
    setImportMap(mapping);
  }

  async function importIntoSupabase() {
    if (!session?.user?.id) return;
    if (importRows.length === 0) return;

    setImporting(true);

    try {
      const rows = importRows;
      const map = importMap;
      const owner_id = session.user.id;

      const seen = new Set<string>();
      const inserts: any[] = [];

      for (const r of rows) {
        const emailRaw = map.email ? r[map.email] : "";
        const phoneRaw = map.phone ? r[map.phone] : "";
        const liRaw = map.linkedin_url ? r[map.linkedin_url] : "";
        const companyRaw = map.company ? r[map.company] : "";
        const titleRaw = map.title ? r[map.title] : "";
        const statusRaw = map.status ? r[map.status] : "";

        let first = "";
        let last = "";

        if (map.first_name || map.last_name) {
          first = map.first_name ? r[map.first_name] : "";
          last = map.last_name ? r[map.last_name] : "";
        } else if (map.full_name) {
          const sn = splitName(r[map.full_name]);
          first = sn.first;
          last = sn.last;
        }

        const email = isEmail(emailRaw) ? emailRaw.trim() : "";
        const phone = cleanPhone(phoneRaw) ?? "";
        const linkedin = cleanLinkedIn(liRaw) ?? "";

        const dedupeKey =
          (email || "").toLowerCase() ||
          (linkedin || "").toLowerCase() ||
          `${first.toLowerCase()}|${last.toLowerCase()}|${(companyRaw || "").toLowerCase()}`;

        if (!dedupeKey.trim()) continue;
        if (seen.has(dedupeKey)) continue;
        seen.add(dedupeKey);

        let status = "to_contact";
        const sr = String(statusRaw ?? "").trim().toLowerCase().replaceAll(" ", "_");
        if (sr) status = sr;

        inserts.push({
          owner_id,
          first_name: first || null,
          last_name: last || null,
          company: companyRaw?.trim() ? companyRaw.trim() : null,
          title: titleRaw?.trim() ? titleRaw.trim() : null,
          email: email || null,
          phone: phone || null,
          linkedin_url: linkedin || null,
          status,
        });
      }

      if (inserts.length === 0) {
        toast.error("No valid rows found to import.");
        return;
      }

      const CHUNK = 200;
      for (let i = 0; i < inserts.length; i += CHUNK) {
        const chunk = inserts.slice(i, i + CHUNK);
        const { error } = await supabase.from("contacts").insert(chunk);
        if (error) throw error;
      }

      setImportFileName("");
      setImportRows([]);
      setImportMap({});
      await loadContacts();
      toast.success("Import complete.");
      setPage("contacts");
    } catch (e: any) {
      toast.error(e?.message ?? "Import failed.");
    } finally {
      setImporting(false);
    }
  }

  /* =============================== Password Recovery Screen =============================== */

  if (recoveryMode) {
    return (
      <PasswordRecoveryPage
        recoveryNewPassword={recoveryNewPassword}
        setRecoveryNewPassword={setRecoveryNewPassword}
        recoverySaving={recoverySaving}
        completePasswordRecovery={completePasswordRecovery}
        signOut={signOut}
        inputCls={inputCls}
      />
    );
  }

  /* =============================== Auth Screen =============================== */

  if (!session) {
    return (
      <AuthPage
        authEmail={authEmail}
        setAuthEmail={setAuthEmail}
        password={password}
        setPassword={setPassword}
        resetSent={resetSent}
        setResetSent={setResetSent}
        resettingPw={resettingPw}
        signIn={signIn}
        signUp={signUp}
        requestPasswordReset={requestPasswordReset}
        signupName={signupName}
        setSignupName={setSignupName}
        signupPhone={signupPhone}
        setSignupPhone={setSignupPhone}
        signupLinkedIn={signupLinkedIn}
        setSignupLinkedIn={setSignupLinkedIn}
        signupCareerInterests={signupCareerInterests}
        setSignupCareerInterests={setSignupCareerInterests}
        setSignupResumeFile={setSignupResumeFile}
      />
    );
  }

  /* =============================== App Shell =============================== */

  const profileLabel = profile?.full_name?.trim() || session?.user?.email?.split("@")?.[0] || "User";
  const avatarText = initialsFromName(profileLabel);

  const navLinkCls = (active: boolean) =>
    `relative px-3 py-2 rounded-lg text-[13px] font-medium cursor-pointer transition-all duration-200 ${
      active
        ? "text-glow bg-glow/[0.08]"
        : "text-white/40 hover:text-white/70 hover:bg-white/[0.04]"
    }`;

  // Checked after every hook above has run (not as an early return before them) — React
  // requires the same hooks to run on every render of a given mounted component, and since
  // `supabaseMisconfigured` is a static, module-level value that never changes at runtime,
  // gating only the rendered output here is equivalent in practice and satisfies that rule.
  if (supabaseMisconfigured) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-depth-0 p-8 text-white">
        <div className="max-w-md text-center space-y-4">
          <h1 className="text-2xl font-bold text-danger">Configuration Error</h1>
          <p className="text-white/50">
            Required environment variables are missing. Set the following in your{" "}
            <code className="rounded-badge bg-white/[0.06] px-1.5 py-0.5 text-sm text-glow">.env.local</code> file:
          </p>
          <ul className="space-y-1 rounded-input bg-depth-1 p-4 text-left text-sm font-mono text-glow">
            <li>VITE_SUPABASE_URL</li>
            <li>VITE_SUPABASE_ANON_KEY</li>
          </ul>
          <p className="text-sm text-white/30">
            Copy <code className="rounded-badge bg-white/[0.06] px-1 py-0.5">.env.example</code> to{" "}
            <code className="rounded-badge bg-white/[0.06] px-1 py-0.5">.env.local</code> and fill in the values.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen text-white">
      {/* Living canvas background */}
      <div className="fixed inset-0 -z-10 bg-depth-0" />
      <div className="fixed inset-0 -z-10 living-canvas" />

      {/* Top Nav */}
      <nav className="sticky top-0 z-50 border-b border-white/[0.04] bg-depth-0/70 backdrop-blur-2xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-2.5 md:px-6">
          {/* Left: Logo + Nav Links */}
          <div className="flex items-center gap-1 md:gap-1.5">
            <button
              onClick={() => { setPage("contacts"); setSelectedContactId(""); }}
              className="mr-3 md:mr-5 cursor-pointer transition-opacity hover:opacity-80"
            >
              <Logo size="sm" />
            </button>

            {/* Desktop nav links */}
            <div className="hidden items-center gap-0.5 md:flex">
              {/* Network dropdown */}
              <div className="relative">
                <button
                  onClick={() => setNetworkDropdownOpen((v) => !v)}
                  className={navLinkCls(page === "contacts" || page === "contact_details" || page === "network_watchlist")}
                >
                  <span className="flex items-center gap-1">
                    Network
                    <svg className={`h-3 w-3 transition-transform duration-200 ${networkDropdownOpen ? "rotate-180" : ""} ${page === "contacts" || page === "contact_details" || page === "network_watchlist" ? "text-glow/50" : "text-white/20"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                    </svg>
                  </span>
                </button>
                {networkDropdownOpen && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setNetworkDropdownOpen(false)} />
                    <div className="absolute left-0 z-50 mt-2 w-52 overflow-hidden rounded-xl bg-depth-1/95 backdrop-blur-xl border border-white/[0.06] shadow-[0_20px_60px_rgba(0,0,0,0.5)]">
                      <div className="p-1.5">
                        <button
                          onClick={() => { setPage("contacts"); setSelectedContactId(""); setNetworkDropdownOpen(false); }}
                          className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition-colors cursor-pointer ${page === "contacts" || page === "contact_details" ? "bg-glow/[0.08] text-glow font-medium" : "text-white/60 hover:bg-white/[0.04] hover:text-white"}`}
                        >
                          <svg className={`h-4 w-4 ${page === "contacts" || page === "contact_details" ? "text-glow/70" : "text-white/30"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                          </svg>
                          Contacts
                        </button>
                        <button
                          onClick={() => { setPage("network_watchlist"); setSelectedContactId(""); setNetworkDropdownOpen(false); }}
                          className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition-colors cursor-pointer ${page === "network_watchlist" ? "bg-glow/[0.08] text-glow font-medium" : "text-white/60 hover:bg-white/[0.04] hover:text-white"}`}
                        >
                          <svg className={`h-4 w-4 ${page === "network_watchlist" ? "text-glow/70" : "text-white/30"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                          </svg>
                          Watchlist
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>

              <button
                onClick={() => { setPage("outreach_emails"); setSelectedContactId(""); }}
                className={`${navLinkCls(page === "outreach_emails")} relative`}
              >
                Outreach
                {dueOutreachCount > 0 && (
                  <span className="absolute -right-0.5 -top-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-glow px-1 text-[9px] font-bold text-depth-0 shadow-[0_0_8px_rgba(0,229,255,0.4)]">
                    {dueOutreachCount}
                  </span>
                )}
              </button>

              <button
                onClick={() => { setPage("applications"); setSelectedContactId(""); }}
                className={navLinkCls(page === "applications")}
              >
                Applications
              </button>

              <button
                onClick={() => { setPage("jd_scorer"); setSelectedContactId(""); }}
                className={navLinkCls(page === "jd_scorer")}
              >
                JD Comparison
              </button>

              <button
                onClick={() => { setPage("analytics"); setSelectedContactId(""); }}
                className={navLinkCls(page === "analytics")}
              >
                Analytics
              </button>
            </div>
          </div>

          {/* Right: Profile + Mobile hamburger */}
          <div className="flex items-center gap-2">
            {/* Settings icon (desktop) */}
            <button
              onClick={() => { setPage("settings"); setSelectedContactId(""); }}
              className={`hidden md:flex items-center justify-center h-8 w-8 rounded-lg transition-all duration-200 cursor-pointer ${page === "settings" ? "bg-glow/[0.08] text-glow" : "text-white/30 hover:text-white/60 hover:bg-white/[0.04]"}`}
              title="Settings"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </button>

            {/* Divider */}
            <div className="hidden md:block h-5 w-px bg-white/[0.06]" />

            {/* Profile menu */}
            <div className="relative">
              <button
                onClick={() => setProfileMenuOpen((v) => !v)}
                className="flex items-center gap-2 rounded-xl bg-white/[0.03] px-2 py-1.5 transition-all duration-200 hover:bg-white/[0.06] border border-transparent hover:border-white/[0.06] md:gap-2.5 md:px-2.5 cursor-pointer"
              >
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-glow/20 to-glow-purple/20 text-[11px] font-bold text-glow">
                  {avatarText}
                </div>
                <div className="hidden text-left md:block">
                  <div className="text-[13px] font-medium text-white/80 leading-tight">{profileLabel}</div>
                </div>
                <svg className={`hidden md:block h-3 w-3 text-white/20 transition-transform duration-200 ${profileMenuOpen ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {profileMenuOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setProfileMenuOpen(false)} />
                  <div className="absolute right-0 z-50 mt-2 w-56 overflow-hidden rounded-xl bg-depth-1/95 backdrop-blur-xl border border-white/[0.06] shadow-[0_20px_60px_rgba(0,0,0,0.5)]">
                    {/* Profile header in dropdown */}
                    <div className="px-4 py-3 border-b border-white/[0.06]">
                      <div className="text-sm font-medium text-white/80">{profileLabel}</div>
                      <div className="font-data text-white/30 mt-0.5">{session?.user?.email}</div>
                    </div>
                    <div className="p-1.5">
                      <button
                        onClick={() => { setPage("settings"); setSelectedContactId(""); setProfileMenuOpen(false); }}
                        className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm text-white/60 transition-colors hover:bg-white/[0.04] hover:text-white cursor-pointer"
                      >
                        <svg className="h-4 w-4 text-white/30" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                        Settings
                      </button>
                      <button
                        onClick={() => { setProfileMenuOpen(false); signOut(); }}
                        className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm text-white/60 transition-colors hover:bg-white/[0.04] hover:text-white cursor-pointer"
                      >
                        <svg className="h-4 w-4 text-white/30" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                        </svg>
                        Sign out
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Mobile hamburger */}
            <button
              onClick={() => setMobileMenuOpen((v) => !v)}
              className="inline-flex items-center justify-center rounded-lg bg-white/[0.03] p-2 transition-all duration-200 hover:bg-white/[0.06] md:hidden cursor-pointer"
              aria-label="Open menu"
            >
              <div className="relative h-4 w-4">
                <span className={`absolute left-0 h-0.5 w-4 rounded bg-white/50 transition-all duration-300 ${mobileMenuOpen ? "top-[7px] rotate-45" : "top-0.5"}`} />
                <span className={`absolute left-0 top-[7px] h-0.5 w-4 rounded bg-white/50 transition-all duration-300 ${mobileMenuOpen ? "opacity-0 scale-0" : "opacity-100"}`} />
                <span className={`absolute left-0 h-0.5 w-4 rounded bg-white/50 transition-all duration-300 ${mobileMenuOpen ? "top-[7px] -rotate-45" : "top-[13px]"}`} />
              </div>
            </button>
          </div>
        </div>

        {/* Mobile menu — slide down */}
        <div
          className={`overflow-hidden transition-all duration-300 ease-out md:hidden ${mobileMenuOpen ? "max-h-96 opacity-100" : "max-h-0 opacity-0"}`}
        >
          <div className="border-t border-white/[0.04] px-4 pb-4 pt-2 space-y-0.5">
            <button onClick={() => { setPage("contacts"); setSelectedContactId(""); setMobileMenuOpen(false); }} className={`${navLinkCls(page === "contacts" || page === "contact_details")} block w-full text-left py-2.5`}>
              <span className="flex items-center gap-3">
                <svg className="h-4 w-4 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}><path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                Network
              </span>
            </button>
            <button onClick={() => { setPage("network_watchlist"); setSelectedContactId(""); setMobileMenuOpen(false); }} className={`${navLinkCls(page === "network_watchlist")} block w-full text-left py-2.5`}>
              <span className="flex items-center gap-3">
                <svg className="h-4 w-4 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                Watchlist
              </span>
            </button>
            <button onClick={() => { setPage("outreach_emails"); setSelectedContactId(""); setMobileMenuOpen(false); }} className={`${navLinkCls(page === "outreach_emails")} block w-full text-left py-2.5`}>
              <span className="flex items-center gap-3">
                <svg className="h-4 w-4 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}><path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                Outreach
                {dueOutreachCount > 0 && <span className="ml-auto inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-glow px-1.5 text-[10px] font-bold text-depth-0">{dueOutreachCount}</span>}
              </span>
            </button>
            <button onClick={() => { setPage("applications"); setSelectedContactId(""); setMobileMenuOpen(false); }} className={`${navLinkCls(page === "applications")} block w-full text-left py-2.5`}>
              <span className="flex items-center gap-3">
                <svg className="h-4 w-4 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                Applications
              </span>
            </button>
            <button onClick={() => { setPage("jd_scorer"); setSelectedContactId(""); setMobileMenuOpen(false); }} className={`${navLinkCls(page === "jd_scorer")} block w-full text-left py-2.5`}>
              <span className="flex items-center gap-3">
                <svg className="h-4 w-4 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" /></svg>
                JD Comparison
              </span>
            </button>
            <button onClick={() => { setPage("analytics"); setSelectedContactId(""); setMobileMenuOpen(false); }} className={`${navLinkCls(page === "analytics")} block w-full text-left py-2.5`}>
              <span className="flex items-center gap-3">
                <svg className="h-4 w-4 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}><path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
                Analytics
              </span>
            </button>
            <div className="my-2 h-px bg-white/[0.04]" />
            <button onClick={() => { setPage("settings"); setSelectedContactId(""); setMobileMenuOpen(false); }} className={`${navLinkCls(page === "settings")} block w-full text-left py-2.5`}>
              <span className="flex items-center gap-3">
                <svg className="h-4 w-4 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}><path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                Settings
              </span>
            </button>
          </div>
        </div>
      </nav>

      <div className="page-enter">

        {/* APPLICATIONS PAGE */}
        {page === "applications" ? (
          <ApplicationsPage
            applications={applications}
            loadingApps={loadingApps}
            loadApplications={loadApplications}
            contacts={contacts}
            appCompany={appCompany}
            setAppCompany={setAppCompany}
            appLink={appLink}
            setAppLink={setAppLink}
            appDate={appDate}
            setAppDate={setAppDate}
            appStatus={appStatus}
            setAppStatus={setAppStatus}
            appContactId={appContactId}
            setAppContactId={setAppContactId}
            savingApp={savingApp}
            editingAppId={editingAppId}
            saveApplication={saveApplication}
            cancelEditApp={cancelEditApp}
            startEditApp={startEditApp}
            deleteApplication={deleteApplication}
            inputCls={inputCls}
            selectCls={selectCls}
          />
        ) : null}

        {/* ANALYTICS PAGE */}
        {page === "analytics" ? (
          <AnalyticsPage
            applications={applications}
            contacts={contacts}
            scheduledOutreach={scheduledOutreach}
          />
        ) : null}

        {/* NETWORK PAGE */}
        {page === "contacts" ? (
          <ContactsPage
            contacts={filtered}
            loadingContacts={loadingContacts}
            loadContacts={loadContacts}
            search={search}
            setSearch={setSearch}
            firstName={firstName}
            setFirstName={setFirstName}
            lastName={lastName}
            setLastName={setLastName}
            company={company}
            setCompany={setCompany}
            jobTitle={jobTitle}
            setJobTitle={setJobTitle}
            contactEmail={contactEmail}
            setContactEmail={setContactEmail}
            phone={phone}
            setPhone={setPhone}
            linkedinUrl={linkedinUrl}
            setLinkedinUrl={setLinkedinUrl}
            addContact={addContact}
            openDetails={openDetails}
            openEdit={openEdit}
            deleteContact={deleteContact}
            onFollowUp={handleFollowUp}
            inputCls={inputCls}
          />
        ) : null}

        {/* DETAILS PAGE */}
        {page === "contact_details" ? (
          <ContactDetailsPage
            selectedContact={selectedContact}
            meetings={meetings}
            loadingMeetings={loadingMeetings}
            meetingEdits={meetingEdits}
            meetingDirty={meetingDirty}
            meetingSavingId={meetingSavingId}
            meetingDeletingId={meetingDeletingId}
            meetingDraftDate={meetingDraftDate}
            setMeetingDraftDate={setMeetingDraftDate}
            meetingDraftTitle={meetingDraftTitle}
            setMeetingDraftTitle={setMeetingDraftTitle}
            addMeeting={addMeeting}
            saveMeeting={saveMeeting}
            deleteMeeting={deleteMeeting}
            setMeetingField={setMeetingField}
            loadMeetings={loadMeetings}
            openEdit={openEdit}
            deleteContact={deleteContact}
            setPage={setPage}
            setSelectedContactId={setSelectedContactId}
            importMeetingFromTranscript={importMeetingFromTranscript}
            inputCls={inputCls}
            formatDateLabel={formatDateLabel}
          />
        ) : null}

        {/* OUTREACH EMAILS PAGE */}
        {page === "outreach_emails" ? (
          <OutreachEmailsPage
            contacts={contacts}
            profile={profile}
            inputCls={inputCls}
            selectCls={selectCls}
          />
        ) : null}

        {/* JD SCORER PAGE */}
        {page === "jd_scorer" ? (
          <JdScorerPage profile={profile} inputCls={inputCls} setPage={setPage} />
        ) : null}

        {/* NETWORK WATCHLIST PAGE */}
        {page === "network_watchlist" ? (
          <WatchlistPage inputCls={inputCls} selectCls={selectCls} />
        ) : null}

        {/* ONBOARDING PAGE */}
        {page === "onboarding" ? (
          <OnboardingPage
            displayName={displayName}
            setDisplayName={setDisplayName}
            myLinkedInUrl={myLinkedInUrl}
            setMyLinkedInUrl={setMyLinkedInUrl}
            saveProfile={saveProfile}
            uploadResume={uploadResume}
            savingProfile={savingProfile}
            setPage={setPage}
            inputCls={inputCls}
            completeOnboarding={markOnboardingSeen}
          />
        ) : null}

        {/* SETTINGS PAGE */}
        {page === "settings" ? (
          <SettingsPage
            displayName={displayName}
            setDisplayName={setDisplayName}
            myLinkedInUrl={myLinkedInUrl}
            setMyLinkedInUrl={setMyLinkedInUrl}
            userPhone={userPhone}
            setUserPhone={setUserPhone}
            userCareerInterests={userCareerInterests}
            setUserCareerInterests={setUserCareerInterests}
            newEmail={newEmail}
            setNewEmail={setNewEmail}
            newPassword={newPassword}
            setNewPassword={setNewPassword}
            profile={profile}
            savingProfile={savingProfile}
            saveProfile={saveProfile}
            uploadResume={uploadResume}
            openResume={openResume}
            importFileName={importFileName}
            importRows={importRows}
            importMap={importMap}
            importing={importing}
            onPickCsv={onPickCsv}
            importIntoSupabase={importIntoSupabase}
            inputCls={inputCls}
            selectCls={selectCls}
            reparseResume={reparseResume}
            onCalendarConnect={initiateGCalOAuth}
            onCalendarDisconnect={disconnectGCal}
          />
        ) : null}

        {/* Edit Contact Modal */}
        <Modal
          title={`Edit Contact${editContact ? `: ${[editContact.first_name, editContact.last_name].filter(Boolean).join(" ")}` : ""}`}
          open={editOpen}
          onClose={() => {
            setEditOpen(false);
            setEditContact(null);
          }}
        >
          <div className="grid gap-3">
            <div className="grid grid-cols-2 gap-3">
              <input className={inputCls} placeholder="First name" value={editFirst} onChange={(e) => setEditFirst(e.target.value)} />
              <input className={inputCls} placeholder="Last name" value={editLast} onChange={(e) => setEditLast(e.target.value)} />
            </div>

            <input className={inputCls} placeholder="Company" value={editCompany} onChange={(e) => setEditCompany(e.target.value)} />
            <input className={inputCls} placeholder="Job Title" value={editTitle} onChange={(e) => setEditTitle(e.target.value)} />
            <input className={inputCls} placeholder="Email" value={editEmail} onChange={(e) => setEditEmail(e.target.value)} />
            <input className={inputCls} placeholder="Phone" value={editPhone} onChange={(e) => setEditPhone(e.target.value)} />
            <input
              className={inputCls}
              placeholder="LinkedIn URL (paste full URL text)"
              value={editLinkedIn}
              onChange={(e) => setEditLinkedIn(e.target.value)}
            />

            <div className="mt-2 flex items-center justify-end gap-2">
              <button
                onClick={() => {
                  setEditOpen(false);
                  setEditContact(null);
                }}
                className="rounded-button border border-white/10 bg-white/[0.03] px-4 py-2.5 text-sm font-medium text-white/70 transition-colors hover:bg-white/[0.06] cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={saveEdit}
                className="rounded-button bg-glow/90 px-4 py-2.5 text-sm font-semibold text-depth-0 shadow-[0_0_24px_rgba(0,229,255,0.2)] transition-all hover:bg-glow cursor-pointer"
              >
                Save changes
              </button>
            </div>
          </div>
        </Modal>
      </div>
    </div>
  );
}
