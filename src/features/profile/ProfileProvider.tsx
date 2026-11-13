import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { useSession } from "@/app/session";
import type { TablesUpdate } from "@/lib/database.types";
import { supabase } from "@/lib/supabase";
import { handleGoogleCallback } from "./googleCallback";
import { clearPendingFollowUp, FOLLOW_UP_READY_EVENT, markPendingFollowUpReady } from "@/features/outreach/followUp";
import { resumeUploadValues } from "./resumeValues";
import { errorMessage, resumeStoragePath } from "@/lib/utils";
import type { Profile } from "@/types";
import * as api from "./api";
import { fillEmptyFields, type PendingSignup } from "./fillEmptyFields";
import { ProfileContext } from "./profileContext";
import { isDemoMode } from "@/demo/mode";

const PENDING_SIGNUP_KEY = "coffee_pending_signup";

function readPendingSignup(): PendingSignup {
  try {
    const raw = localStorage.getItem(PENDING_SIGNUP_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {}; // unreadable blob — ignore
  }
}

export function ProfileProvider({ children }: { children: ReactNode }) {
  const user = useSession();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [saving, setSaving] = useState(false);

  // setState only after the await, so the mount effect can call this directly.
  const fetchProfile = useCallback(async () => {
    try {
      let row = await api.getProfile(user.id);
      // The demo must not consume a real visitor's leftover sign-up details in this browser.
      const pending = isDemoMode ? {} : readPendingSignup();
      const fill = fillEmptyFields(row, pending, user.name);
      if (!row) row = await api.createProfile(user.id, fill);
      else if (Object.keys(fill).length > 0) row = await api.updateProfile(user.id, fill);
      if (!isDemoMode) localStorage.removeItem(PENDING_SIGNUP_KEY);
      setProfile(row);
    } catch (e) {
      toast.error(errorMessage(e, "Failed to load profile."));
    }
  }, [user.id, user.name]);

  useEffect(() => {
    void fetchProfile();
  }, [fetchProfile]);

  // Google redirects back to "/?code=...&state=..." after the consent screen.
  useEffect(() => {
    const search = window.location.search;
    // Ours only when Google's pair is present: code+state, or error+state (user pressed Cancel).
    // Anything else (?invite_code=, a lone ?state=) belongs to someone else and is left alone.
    const q = new URLSearchParams(search);
    if (!q.has("state") || !(q.has("code") || q.has("error"))) return;
    // Clear the params at once so a refresh doesn't replay the exchange.
    window.history.replaceState({}, "", window.location.pathname);
    void handleGoogleCallback(search, window.location.origin, (body) =>
      supabase.functions.invoke("exchange-google-token", { body }),
      user.id,
    ).then((out) => {
      // A follow-up waiting on "Connect Google Calendar" continues only when this return granted Calendar.
      try {
        if (out.kind === "connected" && out.calendar) {
          markPendingFollowUpReady(window.sessionStorage);
          window.dispatchEvent(new Event(FOLLOW_UP_READY_EVENT));
        } else if (out.kind !== "ignored") clearPendingFollowUp(window.sessionStorage);
      } catch { /* storage blocked */ }
      if (out.kind === "rejected") toast.error("That Google link didn't start here, so it was ignored. Try Connect again.");
      else if (out.kind === "failed") toast.error("Google connection failed: " + out.message);
      else if (out.kind === "notice") toast.info(out.message);
      else if (out.kind === "connected") {
        if (out.gmailSend && out.calendar) toast.success("Google connected.");
        else if (out.calendar)
          toast.warning(
            'Calendar connected, but sending email is off. Reconnect and tick "Send email on your behalf".',
            { duration: 10000 },
          );
        else if (out.gmailSend)
          toast.warning("Email sending connected, but Calendar is off. Reconnect and keep every box ticked.", {
            duration: 10000,
          });
        else toast.warning("Google connected, but nothing was allowed. Reconnect and keep every box ticked.", { duration: 10000 });
        void fetchProfile();
      }
    });
  }, [fetchProfile, user.id]);

  const saveProfile = useCallback(
    async (values: TablesUpdate<"profiles">) => {
      setSaving(true);
      try {
        setProfile(await api.updateProfile(user.id, values));
        return true;
      } catch (e) {
        toast.error(errorMessage(e, "Failed to save profile."));
        return false;
      } finally {
        setSaving(false);
      }
    },
    [user.id],
  );

  const uploadResume = useCallback(
    async (file: File) => {
      setSaving(true);
      try {
        // resume_url stores the bare object path; the bucket is private, so readers sign
        // a fresh URL (openResume) rather than fetching it directly.
        const path = await api.uploadResumeFile(user.id, file);
        const { values, isPdf } = await resumeUploadValues(
          path,
          async () => {
            // pdf.js is ~120 KB gzipped; load it only when someone actually uploads.
            const { parsePdfToText } = await import("@/lib/pdfText");
            return parsePdfToText(file);
          },
          (parseErr) => {
            console.error("[uploadResume] PDF parse failed", parseErr);
            toast.info("Resume uploaded, but text extraction failed. You can re-parse later.");
          },
        );
        if (!isPdf) toast.info("Non-PDF resume uploaded. Text extraction is only available for PDF files.");

        setProfile(await api.updateProfile(user.id, values));
        toast.success("Resume uploaded.");
      } catch (e) {
        console.error("[uploadResume] failed", e);
        toast.error(errorMessage(e, "Resume upload failed."));
      } finally {
        setSaving(false);
      }
    },
    [user.id],
  );

  const signedResumeUrl = useCallback(async () => {
    if (!profile?.resume_url) return null;
    try {
      return await api.signResumeUrl(resumeStoragePath(profile.resume_url));
    } catch (e) {
      toast.error(errorMessage(e, "Failed to access resume."));
      return null;
    }
  }, [profile?.resume_url]);

  const openResume = useCallback(async () => {
    const url = await signedResumeUrl();
    if (url) window.open(url, "_blank", "noopener,noreferrer");
  }, [signedResumeUrl]);

  const reparseResume = useCallback(async () => {
    if (!profile?.resume_url) return;
    if (!profile.resume_url.toLowerCase().endsWith(".pdf")) {
      toast.error("Re-parse is only available for PDF resumes.");
      return;
    }
    setSaving(true);
    try {
      const url = await signedResumeUrl();
      if (!url) return;
      const { parsePdfFromUrl } = await import("@/lib/pdfText");
      setProfile(await api.updateProfile(user.id, { resume_text: await parsePdfFromUrl(url) }));
      toast.success("Resume text re-parsed.");
    } catch (e) {
      toast.error(errorMessage(e, "Failed to re-parse resume."));
    } finally {
      setSaving(false);
    }
  }, [profile?.resume_url, signedResumeUrl, user.id]);

  const disconnectCalendar = useCallback(async () => {
    try {
      // The function revokes the grant at Google, then clears the tokens.
      const { error } = await supabase.functions.invoke("google-disconnect");
      if (error) throw error;
      await fetchProfile();
      toast.success("Google disconnected.");
    } catch {
      toast.error("Couldn't disconnect Google. Try again.");
    }
  }, [fetchProfile]);

  /** Durable and cross-device: the column, not localStorage, decides whether onboarding shows. */
  const completeOnboarding = useCallback(() => {
    setProfile((p) => (p && !p.onboarding_completed_at ? { ...p, onboarding_completed_at: new Date().toISOString() } : p));
    void supabase
      .from("profiles")
      .update({ onboarding_completed_at: new Date().toISOString() })
      .eq("id", user.id)
      .is("onboarding_completed_at", null)
      .then(({ error }) => {
        if (error) console.error("[completeOnboarding] could not persist", error);
      });
  }, [user.id]);

  const value = useMemo(
    () => ({
      profile,
      needsOnboarding: profile !== null && !profile.onboarding_completed_at,
      saving,
      reload: fetchProfile,
      saveProfile,
      uploadResume,
      openResume,
      reparseResume,
      disconnectCalendar,
      completeOnboarding,
    }),
    [profile, saving, fetchProfile, saveProfile, uploadResume, openResume, reparseResume, disconnectCalendar, completeOnboarding],
  );

  return <ProfileContext.Provider value={value}>{children}</ProfileContext.Provider>;
}
