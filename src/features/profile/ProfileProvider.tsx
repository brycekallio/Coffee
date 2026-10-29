import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { useSession } from "@/app/session";
import type { TablesUpdate } from "@/lib/database.types";
import { supabase } from "@/lib/supabase";
import { GCAL_OAUTH_STATE } from "@/lib/googleCalendar";
import { errorMessage, resumeStoragePath } from "@/lib/utils";
import type { Profile } from "@/types";
import * as api from "./api";
import { fillEmptyFields, type PendingSignup } from "./fillEmptyFields";
import { ProfileContext } from "./profileContext";

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
      const fill = fillEmptyFields(row, readPendingSignup(), user.name);
      if (!row) row = await api.createProfile(user.id, fill);
      else if (Object.keys(fill).length > 0) row = await api.updateProfile(user.id, fill);
      localStorage.removeItem(PENDING_SIGNUP_KEY);
      setProfile(row);
    } catch (e) {
      toast.error(errorMessage(e, "Failed to load profile."));
    }
  }, [user.id, user.name]);

  useEffect(() => {
    void fetchProfile();
  }, [fetchProfile]);

  // Google redirects back to "/?code=…&state=gcal_connect" after the Calendar consent screen.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    if (!code || params.get("state") !== GCAL_OAUTH_STATE) return;
    // Clear the params at once so a refresh doesn't replay the exchange.
    window.history.replaceState({}, "", window.location.pathname);
    supabase.functions
      .invoke("exchange-google-token", { body: { code, redirect_uri: `${window.location.origin}/` } })
      .then(({ error }) => {
        if (error) {
          toast.error("Google Calendar connection failed: " + error.message);
        } else {
          toast.success("Google Calendar connected!");
          void fetchProfile();
        }
      });
  }, [fetchProfile]);

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
        const values: TablesUpdate<"profiles"> = { resume_url: path };

        if (path.endsWith(".pdf")) {
          try {
            // pdf.js is ~120 KB gzipped; load it only when someone actually uploads.
            const { parsePdfToText } = await import("@/lib/pdfText");
            values.resume_text = await parsePdfToText(file);
          } catch (parseErr) {
            console.error("[uploadResume] PDF parse failed", parseErr);
            toast.info("Resume uploaded, but text extraction failed. You can re-parse later.");
          }
        } else {
          toast.info("Non-PDF resume uploaded. Text extraction is only available for PDF files.");
        }

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
      setProfile(
        await api.updateProfile(user.id, {
          google_calendar_token: null,
          google_calendar_refresh_token: null,
          google_calendar_token_expiry: null,
        }),
      );
      toast.success("Google Calendar disconnected.");
    } catch {
      toast.error("Failed to disconnect Google Calendar.");
    }
  }, [user.id]);

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
