/**
 * Bridges a Clerk identity to the Supabase row that owns this person's data.
 *
 * Clerk's `sub` is its own user id ("user_2abc..."), but every row in this
 * database is keyed on a Supabase UUID that predates Clerk. `link_clerk_identity`
 * binds the two, matched on the email address Clerk verified, and returns the
 * UUID. That is what makes thirteen existing accounts keep their contacts,
 * applications and meetings rather than finding an empty app beside their data.
 *
 * It is called on every sign-in, not just the first. The function is idempotent,
 * and a user who signs in on a new device or after clearing storage should not
 * depend on having been here before.
 */
import { supabase } from "./supabase";

export interface AppUser {
  id: string;
  email: string;
  name?: string;
  avatar_url?: string;
}

export class NoAccountError extends Error {
  constructor() {
    super("No account is linked to this email address.");
    this.name = "NoAccountError";
  }
}

export async function linkIdentity(clerk: {
  email: string;
  name?: string;
  avatar_url?: string;
}): Promise<AppUser> {
  const { data, error } = await supabase.rpc("link_clerk_identity");
  if (error) throw error;

  // null means no row holds this email -- a genuinely new user, who needs
  // provisioning rather than linking.
  if (!data) throw new NoAccountError();

  return { id: data as string, email: clerk.email, name: clerk.name, avatar_url: clerk.avatar_url };
}

/**
 * The current user's Supabase id, for the handful of places that insert rows
 * without the session threaded down to them.
 *
 * Cached for the life of the page: the mapping cannot change while signed in,
 * and without this every insert would cost an extra round trip. Cleared on sign
 * out so a second user on the same browser never inherits the first one's id.
 */
let cachedId: string | null = null;

export async function currentUserId(): Promise<string | null> {
  if (cachedId) return cachedId;
  const { data, error } = await supabase.rpc("link_clerk_identity");
  if (error || !data) return null;
  cachedId = data as string;
  return cachedId;
}

export function clearCachedUserId(): void {
  cachedId = null;
}
