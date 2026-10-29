import type { TablesUpdate } from "@/lib/database.types";
import type { Profile } from "@/types";

export type PendingSignup = Pick<TablesUpdate<"profiles">, "full_name" | "phone" | "my_linkedin_url" | "career_interests">;

/**
 * Details to fill into a profile on load — only into fields that are still empty:
 * a password-era sign-up blob from localStorage, then the display name Clerk got from
 * Google or Microsoft.
 *
 * Only-if-empty matters. This used to treat the Clerk name as pending on every load —
 * including the reload after Settings saves — so a user who renamed themselves was
 * renamed back, and because a non-empty name also counted as "onboarded", new users
 * never saw onboarding.
 */
export function fillEmptyFields(
  row: Pick<Profile, keyof PendingSignup> | null,
  pending: PendingSignup,
  clerkName: string | undefined,
): PendingSignup {
  const source: PendingSignup = { ...pending };
  if (!source.full_name && clerkName) source.full_name = clerkName;

  const fill: PendingSignup = {};
  for (const key of ["full_name", "phone", "my_linkedin_url", "career_interests"] as const) {
    if (source[key] && !row?.[key]?.trim()) fill[key] = source[key];
  }
  return fill;
}
