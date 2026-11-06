import { supabase } from "@/lib/supabase";
import type { TablesUpdate } from "@/lib/database.types";
import type { Profile } from "@/types";

// Throw on error; see features/applications/api.ts.

/** Columns must match the Profile type in src/types.ts. */
/** Never list google_calendar_* token columns: the browser has no permission to read them. */
export const PROFILE_COLUMNS =
  "id, full_name, my_linkedin_url, resume_url, avatar_url, resume_text, phone, career_interests, onboarding_completed_at, google_connected, google_gmail_send";

/**
 * The on_auth_user_created trigger inserts a blank row per user, so this is null only
 * if that trigger didn't run; callers must UPDATE, not assume they can INSERT.
 */
export async function getProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase.from("profiles").select(PROFILE_COLUMNS).eq("id", userId).maybeSingle();
  if (error) throw error;
  return data;
}

export async function createProfile(userId: string, values: TablesUpdate<"profiles">): Promise<Profile> {
  const { data, error } = await supabase
    .from("profiles")
    .insert({ ...values, id: userId })
    .select(PROFILE_COLUMNS)
    .single();
  if (error) throw error;
  return data;
}

export async function updateProfile(userId: string, values: TablesUpdate<"profiles">): Promise<Profile> {
  const { data, error } = await supabase
    .from("profiles")
    .update(values)
    .eq("id", userId)
    .select(PROFILE_COLUMNS)
    .single();
  if (error) throw error;
  return data;
}

const RESUME_MIME: Record<string, string> = {
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};

/** Uploads to the private `resumes` bucket and returns the bare object path. */
export async function uploadResumeFile(userId: string, file: File): Promise<string> {
  const ext = file.name.split(".").pop()?.toLowerCase() || "pdf";
  const path = `${userId}/resume.${ext}`;
  // The bucket only accepts PDF/Word mime types; some browsers report "" for .doc/.docx.
  const contentType = file.type || RESUME_MIME[ext] || "application/pdf";
  const { error } = await supabase.storage.from("resumes").upload(path, file, { upsert: true, contentType });
  if (error) throw error;
  return path;
}

export async function signResumeUrl(path: string, expiresInSeconds = 3600): Promise<string> {
  const { data, error } = await supabase.storage.from("resumes").createSignedUrl(path, expiresInSeconds);
  if (error) throw error;
  return data.signedUrl;
}
