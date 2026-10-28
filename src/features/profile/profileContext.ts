import { createContext, useContext } from "react";
import type { TablesUpdate } from "@/lib/database.types";
import type { Profile } from "@/types";

/**
 * The signed-in user's profile row and everything that writes to it. Read by the nav
 * (display name), Settings, Onboarding, Outreach and the JD scorer.
 */
export interface ProfileValue {
  /** Null until the first load finishes. */
  profile: Profile | null;
  /** True once loaded if the user hasn't finished (or skipped) onboarding. */
  needsOnboarding: boolean;
  /** True while a save, upload or re-parse is in flight. */
  saving: boolean;
  reload: () => Promise<void>;
  /** Partial update; resolves false (after a toast) if it failed. */
  saveProfile: (values: TablesUpdate<"profiles">) => Promise<boolean>;
  uploadResume: (file: File) => Promise<void>;
  openResume: () => Promise<void>;
  reparseResume: () => Promise<void>;
  disconnectCalendar: () => Promise<void>;
  completeOnboarding: () => void;
}

export const ProfileContext = createContext<ProfileValue | null>(null);

export function useProfile(): ProfileValue {
  const value = useContext(ProfileContext);
  if (!value) throw new Error("useProfile() called outside <ProfileProvider>");
  return value;
}
